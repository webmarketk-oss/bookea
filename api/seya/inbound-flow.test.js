const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const COLUMNS = {
  centers: ["id", "name", "email", "settings", "address_line1", "city", "postal_code", "slug"],
  clients: [
    "id",
    "center_id",
    "first_name",
    "last_name",
    "phone",
    "email",
    "updated_at",
    "merged_into_client_id",
    "status",
  ],
  leads: [
    "id",
    "center_id",
    "client_id",
    "status",
    "next_action",
    "recall_date",
    "latest_comment",
    "service_id",
    "campaign_id",
    "updated_at",
    "last_activity_at",
    "created_at",
    "amount_cure_ttc",
  ],
  services: ["id", "name", "center_id"],
  rooms: ["id", "name", "center_id"],
  appointments: [
    "appointment_date",
    "starts_at",
    "duration_minutes",
    "status",
    "room_id",
    "center_id",
  ],
  lead_events: ["id", "center_id", "lead_id", "event_type", "note"],
  campaigns: ["id", "name"],
};

function columnError(table, column) {
  return { code: "42703", message: `column ${table}.${column} does not exist` };
}

function topLevelColumns(select) {
  const cols = [];
  let depth = 0;
  let current = "";
  for (const char of String(select || "*")) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      cols.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) cols.push(current.trim());
  return cols;
}

