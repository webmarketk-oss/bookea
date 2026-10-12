const test = require("node:test");
const assert = require("node:assert/strict");

const { isActiveWhatsAppThread, welcomeNewLead } = require("./welcome");
const { isSeyaOff, isSeyaWelcomeOff, writeSeyaConversations } = require("./store");

function mockCenterClient(seya, extraSettings = {}) {
  let stored = { seya, ...extraSettings };
  return {
    stored: () => stored,
    from(table) {
      if (table !== "centers") {
        return { insert: async () => ({ error: null }) };
      }
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { settings: stored },
                  error: null,
                }),
              };
            },
          };
        },
        update(payload) {
          return {
            eq: async () => {
              stored = payload.settings;
              return { error: null };
            },
          };
        },
      };
    },
  };
}

test("off : aucun accueil WhatsApp, même si le message auto est encore on", () => {
  assert.equal(isSeyaOff({ whatsappAgentEnabled: false }), true);
  assert.equal(isSeyaWelcomeOff({ whatsappAgentEnabled: false, autoMessageOnNewLead: true }), true);
  assert.equal(isSeyaWelcomeOff({ whatsappAgentEnabled: true, autoMessageOnNewLead: false }), true);
  assert.equal(isSeyaWelcomeOff({ whatsappAgentEnabled: true, autoMessageOnNewLead: true }), false);
  assert.equal(isSeyaWelcomeOff({}), false);
});

test("écrire les conversations ne doit pas recréer un flag manquant comme une activation", () => {
  const before = { whatsappAgentEnabled: false, conversations: [] };
  assert.equal(isSeyaOff({ ...before, conversations: [{ leadId: "x" }] }), true);
});

test("un lead n’est pas contacté tout de suite : le WhatsApp est programmé dans 4 min", async () => {
  const { WELCOME_DELAY_MS, isWelcomeDue } = require("./welcome");
  const now = new Date("2026-09-29T08:00:00Z");
  const supabase = mockCenterClient({
    whatsappAgentEnabled: true,
    autoMessageOnNewLead: true,
    conversations: [],
  });
  const result = await welcomeNewLead(
    supabase,
    { id: "center-1", name: "JFG Clinique Clermont" },
    {
      leadId: "lead-1",
      phone: "0612345678",
      firstName: "Léa",
      treatment: "Soin minceur",
    },
    now,
  );
  assert.equal(result.sent, false);
  assert.equal(result.skipped, "scheduled");
  const queued = supabase.stored().seya.conversations[0];
  assert.equal(queued.status, "À envoyer");
  assert.equal(
    Date.parse(queued.welcomeSendAt) - now.getTime(),
    WELCOME_DELAY_MS,
  );
  assert.equal(isWelcomeDue(queued, now), false);
  assert.equal(
    isWelcomeDue(queued, new Date(now.getTime() + WELCOME_DELAY_MS)),
    true,
  );
});

test("au bout de 4 min le message part, pas avant", async () => {
  const { sendDueWelcomes, WELCOME_DELAY_MS } = require("./welcome");
  const now = new Date("2026-09-29T08:00:00Z");
  const dueAt = new Date(now.getTime() + WELCOME_DELAY_MS);
  const conversation = {
    leadId: "lead-1",
    phone: "0612345678",
    firstName: "Léa",
    treatment: "Soin minceur",
    status: "À envoyer",
    welcomeSendAt: dueAt.toISOString(),
    messages: [{ author: "seya", text: "Bonjour Léa, c’est Seya." }],
  };
  const supabase = mockCenterClient({
    whatsappAgentEnabled: true,
    autoMessageOnNewLead: true,
    conversations: [conversation],
  });
  const sends = [];
  const early = await sendDueWelcomes(
    supabase,
    { id: "center-1", name: "JFG" },
    async () => {
      sends.push("early");
      return { sent: true, via: "whatsapp" };
    },
    now,
  );
  assert.equal(early.length, 0);
  assert.equal(sends.length, 0);

  const due = await sendDueWelcomes(
    supabase,
    { id: "center-1", name: "JFG" },
    async () => {
      sends.push("due");
      return { sent: true, via: "whatsapp" };
    },
    dueAt,
  );
  assert.equal(due.length, 1);
  assert.deepEqual(sends, ["due"]);
  assert.equal(supabase.stored().seya.conversations[0].status, "En cours");
  assert.equal(supabase.stored().seya.conversations[0].welcomeSendAt, null);
});

