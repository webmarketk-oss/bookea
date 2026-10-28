const test = require("node:test");
const assert = require("node:assert/strict");

const { createExternalCalendarClient, resolveSecret } = require("./client");
const { planExternalSync } = require("./sync-plan");
const { runConnectionSync } = require("./sync");
const { createSyncHandler } = require("../external-calendar-sync");

const CENTER = "11111111-1111-4111-8111-111111111111";
const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUR_APPOINTMENT = "00000000-0000-4000-8000-0000000000aa";
const NOW = new Date("2026-10-28T10:00:00Z");
const SECRET = "partner-secret-value-123";

function item(id, overrides = {}) {
  return {
    externalId: id,
    calendarId: "cal-clermont",
    start: "2026-11-02T09:00:00+01:00",
    end: "2026-11-02T10:00:00+01:00",
    status: "confirmed",
    updatedAt: "2026-10-27T08:00:00Z",
    ...overrides,
  };
}

const MAPPINGS = new Map([["cal-clermont", { room_id: ROOM, practitioner_id: null }]]);

// ——— Plan ———
test("plan : nouveau → créé, modifié → mis à jour, identique → inchangé", () => {
  const existing = new Map([
    ["e2", { external_id: "e2", external_calendar_id: "cal-clermont", starts_at: "2026-11-02T08:00:00Z", ends_at: "2026-11-02T09:00:00Z", status: "confirmed" }],
    ["e3", { external_id: "e3", external_calendar_id: "cal-clermont", starts_at: "2026-11-02T08:00:00Z", ends_at: "2026-11-02T09:00:00Z", status: "confirmed" }],
  ]);
  const actions = planExternalSync({
    mode: "import",
    items: [item("e1"), item("e2", { start: "2026-11-02T11:00:00+01:00", end: "2026-11-02T12:00:00+01:00" }), item("e3")],
    existing,
    mappings: MAPPINGS,
  });
  assert.deepEqual(actions.map((action) => action.kind), ["create", "update", "unchanged"]);
});

test("plan : annulation partenaire → annulé ; annulation inconnue → ignorée", () => {
  const existing = new Map([
    ["e1", { external_id: "e1", starts_at: "2026-11-02T08:00:00Z", ends_at: "2026-11-02T09:00:00Z", status: "confirmed" }],
  ]);
  const actions = planExternalSync({
    mode: "read",
    items: [item("e1", { status: "cancelled" }), item("e9", { status: "cancelled" })],
    existing,
    mappings: new Map(),
  });
  assert.equal(actions[0].kind, "cancel");
  assert.equal(actions[1].reason, "cancelled_unknown");
});