function createFakeDb(seed) {
  const db = JSON.parse(JSON.stringify(seed));
  const failures = { centersSelect: 0, clientsSelect: 0 };

  function from(table) {
    const state = { table, filters: [], select: "*", mode: "select", payload: null, limit: null };
    const known = COLUMNS[table] || [];

    function invalidColumn() {
      for (const col of topLevelColumns(state.select)) {
        if (col === "*" || col.includes("(")) continue;
        if (!known.includes(col)) return col;
      }
      for (const filter of state.filters) {
        if (filter.column && !known.includes(filter.column)) return filter.column;
        for (const cond of filter.or || []) {
          if (!known.includes(cond.column)) return cond.column;
        }
      }
      return null;
    }

    function matches(row) {
      return state.filters.every((filter) => {
        if (filter.op === "eq") return String(row[filter.column]) === String(filter.value);
        if (filter.op === "is") return row[filter.column] == null;
        if (filter.op === "in") return filter.value.map(String).includes(String(row[filter.column]));
        if (filter.op === "gte") return String(row[filter.column] || "") >= String(filter.value);
        if (filter.op === "or") {
          return filter.or.some((cond) => {
            const value = String(row[cond.column] || "");
            if (cond.op === "eq") return value === cond.value;
            if (cond.op === "ilike") return value.includes(cond.value.replace(/%/g, ""));
            return false;
          });
        }
        return true;
      });
    }

    function withJoins(row) {
      const out = { ...row };
      for (const col of topLevelColumns(state.select)) {
        const join = col.match(/^(\w+)\(/);
        if (!join) continue;
        if (join[1] === "clients") {
          out.clients = (db.clients || []).find((item) => item.id === row.client_id) || null;
        } else {
          out[join[1]] = null;
        }
      }
      return out;
    }

    function run() {
      if (state.mode === "select") {
        const byId = state.filters.some((filter) => filter.op === "eq" && filter.column === "id");
        if (table === "centers" && byId && failures.centersSelect > 0) {
          failures.centersSelect -= 1;
          return { data: null, error: { message: "fetch failed (temporaire)" } };
        }
        if (table === "clients" && failures.clientsSelect > 0) {
          failures.clientsSelect -= 1;
          return { data: null, error: { message: "fetch failed (temporaire)" } };
        }
      }
      const bad = invalidColumn();
      if (bad) return { data: null, error: columnError(table, bad) };
      const rows = (db[table] = db[table] || []);
      if (state.mode === "insert") {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        rows.push(...list.map((item) => ({ id: `${table}-${rows.length + 1}`, ...item })));
        return { data: null, error: null };
      }
      if (state.mode === "update") {
        for (const row of rows.filter(matches)) Object.assign(row, JSON.parse(JSON.stringify(state.payload)));
        return { data: null, error: null };
      }
      let found = rows.filter(matches).map(withJoins);
      if (state.limit != null) found = found.slice(0, state.limit);
      return { data: JSON.parse(JSON.stringify(found)), error: null };
    }

    const builder = {
      select(cols) {
        if (state.mode === "select") state.select = cols || "*";
        return builder;
      },
      eq(column, value) {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      is(column, value) {
        state.filters.push({ op: "is", column, value });
        return builder;
      },
      in(column, value) {
        state.filters.push({ op: "in", column, value });
        return builder;
      },
      gte(column, value) {
        state.filters.push({ op: "gte", column, value });
        return builder;
      },
      or(expr) {
        const or = String(expr)
          .split(",")
          .map((part) => {
            const [column, op, ...rest] = part.split(".");
            return { column, op, value: rest.join(".") };
          });
        state.filters.push({ op: "or", or });
        return builder;
      },
      order() {
        return builder;
      },
      limit(count) {
        state.limit = count;
        return builder;
      },
      insert(payload) {
        state.mode = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload) {
        state.mode = "update";
        state.payload = payload;
        return builder;
      },
      maybeSingle() {
        const result = run();
        return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
      },
      single() {
        const result = run();
        return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
      },
      then(resolve, reject) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return builder;
  }

  return { from, db, failures };
}

let currentDb = null;
const supabasePath = require.resolve("@supabase/supabase-js");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { createClient: () => currentDb },
};

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.WHATSAPP_TOKEN = "test";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
delete process.env.OPENAI_API_KEY;
delete process.env.BREVO_API_KEY;

const handler = require(path.join(__dirname, "whatsapp.js"));

const CENTER_ID = "center-gaillard";
const PHONE = "33612345678";
const NOW = Date.now();

function minutesAgo(minutes) {
  return new Date(NOW - minutes * 60000).toISOString();
}

function welcomeThread(overrides = {}) {
  return {
    id: "lead-1",
    leadId: "lead-1",
    centerId: CENTER_ID,
    firstName: "Tst",
    phone: "+33612345678",
    treatment: "Soin minceur",
    campaign: "minceur",
    offerLabel: "bilan minceur complet + séance découverte d’environ 20 minutes offerts",
    status: "En cours",
    qualification: { need: "Soin minceur", zone: "", delay: "", availability: "" },
    proposedSlots: [],
    bookingState: {},
    messages: [
      {
        id: "m-welcome",
        author: "seya",
        at: minutesAgo(1),
        text: "Bonjour Tst 😊 Je suis Seya du centre JFG Clinic Gaillard. Vous avez fait une demande pour notre offre bilan minceur complet + séance découverte d’environ 20 minutes offerts. Qu’aimeriez-vous améliorer au niveau de votre silhouette et sur quelle zone ?",
      },
    ],
    updatedAt: minutesAgo(1),
    ...overrides,
  };
}

function seed(thread = welcomeThread(), seyaOverrides = {}) {
  return {
    centers: [
      {
        id: CENTER_ID,
        name: "JFG Clinic Gaillard",
        slug: "jfg-clinic-gaillard",
        email: "",
        address_line1: "1 rue du Centre",
        city: "Gaillard",
        postal_code: "74240",
        settings: {
          seya: {
            whatsappAgentEnabled: true,
            seyaMission: "qualify_callback",
            offerMaps: [
              {
                match: "minceur",
                label: "Bilan minceur complet + séance découverte d’environ 20 minutes offerts",
                template: "seya_acceuil_minceur",
              },
            ],
            conversations: thread ? [thread] : [],
            ...seyaOverrides,
          },
        },
      },
    ],
    clients: [
      {
        id: "client-1",
        center_id: CENTER_ID,
        first_name: "Tst",
        last_name: "",
        phone: "+33612345678",
        updated_at: minutesAgo(2),
        merged_into_client_id: null,
      },
    ],
    leads: [
      {
        id: "lead-1",
        center_id: CENTER_ID,
        client_id: "client-1",
        status: "Message WhatsApp envoyé",
        service_id: null,
        updated_at: minutesAgo(2),
        last_activity_at: minutesAgo(2),
      },
    ],
    services: [],
    rooms: [],
    appointments: [],
    lead_events: [],
  };
}

function installMeta({ failSends = 0 } = {}) {
  const sent = [];
  const attempts = { sends: 0 };
  let remainingFailures = failSends;
  global.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("graph.facebook.com") && target.endsWith("/messages")) {
      attempts.sends += 1;
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return new Response(
          JSON.stringify({ error: { code: 1, message: "Service temporarily unavailable" } }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      const body = JSON.parse(init.body || "{}");
      sent.push(body);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target.includes("graph.facebook.com")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { sent, attempts };
}

function webhook(text, id) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from: PHONE, id, type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

async function post(body) {
  const res = {
    statusCode: 0,
    payload: null,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler({ method: "POST", query: {}, body, headers: {} }, res);
  return res;
}

function storedThread() {
  return currentDb.db.centers[0].settings.seya.conversations.find(
    (item) => item.leadId === "lead-1",
  );
}

function textsSent(sent) {
  return sent.map((item) => item.text?.body || `[template ${item.template?.name}]`);
}

const SLOT_PUSH = /cr[ée]neau|disponibilit|quel jour|rendez-vous le|à \d{1,2}h/i;

test("leads n’a pas de colonne phone : l’ancien code jetait 42703 avant toute réponse", async () => {
  currentDb = createFakeDb(seed());
  const { data, error } = await currentDb.from("leads").select("id,phone").limit(1);
  assert.equal(data, null);
  assert.equal(error.code, "42703");
});

test("« Les jambes » après l’accueil : Seya répond, qualifie, sans créneau ni pause", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta();
  const res = await post(webhook("Les jambes", "wamid.in.1"));

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.results[0].sent, true, JSON.stringify(res.payload.results[0]));
  assert.equal(res.payload.results[0].route, "crm");
  assert.equal(meta.sent.length, 1);
  const reply = textsSent(meta.sent)[0];
  assert.ok(reply.trim().length > 10, reply);
  assert.doesNotMatch(reply, SLOT_PUSH, reply);

  const thread = storedThread();
  const lastTwo = thread.messages.slice(-2);
  assert.equal(lastTwo[0].author, "lead");
  assert.equal(lastTwo[0].text, "Les jambes");
  assert.equal(lastTwo[1].author, "seya");
  assert.equal(lastTwo[1].delivery, "sent");
  assert.equal(lastTwo[1].waId, "wamid.1");
  assert.equal(thread.sendError, null);
  assert.ok(!thread.leadPause, "pas de pause");
  assert.doesNotMatch(String(thread.status), /ferm|pas int[ée]ress/i);
  console.log("Réponse à « Les jambes » :", reply);
});

test("« Quel est le tarif ? » reçoit une réponse", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta();
  const res = await post(webhook("Quel est le tarif ?", "wamid.in.2"));
  assert.equal(res.payload.results[0].sent, true);
  assert.equal(meta.sent.length, 1);
  console.log("Réponse au tarif :", textsSent(meta.sent)[0]);
});

test("deux messages rapprochés : deux réponses, dans l’ordre, sans doublon", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta();
  const [first, second] = await Promise.all([
    post(webhook("Les jambes", "wamid.in.3")),
    post(webhook("Et le ventre aussi", "wamid.in.4")),
  ]);
  assert.equal(first.payload.results[0].sent, true);
  assert.equal(second.payload.results[0].sent, true);
  assert.equal(meta.sent.length, 2);
  const [a, b] = textsSent(meta.sent);
  assert.notEqual(a.trim(), b.trim());
  const leads = storedThread().messages.filter((item) => item.author === "lead").map((item) => item.text);
  assert.deepEqual(leads, ["Les jambes", "Et le ventre aussi"]);
});

test("nouveau message après 3 jours d’inactivité : Seya répond", async () => {
  const old = welcomeThread({
    updatedAt: minutesAgo(3 * 24 * 60),
    messages: [{ ...welcomeThread().messages[0], at: minutesAgo(3 * 24 * 60) }],
  });
  currentDb = createFakeDb(seed(old));
  const meta = installMeta();
  const res = await post(webhook("Les jambes", "wamid.in.5"));
  assert.equal(res.payload.results[0].sent, true);
  assert.equal(meta.sent.length, 1);
});

test("webhook reçu deux fois : une seule réponse", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta();
  await post(webhook("Les jambes", "wamid.in.6"));
  const again = await post(webhook("Les jambes", "wamid.in.6"));
  assert.equal(again.payload.results[0].skipped, "duplicate");
  assert.equal(meta.sent.length, 1);
});

