const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { createManualSendHandler } = require("./manual-send");
const { clearConversationSourceCache } = require("./conversation-source");

const CENTER = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";

/** Base en mémoire : juste ce que l'envoi manuel lit et écrit. */
function fakeDb({ seyaOff = true, conversations = [] } = {}) {
  const db = {
    center: {
      id: CENTER,
      name: "JFG Clinic Venelles",
      settings: { seya: { whatsappAgentEnabled: !seyaOff, conversations } },
    },
    lead: {
      id: LEAD,
      center_id: CENTER,
      status: "Nouveau",
      clients: { first_name: "Salma", last_name: "Fabre", phone: "06 11 22 33 44" },
      services: { name: "Épilation Laser" },
      campaigns: null,
    },
    events: [],
    leadUpdates: [],
  };

  function table(name) {
    const filters = {};
    let mode = "select";
    let patch = null;
    const builder = {
      select: () => builder,
      eq: (column, value) => {
        filters[column] = value;
        return builder;
      },
      insert: async (row) => {
        if (name === "lead_events") db.events.push(row);
        return { error: null };
      },
      upsert: async () => ({ error: null }),
      update: (value) => {
        mode = "update";
        patch = value;
        return builder;
      },
      maybeSingle: async () => {
        if (name === "leads") return { data: filters.id === LEAD ? db.lead : null, error: null };
        if (name === "centers" && mode === "update") {
          if (JSON.stringify(filters.settings) !== JSON.stringify(db.center.settings)) {
            return { data: null, error: null };
          }
          db.center.settings = patch.settings;
          return { data: { id: CENTER }, error: null };
        }
        if (name === "centers") return { data: db.center, error: null };
        if (name === "center_members") {
          return { data: filters.profile_id === "staff-1" ? { profile_id: "staff-1" } : null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve, reject) => {
        if (name === "leads" && mode === "update") db.leadUpdates.push(patch);
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    db,
    from: table,
    auth: {
      getUser: async (token) =>
        token === "good-token"
          ? { data: { user: { id: "staff-1" } }, error: null }
          : { data: { user: null }, error: { message: "invalid" } },
    },
  };
}

async function call(supabase, { token = "good-token", body = { leadId: LEAD, text: "Bonjour Salma, on vous rappelle demain ?" }, sendResult } = {}) {
  const sent = [];
  const handler = createManualSendHandler({
    createSupabase: () => supabase,
    send: async (phone, text, extras) => {
      sent.push({ phone, text, extras });
      return sendResult || { sent: true, via: "text" };
    },
  });
  const res = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  await handler(
    { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body },
    res,
  );
  return { res, sent };
}

test.beforeEach(() => clearConversationSourceCache());

test("sans connexion : refusé, rien n'est envoyé", async () => {
  const supabase = fakeDb();
  const { res, sent } = await call(supabase, { token: "" });
  assert.equal(res.statusCode, 401);
  assert.equal(sent.length, 0);
});

test("Seya éteinte : le WhatsApp de l'équipe part et la conversation apparaît dans Seya CRM", async () => {
  const supabase = fakeDb({ seyaOff: true });
  const { res, sent } = await call(supabase);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, "06 11 22 33 44");
  assert.equal(sent[0].extras.centerName, "JFG Clinic Venelles");

  const threads = supabase.db.center.settings.seya.conversations;
  assert.equal(threads.length, 1);
  assert.equal(threads[0].leadId, LEAD);
  assert.equal(threads[0].messages.length, 1, "pas de message d'accueil automatique");
  assert.equal(threads[0].messages[0].author, "centre");
  assert.equal(threads[0].messages[0].text, "Bonjour Salma, on vous rappelle demain ?");
  assert.equal(threads[0].status, "En cours");
  assert.equal(supabase.db.center.settings.seya.whatsappAgentEnabled, false, "Seya reste éteinte");

  assert.match(supabase.db.events[0].note, /^WhatsApp \(centre\) : Bonjour Salma/);
  assert.equal(supabase.db.leadUpdates[0].status, "Message WhatsApp envoyé");
});

test("conversation existante : le message s'ajoute au même fil, sans doublon de conversation", async () => {
  const existing = {
    id: LEAD,
    leadId: LEAD,
    centerId: CENTER,
    phone: "0611223344",
    status: "En cours",
    messages: [{ id: "m1", author: "lead", text: "Bonjour", at: "2026-10-28T08:00:00.000Z" }],
  };
  const supabase = fakeDb({ conversations: [existing] });
  const { res } = await call(supabase);
  assert.equal(res.statusCode, 200);
  const threads = supabase.db.center.settings.seya.conversations;
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0].messages.map((item) => item.author), ["lead", "centre"]);
});

test("hors fenêtre de 24 h : le texte réellement parti (modèle Meta) est celui enregistré", async () => {
  const supabase = fakeDb();
  const { res } = await call(supabase, {
    sendResult: { sent: true, via: "template", template: "seya_accueil", text: "Bonjour Salma, merci pour votre demande." },
  });
  assert.equal(res.body.via, "template");
  const [thread] = supabase.db.center.settings.seya.conversations;
  assert.equal(thread.messages[0].text, "Bonjour Salma, merci pour votre demande.");
});

test("échec Meta : erreur claire, rien d'enregistré", async () => {
  const supabase = fakeDb();
  const { res } = await call(supabase, {
    sendResult: { sent: false, reason: "send_failed", error: "Ce numéro n’a pas WhatsApp, ou le format est invalide." },
  });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /pas WhatsApp/);
  assert.equal(supabase.db.center.settings.seya.conversations.length, 0);
});