test("plan : pas de doublon si le partenaire renvoie deux fois le même rendez-vous", () => {
  const actions = planExternalSync({
    mode: "import",
    items: [item("e1", { updatedAt: "2026-10-27T08:00:00Z" }), item("e1", { updatedAt: "2026-10-27T09:00:00Z" })],
    existing: new Map(),
    mappings: MAPPINGS,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "create");
});

test("plan : rendez-vous venu de Bookea, agenda non relié, horaire invalide → ignorés", () => {
  const actions = planExternalSync({
    mode: "import",
    items: [
      item("echo", { sourceRef: OUR_APPOINTMENT }),
      item("tagged", { sourceRef: "bookea:xyz" }),
      item("other", { calendarId: "cal-inconnu" }),
      item("bad", { end: "2026-11-02T08:00:00+01:00" }),
    ],
    existing: new Map(),
    mappings: MAPPINGS,
    bookeaIds: new Set([OUR_APPOINTMENT]),
  });
  assert.deepEqual(actions.map((action) => action.reason), [
    "from_bookea",
    "from_bookea",
    "unmapped_calendar",
    "invalid",
  ]);
});

test("plan : relecture complète → un rendez-vous connu absent est annulé (hors relecture incrémentale)", () => {
  const existing = new Map([
    ["gone", { external_id: "gone", starts_at: "2026-11-05T08:00:00Z", ends_at: "2026-11-05T09:00:00Z", status: "confirmed" }],
  ]);
  const full = planExternalSync({
    mode: "read",
    items: [],
    existing,
    mappings: new Map(),
    fullWindow: { from: "2026-10-27", to: "2026-12-27" },
  });
  assert.equal(full[0].reason, "missing_from_partner");
  const incremental = planExternalSync({ mode: "read", items: [], existing, mappings: new Map() });
  assert.equal(incremental.length, 0);
});

// ——— Client / secrets ———
test("secret : seulement une variable EXTERNAL_CALENDAR_…, jamais une autre clé serveur", () => {
  assert.throws(
    () => resolveSecret({ secret_env: "SUPABASE_SERVICE_ROLE_KEY" }, { SUPABASE_SERVICE_ROLE_KEY: "x" }),
    { code: "invalid_secret_env" },
  );
  assert.throws(() => resolveSecret({ secret_env: "EXTERNAL_CALENDAR_GASCON_CLERMONT" }, {}), {
    code: "missing_secret",
  });
  assert.equal(
    resolveSecret({ secret_env: "EXTERNAL_CALENDAR_GASCON_CLERMONT" }, { EXTERNAL_CALENDAR_GASCON_CLERMONT: SECRET }),
    SECRET,
  );
});

test("fournisseur Gascon non documenté : aucune requête, liste des informations manquantes", () => {
  let called = false;
  assert.throws(
    () =>
      createExternalCalendarClient(
        { provider: "gascon", secret_env: "EXTERNAL_CALENDAR_GASCON_CLERMONT" },
        { env: { EXTERNAL_CALENDAR_GASCON_CLERMONT: SECRET }, fetchImpl: () => (called = true) },
      ),
    (error) => error.code === "provider_not_configured" && error.details.pending.length > 0,
  );
  assert.equal(called, false);
});

/** Fournisseur fictif « configuré », pour vérifier le connecteur avant la doc du partenaire. */
function fakeProvider() {
  return {
    test: {
      label: "Partenaire de test",
      configured: true,
      defaultBaseUrl: "https://api.partenaire.test",
      authHeaders: (secret) => ({ Authorization: `Bearer ${secret}` }),
      async listAppointments({ request, from, to }) {
        const body = await request("/appointments", { query: { from, to } });
        return body.items;
      },
      normalize: (raw) => raw,
    },
  };
}

test("client configuré : clé en en-tête côté serveur, erreurs sans le secret", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 401, json: async () => ({}) };
  };
  const client = createExternalCalendarClient(
    { provider: "test", secret_env: "EXTERNAL_CALENDAR_TEST" },
    { env: { EXTERNAL_CALENDAR_TEST: SECRET }, fetchImpl, registry: fakeProvider() },
  );
  await assert.rejects(
    client.listAppointments({ from: "2026-10-27", to: "2026-12-27" }),
    (error) => error.code === "partner_auth_failed" && !error.message.includes(SECRET),
  );
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${SECRET}`);
  assert.match(calls[0].url, /^https:\/\/api\.partenaire\.test\/appointments\?from=2026-10-27&to=2026-12-27$/);
});

// ——— Synchro de bout en bout (base en mémoire) ———
function fakeDb(tables) {
  const log = [];
  function table(name) {
    const filters = [];
    let max = Infinity;
    let pending = null;
    const rows = () => (tables[name] ||= []);
    const matches = (row) => filters.every((filter) => filter(row));
    const builder = {
      select: () => builder,
      eq: (column, value) => (filters.push((row) => row[column] === value), builder),
      in: (column, values) => (filters.push((row) => values.includes(row[column])), builder),
      limit: (count) => ((max = count), builder),
      insert: (row) => {
        const created = { id: `new-${rows().length + 1}`, ...row };
        rows().push(created);
        log.push({ table: name, op: "insert", row: created });
        pending = created;
        return builder;
      },
      update: (patch) => {
        pending = { update: patch };
        return builder;
      },
      upsert: async (row, { onConflict }) => {
        const keys = onConflict.split(",");
        const current = rows().find((item) => keys.every((key) => item[key] === row[key]));
        if (current) Object.assign(current, row);
        else rows().push({ ...row });
        log.push({ table: name, op: "upsert", row });
        return { error: null };
      },
      single: async () => ({ data: pending, error: null }),
      then: (resolve, reject) => {
        if (pending?.update) {
          for (const row of rows().filter(matches)) Object.assign(row, pending.update);
          log.push({ table: name, op: "update", patch: pending.update });
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows().filter(matches).slice(0, max), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from: table, tables, log };
}

function syncSetup(items, mode = "import") {
  const db = fakeDb({
    external_calendar_mappings: [{ connection_id: "conn-1", external_calendar_id: "cal-clermont", room_id: ROOM, practitioner_id: null }],
    external_appointments: [],
    centers: [{ id: CENTER, timezone: null }],
    appointments: [{ id: OUR_APPOINTMENT, center_id: CENTER, origin: "crm" }],
    clients: [],
    external_calendar_connections: [{ id: "conn-1" }],
  });
  const connection = {
    id: "conn-1",
    center_id: CENTER,
    provider: "test",
    secret_env: "EXTERNAL_CALENDAR_TEST",
    mode,
    last_synced_at: null,
  };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ items }) });
  const deps = { now: NOW, env: { EXTERNAL_CALENDAR_TEST: SECRET }, fetchImpl, registry: fakeProvider() };
  return { db, connection, deps };
}

test("synchro import : un créneau « Indisponible » par rendez-vous, sans doublon à la relecture", async () => {
  const { db, connection, deps } = syncSetup([item("e1"), item("echo", { sourceRef: OUR_APPOINTMENT })]);
  const first = await runConnectionSync(db, connection, deps);
  assert.equal(first.counts.create, 1);
  assert.equal(first.counts.skip, 1);

  const imported = db.tables.appointments.filter((row) => row.origin === "partner_import");
  assert.equal(imported.length, 1);
  assert.equal(imported[0].room_id, ROOM);
  assert.equal(imported[0].appointment_date, "2026-11-02");
  assert.equal(imported[0].starts_at, "09:00:00");
  assert.equal(imported[0].ends_at, "10:00:00");
  assert.match(imported[0].notes, /^\[kind:Indisponible\]/);
  assert.equal(db.tables.clients[0].first_name, "Agenda");
  assert.match(db.tables.clients[0].private_note, /\[agenda-block\]/);
  assert.equal(db.tables.external_appointments[0].appointment_id, imported[0].id);

  connection.last_synced_at = NOW.toISOString();
  const second = await runConnectionSync(db, connection, deps);
  assert.equal(second.counts.create, 0);
  assert.equal(second.counts.unchanged, 1);
  assert.equal(db.tables.appointments.filter((row) => row.origin === "partner_import").length, 1);
});

test("synchro import : annulation partenaire → créneau importé annulé, jamais un RDV Bookea", async () => {
  const { db, connection, deps } = syncSetup([item("e1")]);
  await runConnectionSync(db, connection, deps);
  connection.last_synced_at = NOW.toISOString();
  deps.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ items: [item("e1", { status: "cancelled" })] }) });
  const result = await runConnectionSync(db, connection, deps);
  assert.equal(result.counts.cancel, 1);
  const imported = db.tables.appointments.find((row) => row.origin === "partner_import");
  assert.equal(imported.status, "cancelled");
  assert.notEqual(db.tables.appointments.find((row) => row.id === OUR_APPOINTMENT).status, "cancelled");
});

test("synchro lecture : rendez-vous gardés pour consultation, agenda Bookea intact", async () => {
  const { db, connection, deps } = syncSetup([item("e1")], "read");
  const result = await runConnectionSync(db, connection, deps);
  assert.equal(result.counts.create, 1);
  assert.equal(db.tables.external_appointments.length, 1);
  assert.equal(db.tables.external_appointments[0].appointment_id, null);
  assert.equal(db.tables.appointments.length, 1);
  assert.equal(db.tables.clients.length, 0);
});

test("route de synchro : réservée au serveur (CRON_SECRET)", async () => {
  const handler = createSyncHandler({ createSupabase: () => fakeDb({}), env: { CRON_SECRET: "cron" } });
  const res = {
    statusCode: 0,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
  await handler({ method: "POST", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 401);
  await handler({ method: "POST", headers: { authorization: "Bearer cron" }, query: {} }, res);
  assert.equal(res.statusCode, 200);
});
