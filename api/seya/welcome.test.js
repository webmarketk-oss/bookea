const test = require("node:test");
const assert = require("node:assert/strict");

const { isActiveWhatsAppThread, welcomeNewLead } = require("./welcome");
const { isSeyaOff, isSeyaWelcomeOff, writeSeyaConversations } = require("./store");

function mockCenterClient(seya) {
  let stored = { seya };
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