test("le CRM affiche le texte du modèle WhatsApp réellement envoyé", async () => {
  const { sendDueWelcomes } = require("./welcome");
  const now = new Date("2026-09-29T08:00:00Z");
  const supabase = mockCenterClient({
    whatsappAgentEnabled: true,
    autoMessageOnNewLead: true,
    conversations: [
      {
        leadId: "lead-1",
        phone: "0612345678",
        firstName: "Léa",
        campaign: "Relance minceur",
        status: "À envoyer",
        welcomeSendAt: now.toISOString(),
        messages: [
          {
            id: "m1",
            author: "seya",
            at: now.toISOString(),
            text: "Bonjour Léa, vous avez fait une demande pour notre offre.",
          },
        ],
      },
    ],
  });
  await sendDueWelcomes(
    supabase,
    { id: "center-1", name: "JFG" },
    async () => ({
      sent: true,
      via: "template",
      template: "seya_relance_minceur_bilan_offert",
      text: "Bonjour Léa 😊 Ici Seya AI du centre JFG. Vous nous aviez contactés il y a quelque temps.",
    }),
    now,
  );
  const [stored] = supabase.stored().seya.conversations;
  assert.equal(
    stored.messages[0].text,
    "Bonjour Léa 😊 Ici Seya AI du centre JFG. Vous nous aviez contactés il y a quelque temps.",
  );
});

test("un lead n’est pas contacté si Seya est off en base, même si le webhook a un vieux settings", async () => {
  const supabase = mockCenterClient({
    whatsappAgentEnabled: false,
    autoMessageOnNewLead: true,
    conversations: [],
  });
  const result = await welcomeNewLead(
    supabase,
    {
      id: "center-1",
      name: "JFG Clinique Clermont",
      settings: { seya: { whatsappAgentEnabled: true, autoMessageOnNewLead: true } },
    },
    {
      leadId: "lead-1",
      phone: "0612345678",
      firstName: "Léa",
      treatment: "Soin minceur",
    },
  );
  assert.equal(result.sent, false);
  assert.equal(result.skipped, "disabled");
  assert.equal(supabase.stored().seya.whatsappAgentEnabled, false);
});

test("sauver une conversation ne réactive pas Seya", async () => {
  const supabase = mockCenterClient({
    whatsappAgentEnabled: false,
    conversations: [],
  });
  await writeSeyaConversations(supabase, "center-1", [{ leadId: "lead-1" }]);
  assert.equal(supabase.stored().seya.whatsappAgentEnabled, false);
  assert.equal(supabase.stored().seya.conversations[0].leadId, "lead-1");
});

test("écrire un accueil ne doit pas effacer un fil WhatsApp déjà en base", async () => {
  const supabase = mockCenterClient({
    whatsappAgentEnabled: true,
    conversations: [
      {
        phone: "0611223344",
        firstName: "Camille",
        messages: [
          { author: "seya", text: "Bonjour", at: "2026-09-20T10:00:00.000Z" },
          { author: "lead", text: "Oui", at: "2026-09-20T10:01:00.000Z" },
        ],
      },
    ],
  });
  await writeSeyaConversations(supabase, "center-1", [
    {
      leadId: "lead-new",
      phone: "0699999999",
      messages: [{ author: "seya", text: "ouverture" }],
    },
  ]);
  const stored = supabase.stored().seya.conversations;
  assert.ok(stored.some((item) => item.phone === "0611223344"));
  assert.ok(stored.some((item) => item.leadId === "lead-new"));
});

test("un fil de plus de 24 h n’est plus considéré comme actif", () => {
  const stale = {
    status: "En cours",
    updatedAt: new Date(Date.now() - 40 * 3600000).toISOString(),
    messages: [
      {
        author: "seya",
        text: "Bonjour",
        at: new Date(Date.now() - 40 * 3600000).toISOString(),
      },
    ],
  };
  assert.equal(isActiveWhatsAppThread(stale), false);
});

test("un fil récent reste bloqué pour éviter un second accueil", () => {
  const hot = {
    status: "En cours",
    updatedAt: new Date().toISOString(),
    messages: [
      {
        author: "lead",
        text: "Ok",
        at: new Date().toISOString(),
      },
    ],
  };
  assert.equal(isActiveWhatsAppThread(hot), true);
});

