/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");

let db = null;
const supabasePath = require.resolve("@supabase/supabase-js");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { createClient: () => db },
};

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.BREVO_API_KEY = "brevo-key";
process.env.BREVO_EMAIL_SENDER = "info@bookeai.fr";

const handler = require("../meta/saveleads");
const {
  leadNotifyAllowed,
  leadNotifyConfig,
  leadNotifyCopy,
  notifyNewLead,
} = require("./_lead-notify");

function fakeSupabase(tables) {
  let seq = 0;
  return {
    tables,
    from(table) {
      const rows = (tables[table] ||= []);
      const filters = [];
      let op = "select";
      let payload = null;
      let result = null;
      const run = () => {
        if (result) {
          return result;
        }
        const matches = () => rows.filter((row) => filters.every((keep) => keep(row)));
        if (op === "insert") {
          const list = (Array.isArray(payload) ? payload : [payload]).map((item) => ({
            id: `${table}-${++seq}`,
            created_at: new Date().toISOString(),
            ...item,
          }));
          rows.push(...list);
          result = list;
        } else if (op === "update") {
          result = matches();
          result.forEach((row) => Object.assign(row, payload));
        } else {
          result = matches();
        }
        return result;
      };
      const query = {
        select: () => query,
        eq(key, value) {
          filters.push((row) =>
            value && typeof value === "object"
              ? JSON.stringify(row[key]) === JSON.stringify(value)
              : String(row[key]) === String(value),
          );
          return query;
        },
        in(key, values) {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        gte(key, value) {
          filters.push((row) => String(row[key]) >= String(value));
          return query;
        },
        order: () => query,
        limit: () => query,
        insert(value) {
          op = "insert";
          payload = value;
          return query;
        },
        update(value) {
          op = "update";
          payload = value;
          return query;
        },
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        single: async () => {
          const row = run()[0];
          return row ? { data: row, error: null } : { data: null, error: { message: "no_row" } };
        },
        then: (resolve, reject) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
      };
      return query;
    },
  };
}

const CHAMBLY = {
  id: "center-chambly",
  name: "Jfg Clinic Chambly",
  slug: "jfg-clinic-chambly",
  email: "chambly@jfg-clinic.com",
  settings: {
    seya: { whatsappAgentEnabled: false },
    leadNotify: { enabled: true, emails: ["chambly@jfg-clinic.com"] },
  },
};

const CLERMONT = {
  id: "center-clermont",
  name: "JFG Clinic Clermont",
  slug: "jfg-clinic-clermont",
  email: "clermont@jfg-clinic.com",
  settings: {
    seya: { whatsappAgentEnabled: false },
    leadNotify: { enabled: true, emails: ["clermont@jfg-clinic.com"] },
  },
};

let brevoCalls = [];
function mockBrevo({ fail = false } = {}) {
  brevoCalls = [];
  global.fetch = async (url, init) => {
    if (String(url).includes("api.brevo.com")) {
      brevoCalls.push(JSON.parse(init.body));
      return fail
        ? { ok: false, status: 500, json: async () => ({ message: "brevo_down" }) }
        : { ok: true, status: 201, json: async () => ({ messageId: "m1" }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

function freshDb() {
  db = fakeSupabase({
    centers: [structuredClone(CHAMBLY), structuredClone(CLERMONT)],
    clients: [],
    leads: [],
    lead_events: [],
  });
  return db;
}

async function postLead(query, body) {
  const res = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler({ method: "POST", query, headers: {}, body }, res);
  return res;
}

const SYSTEME_IO_LEAD = {
  first_name: "Sandrine",
  last_name: "Martin",
  email: "sandrine.martin@test.fr",
  phone: "0611223344",
  offre: "Bilan minceur offert",
};

test("Chambly : un nouveau prospect Systeme.io → un seul e-mail, au centre Chambly, avec la fiche", async () => {
  freshDb();
  mockBrevo();
  const res = await postLead(
    { center: "jfg-clinic-chambly", source: "systeme.io" },
    SYSTEME_IO_LEAD,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notification.sent, true);
  assert.equal(brevoCalls.length, 1);
  const mail = brevoCalls[0];
  assert.deepEqual(mail.to, [{ email: "chambly@jfg-clinic.com" }]);
  assert.equal(mail.subject, "Nouveau prospect – Jfg Clinic Chambly");
  for (const piece of ["Martin", "Sandrine", "0611223344", "sandrine.martin@test.fr", "Bilan minceur offert", "Date de réception"]) {
    assert.match(mail.textContent, new RegExp(piece));
  }
  assert.match(mail.htmlContent, /Consulter le prospect/);
  assert.match(mail.htmlContent, new RegExp(`crm-leads\\?lead=${res.body.id}&amp;center=center-chambly`));
  const marks = db.tables.lead_events.filter((event) => event.event_type === "lead_notify");
  assert.equal(marks.length, 1);
  assert.match(marks[0].note, /envoyée à chambly@jfg-clinic.com/);
});

test("Doublon : même prospect renvoyé, ou même téléphone, aucun second e-mail", async () => {
  freshDb();
  mockBrevo();
  await postLead({ center: "jfg-clinic-chambly", source: "systeme.io" }, SYSTEME_IO_LEAD);
  const again = await postLead(
    { center: "jfg-clinic-chambly", source: "systeme.io" },
    SYSTEME_IO_LEAD,
  );
  assert.equal(again.body.duplicate, true);
  const samePhone = await postLead(
    { center: "jfg-clinic-chambly", source: "systeme.io" },
    { ...SYSTEME_IO_LEAD, email: "autre.adresse@test.fr" },
  );
  assert.equal(samePhone.body.notification.sent, false);
  assert.equal(brevoCalls.length, 1);
});

test("Imports historiques (fichier ou welcome=0) : pas d’e-mail par défaut, notify=1 pour forcer", async () => {
  freshDb();
  mockBrevo();
  await postLead(
    { center: "jfg-clinic-chambly", source: "import" },
    { ...SYSTEME_IO_LEAD, email: "a@test.fr", phone: "0600000001" },
  );
  await postLead(
    { center: "jfg-clinic-chambly", source: "systeme.io", welcome: "0" },
    { ...SYSTEME_IO_LEAD, email: "b@test.fr", phone: "0600000002" },
  );
  assert.equal(brevoCalls.length, 0);
  await postLead(
    { center: "jfg-clinic-chambly", source: "systeme.io", welcome: "0", notify: "1" },
    { ...SYSTEME_IO_LEAD, email: "c@test.fr", phone: "0600000003" },
  );
  assert.equal(brevoCalls.length, 1);
});

test("Autre centre (pas encore ouvert) : aucun e-mail, même s’il a des réglages", async () => {
  freshDb();
  mockBrevo();
  const res = await postLead(
    { center: "jfg-clinic-clermont", source: "systeme.io" },
    SYSTEME_IO_LEAD,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notification.reason, "center_not_allowed");
  assert.equal(brevoCalls.length, 0);
});

test("Notifications désactivées à Chambly : prospect enregistré, aucun e-mail", async () => {
  freshDb();
  db.tables.centers[0].settings.leadNotify.enabled = false;
  mockBrevo();
  const res = await postLead({ center: "jfg-clinic-chambly", source: "systeme.io" }, SYSTEME_IO_LEAD);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.id);
  assert.equal(brevoCalls.length, 0);
});

test("Brevo en panne : le prospect est quand même enregistré", async () => {
  freshDb();
  mockBrevo({ fail: true });
  const res = await postLead({ center: "jfg-clinic-chambly", source: "systeme.io" }, SYSTEME_IO_LEAD);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.id);
  assert.equal(db.tables.leads.length, 1);
  assert.equal(res.body.notification.sent, false);
  const mark = db.tables.lead_events.find((event) => event.event_type === "lead_notify");
  assert.match(mark.note, /non envoyée/);
});

test("Un second appel pour le même prospect (ajout manuel relancé) n’envoie rien", async () => {
  freshDb();
  mockBrevo();
  const center = db.tables.centers[0];
  const lead = { firstName: "Léa", lastName: "Durand", phone: "0699999999", email: "", offer: "Soin visage" };
  const first = await notifyNewLead(db, { center, leadId: "lead-1", lead });
  const second = await notifyNewLead(db, { center, leadId: "lead-1", lead });
  assert.equal(first.sent, true);
  assert.equal(second.reason, "already");
  assert.equal(brevoCalls.length, 1);
});

test("Plusieurs destinataires : chacun reçoit l’e-mail ; champs vides affichés « Non renseigné »", async () => {
  freshDb();
  mockBrevo();
  const center = db.tables.centers[0];
  center.settings.leadNotify.emails = ["chambly@jfg-clinic.com", "Gerante@JFG-clinic.com", "pas-un-mail"];
  assert.deepEqual(leadNotifyConfig(center.settings).emails, [
    "chambly@jfg-clinic.com",
    "gerante@jfg-clinic.com",
  ]);
  await notifyNewLead(db, { center, leadId: "lead-2", lead: { firstName: "Nina", phone: "0612121212" } });
  assert.deepEqual(
    brevoCalls.map((call) => call.to[0].email),
    ["chambly@jfg-clinic.com", "gerante@jfg-clinic.com"],
  );
  assert.match(brevoCalls[0].textContent, /E-mail : Non renseigné/);
});

async function callManual(body, token) {
  const route = require("./lead-notify");
  const res = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await route(
    { method: "POST", query: {}, headers: token ? { authorization: `Bearer ${token}` } : {}, body },
    res,
  );
  return res;
}

test("Ajout manuel : membre du centre → un e-mail ; sans session ou fiche ancienne → rien", async () => {
  freshDb();
  mockBrevo();
  db.auth = {
    getUser: async (token) => ({
      data: { user: token === "member-token" ? { id: "profile-chambly" } : null },
      error: null,
    }),
  };
  db.tables.center_members = [
    { center_id: "center-chambly", profile_id: "profile-chambly", is_active: true },
  ];
  db.tables.bookea_admins = [];
  db.tables.leads = [
    {
      id: "manual-1",
      center_id: "center-chambly",
      created_at: new Date().toISOString(),
      clients: { first_name: "Inès", last_name: "Roux", phone: "0612345678", email: "ines@test.fr" },
      campaigns: { name: "Soin visage" },
    },
    {
      id: "old-1",
      center_id: "center-chambly",
      created_at: "2026-01-01T10:00:00Z",
      clients: { first_name: "Ancienne" },
    },
  ];

  const anonymous = await callManual({ action: "lead", leadId: "manual-1" });
  assert.equal(anonymous.statusCode, 403);
  const old = await callManual({ action: "lead", leadId: "old-1" }, "member-token");
  assert.equal(old.body.reason, "not_new");
  const created = await callManual({ action: "lead", leadId: "manual-1" }, "member-token");
  assert.equal(created.body.sent, true);
  const retried = await callManual({ action: "lead", leadId: "manual-1" }, "member-token");
  assert.equal(retried.body.reason, "already");
  assert.equal(brevoCalls.length, 1);
  assert.match(brevoCalls[0].textContent, /Nom : Roux/);
  assert.match(brevoCalls[0].textContent, /Offre demandée : Soin visage/);
});

test("Allowlist : Chambly seulement pour l’instant", () => {
  assert.equal(leadNotifyAllowed(CHAMBLY), true);
  assert.equal(leadNotifyAllowed({ slug: "jfg-clinique-chambly" }), true);
  assert.equal(leadNotifyAllowed(CLERMONT), false);
  const copy = leadNotifyCopy({
    centerName: "Jfg Clinic Chambly",
    lead: { firstName: "<b>x</b>" },
    receivedAt: "2026-10-23T09:02:00Z",
    url: "https://www.bookeai.fr/dashboard/crm-leads?lead=1",
  });
  assert.match(copy.text, /vendredi 23 octobre 2026 à 11h02/);
  assert.doesNotMatch(copy.html, /<b>x<\/b>/);
});