test("erreur temporaire Meta : nouvel essai, un seul message délivré, marqué envoyé après confirmation", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta({ failSends: 1 });
  const res = await post(webhook("Les jambes", "wamid.in.7"));
  assert.equal(res.payload.results[0].sent, true);
  assert.equal(meta.attempts.sends, 2);
  assert.equal(meta.sent.length, 1);
  assert.equal(storedThread().messages.at(-1).delivery, "sent");
});

test("Meta en panne durable : la réponse est marquée échouée, pas envoyée, et l’alerte remonte", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta({ failSends: 10 });
  const res = await post(webhook("Les jambes", "wamid.in.8"));
  assert.equal(res.payload.results[0].sent, false);
  assert.equal(meta.sent.length, 0);
  const thread = storedThread();
  assert.equal(thread.messages.at(-1).delivery, "failed");
  assert.match(String(thread.sendError), /n’a pas pu envoyer/);
});

test("erreur temporaire de l’IA : la réponse de secours part quand même", async () => {
  currentDb = createFakeDb(seed());
  const meta = installMeta();
  const baseFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes("api.openai.com")) {
      return new Response(JSON.stringify({ error: { message: "bad request" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return baseFetch(url, init);
  };
  process.env.OPENAI_API_KEY = "test";
  try {
    const res = await post(webhook("Les jambes", "wamid.in.9"));
    assert.equal(res.payload.results[0].sent, true);
    assert.equal(meta.sent.length, 1);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test("erreur temporaire base : une reprise, puis réponse unique", async () => {
  currentDb = createFakeDb(seed());
  currentDb.failures.centersSelect = 1;
  const meta = installMeta();
  const res = await post(webhook("Les jambes", "wamid.in.10"));
  assert.equal(res.payload.results[0].sent, true, JSON.stringify(res.payload.results[0]));
  assert.equal(meta.sent.length, 1);
});

test("recherche CRM en échec : Seya retrouve le fil existant et répond", async () => {
  currentDb = createFakeDb(seed());
  currentDb.failures.clientsSelect = 5;
  const meta = installMeta();
  const res = await post(webhook("Les jambes", "wamid.in.11"));
  assert.equal(res.payload.results[0].route, "thread");
  assert.equal(res.payload.results[0].sent, true);
  assert.equal(meta.sent.length, 1);
});

test("panne persistante : le message est enregistré avec une alerte, rien n’est ignoré en silence", async () => {
  currentDb = createFakeDb(seed());
  currentDb.failures.centersSelect = 2;
  const meta = installMeta();
  const res = await post(webhook("Les jambes", "wamid.in.12"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.results[0].error, "inbound_failed");
  assert.equal(meta.sent.length, 0);
  const thread = storedThread();
  assert.equal(thread.messages.at(-1).text, "Les jambes");
  assert.match(String(thread.sendError), /n’a pas pu répondre/);
  assert.ok(thread.lastInboundIds.includes("wamid.in.12"));
});

test("après une panne enregistrée, le renvoi du même message est traité sans doublon", async () => {
  currentDb = createFakeDb(seed());
  currentDb.failures.centersSelect = 2;
  const meta = installMeta();
  await post(webhook("Les jambes", "wamid.in.13"));
  const retry = await post(webhook("Les jambes", "wamid.in.13"));
  assert.equal(retry.payload.results[0].sent, true, JSON.stringify(retry.payload.results[0]));
  assert.equal(meta.sent.length, 1);
  const leads = storedThread().messages.filter((item) => item.author === "lead");
  assert.equal(leads.length, 1);
  assert.notEqual(textsSent(meta.sent)[0], welcomeThread().messages[0].text);
});

test("prospect en pause (« je reviens vers vous ») : réponse sans relance de créneau", async () => {
  const paused = welcomeThread({
    leadPause: { at: minutesAgo(5), reason: "reflexion", text: "Je reviens vers vous" },
    messages: [
      ...welcomeThread().messages,
      { id: "m-l", author: "lead", at: minutesAgo(6), text: "Je reviens vers vous" },
      { id: "m-s", author: "seya", at: minutesAgo(5), text: "Bien sûr, prenez votre temps 😊" },
    ],
  });
  currentDb = createFakeDb(seed(paused));
  const meta = installMeta();
  await post(webhook("Merci", "wamid.in.14"));
  for (const text of textsSent(meta.sent)) {
    assert.doesNotMatch(text, SLOT_PUSH, text);
  }
});

test("Seya coupée sur le centre : aucune réponse, mais le message est gardé pour l’équipe", async () => {
  currentDb = createFakeDb(seed(welcomeThread(), { whatsappAgentEnabled: false }));
  const meta = installMeta();
  const res = await post(webhook("Les jambes", "wamid.in.15"));
  assert.equal(res.payload.results[0].skipped, "agent_disabled");
  assert.equal(res.payload.results[0].recorded, true);
  assert.equal(meta.sent.length, 0);
  const last = storedThread().messages.at(-1);
  assert.equal(last.author, "lead");
  assert.equal(last.text, "Les jambes");

  const again = await post(webhook("Les jambes", "wamid.in.15"));
  assert.equal(again.payload.results[0].recorded, false, "webhook reçu deux fois : un seul message");
  assert.equal(storedThread().messages.filter((item) => item.text === "Les jambes").length, 1);
});

test("rappel accepté mais transmission en échec : Seya n’annonce pas de rappel", async () => {
  const asked = welcomeThread({
    qualification: { need: "Soin minceur", zone: "ventre", delay: "", availability: "" },
    messages: [
      ...welcomeThread().messages,
      { id: "m-l1", author: "lead", at: minutesAgo(4), text: "Le ventre" },
      { id: "m-s1", author: "seya", at: minutesAgo(3), text: "C’est noté pour le ventre. Vous êtes à quelle distance du centre ?" },
    ],
  });
  const data = seed(asked, { seyaMission: "book", bookAppointment: true, handoffToHuman: true });
  data.centers[0].name = "Centre Test";
  data.centers[0].city = "Lyon";
  currentDb = createFakeDb(data);
  const meta = installMeta();
  await post(webhook("Oui je veux bien être rappelée", "wamid.in.16"));
  const replies = textsSent(meta.sent);
  assert.equal(replies.length, 1);
  assert.equal(replies[0], "Votre demande de rappel est bien notée 😊");
  const thread = storedThread();
  assert.equal(thread.teamHandoff?.status, "failed", JSON.stringify({ replies, status: thread.status, bookingState: thread.bookingState }));
  assert.notEqual(thread.status, "À recontacter");
});

test("mission rappel : accord donné, transmission en échec → réponse honnête, étape conservée", async () => {
  const offered = welcomeThread({
    qualification: { need: "Soin minceur", zone: "ventre", delay: "", availability: "" },
    messages: [
      ...welcomeThread().messages,
      { id: "m-l1", author: "lead", at: minutesAgo(4), text: "Je voudrais perdre du ventre" },
      {
        id: "m-s1",
        author: "seya",
        at: minutesAgo(3),
        text: "C’est noté pour le ventre. Le bilan permettra d’évaluer vos besoins et de vous présenter les solutions adaptées. Souhaitez-vous qu’un expert ou une experte minceur du centre vous rappelle pour échanger sur votre besoin et organiser votre bilan ?",
      },
    ],
  });
  const data = seed(offered, { seyaMission: "qualify_callback", bookAppointment: false, handoffToHuman: true });
  data.centers[0].name = "Centre Test";
  data.centers[0].city = "Lyon";
  currentDb = createFakeDb(data);
  let meta = installMeta();
  await post(webhook("Oui", "wamid.in.18"));
  let replies = textsSent(meta.sent);
  assert.equal(replies.length, 1);
  assert.equal(replies[0], "Votre demande de rappel est bien notée 😊");
  let thread = storedThread();
  assert.equal(thread.teamHandoff?.status, "failed");
  assert.equal(thread.bookingState?.pendingQuestion, "callback");

  meta = installMeta();
  await post(webhook("Merci", "wamid.in.19"));
  replies = textsSent(meta.sent);
  for (const text of replies) {
    assert.doesNotMatch(text, /vous rappelle pour|quelle zone|distance|\d{1,2}h\d{2}/, text);
  }
  thread = storedThread();
  assert.equal(thread.bookingState?.pendingQuestion, "callback");
});

test("premier RDV choisi parmi les créneaux proposés : écrit dans l’agenda, pas de « slot_missing »", async () => {
  const day = new Date(NOW + 7 * 86400000);
  while (day.getDay() !== 2) day.setDate(day.getDate() + 1);
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const label = `mar. ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const slots = [
    { date: iso, time: "10:00", label: `${label} à 10h00` },
    { date: iso, time: "10:30", label: `${label} à 10h30` },
  ];
  const offered = welcomeThread({
    status: "RDV proposé",
    qualification: { need: "Soin minceur", zone: "ventre", delay: "", availability: "" },
    proposedSlots: slots,
    bookingState: { requestedDate: iso, lastOfferedSlots: slots, appointmentStatus: "proposed", pendingQuestion: null },
    messages: [
      ...welcomeThread().messages,
      { id: "m-l1", author: "lead", at: minutesAgo(4), text: "le ventre, mardi matin" },
      { id: "m-s1", author: "seya", at: minutesAgo(3), text: `Le ${label} je peux vous proposer 10h00 ou 10h30 — lequel vous irait le mieux ?` },
    ],
  });
  const data = seed(offered, { seyaMission: "book", bookAppointment: true });
  data.centers[0].name = "Centre Test";
  currentDb = createFakeDb(data);
  const meta = installMeta();
  await post(webhook("Le premier", "wamid.in.30"));
  const replies = textsSent(meta.sent);
  assert.match(replies.join("\n"), /rendez-vous est confirmé/, replies.join("\n"));
  const written = currentDb.db.appointments.filter((item) => item.appointment_date === iso);
  assert.equal(written.length, 1);
  assert.equal(String(written[0].starts_at).slice(0, 5), "10:00");
  const thread = storedThread();
  assert.equal(thread.status, "RDV confirmé");
  assert.equal(thread.bookedSlot?.date, iso);
  assert.equal(currentDb.db.leads[0].status, "RDV pris");
});

test("« Non merci » après « autre question ? » : clôture polie, pas « Pas intéressé »", async () => {
  const offered = welcomeThread({
    messages: [
      ...welcomeThread().messages,
      { id: "m-l2", author: "lead", at: minutesAgo(4), text: "Merci pour l'info" },
      { id: "m-s2", author: "seya", at: minutesAgo(3), text: "Avec plaisir 😊 Avez-vous une autre question ?" },
    ],
  });
  currentDb = createFakeDb(seed(offered));
  const meta = installMeta();
  await post(webhook("Non merci", "wamid.in.17"));
  const replies = textsSent(meta.sent);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /merci à vous/i);
  assert.doesNotMatch(replies[0], /\?/);
  assert.doesNotMatch(String(storedThread().status), /pas int[ée]ress/i);
  assert.doesNotMatch(String(currentDb.db.leads[0].status), /pas int[ée]ress/i);
});