test("un fil fermé peut être réouvert à la réinscription", () => {
  const closed = {
    status: "Pas intéressé",
    updatedAt: new Date().toISOString(),
    messages: [
      {
        author: "lead",
        text: "Non merci",
        at: new Date().toISOString(),
      },
    ],
  };
  assert.equal(isActiveWhatsAppThread(closed), false);
});

test("un vrai fil WhatsApp n’est pas évincé par 90 ouvertures automatiques", () => {
  const { persistableConversations } = require("./agent");
  const live = {
    leadId: "live-collegue",
    phone: "0611223344",
    messages: [
      { author: "seya", text: "hello", at: "2026-09-28T12:00:00.000Z" },
      { author: "lead", text: "prix", at: "2026-09-29T09:45:00.000Z" },
    ],
    updatedAt: "2026-09-28T12:31:00.000Z",
  };
  const synthetics = Array.from({ length: 90 }, (_, index) => ({
    leadId: `new-${index}`,
    messages: [
      {
        author: "seya",
        text: "ouverture",
        at: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  }));
  const kept = persistableConversations([...synthetics, live]);
  assert.ok(kept.some((item) => item.leadId === "live-collegue"));
});

test("plafond Seya : une nouvelle conversation est bloquée", async () => {
  const supabase = mockCenterClient(
    {
      whatsappAgentEnabled: true,
      autoMessageOnNewLead: true,
      conversations: [
        { leadId: "lead-1", phone: "0611111111" },
        { leadId: "lead-2", phone: "0622222222" },
      ],
    },
    { seyaQuota: { conversationLimit: 2 } },
  );
  const result = await welcomeNewLead(
    supabase,
    { id: "center-1", name: "JFG Clinique Clermont" },
    {
      leadId: "lead-3",
      phone: "0633333333",
      firstName: "Léa",
    },
  );
  assert.equal(result.skipped, "conversation_cap");
  assert.equal(supabase.stored().seya.conversations.length, 2);
});

test("plafond Seya : un fil existant continue", async () => {
  const supabase = mockCenterClient(
    {
      whatsappAgentEnabled: true,
      autoMessageOnNewLead: true,
      conversations: [{ leadId: "lead-1", phone: "0612345678" }],
    },
    { seyaQuota: { conversationLimit: 1 } },
  );
  const result = await welcomeNewLead(
    supabase,
    { id: "center-1", name: "JFG Clinique Clermont" },
    {
      leadId: "lead-1",
      phone: "0612345678",
      firstName: "Léa",
    },
  );
  assert.equal(result.skipped, "scheduled");
  assert.equal(supabase.stored().seya.conversations.length, 1);
});

test("le 1er WhatsApp part avec le modèle choisi sur la ligne d’offre du centre", async () => {
  const { sendDueWelcomes } = require("./welcome");
  const now = new Date("2026-10-12T08:00:00Z");
  const supabase = mockCenterClient({
    whatsappAgentEnabled: true,
    autoMessageOnNewLead: true,
    offerMaps: [
      { match: "Laser", label: "bilan laser + test offerts", template: "seya_accueil_laser_gaillard" },
      { match: "minceur", label: "Bilan minceur complet + séance découverte offerts" },
    ],
    conversations: [
      {
        leadId: "lead-laser",
        phone: "0612345678",
        firstName: "Léa",
        campaign: "Laser",
        treatment: "Épilation définitive",
        status: "À envoyer",
        welcomeSendAt: now.toISOString(),
        messages: [{ author: "seya", text: "Bonjour Léa, c’est Seya." }],
      },
      {
        leadId: "lead-minceur",
        phone: "0698765432",
        firstName: "Anne",
        campaign: "minceur",
        treatment: "Soin minceur",
        status: "À envoyer",
        welcomeSendAt: now.toISOString(),
        messages: [{ author: "seya", text: "Bonjour Anne, c’est Seya." }],
      },
    ],
  });
  const extras = {};
  await sendDueWelcomes(
    supabase,
    { id: "center-gaillard", name: "JFG Clinic Gaillard" },
    async (phone, _text, options) => {
      extras[phone] = options;
      return { sent: true, via: "template" };
    },
    now,
  );
  assert.equal(extras["0612345678"].templateName, "seya_accueil_laser_gaillard");
  assert.equal(extras["0698765432"].templateName, "");
});
