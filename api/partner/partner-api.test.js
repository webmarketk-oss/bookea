const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppointmentsHandler } = require("./v1/appointments");
const { createCalendarsHandler } = require("./v1/calendars");
const { isoToLocal, localToIso, sha256Hex } = require("./_lib");

const CLERMONT = "11111111-1111-4111-8111-111111111111";
const TERVILLE = "22222222-2222-4222-8222-222222222222";
const GAILLARD = "33333333-3333-4333-8333-333333333333";
const ROOM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-10-28T10:00:00Z");

const KEY = `bkp_${"a1".repeat(6)}_${"f0".repeat(24)}`;
const REVOKED_KEY = `bkp_${"b2".repeat(6)}_${"e1".repeat(24)}`;
const ROOM_KEY = `bkp_${"c3".repeat(6)}_${"d2".repeat(24)}`;

/** Mini moteur de requêtes Supabase en mémoire (filtres utilisés par l'API). */
function fakeSupabase(tables) {
  const updates = [];
  function query(table) {
    const filters = [];
    let orders = [];
    let max = Infinity;
    const run = () => {
      let rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
      for (const [column, ascending] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      return rows.slice(0, max);
    };
    const builder = {
      select: () => builder,
      eq: (column, value) => (filters.push((row) => row[column] === value), builder),
      neq: (column, value) => (filters.push((row) => row[column] !== value), builder),
      in: (column, values) => (filters.push((row) => values.includes(row[column])), builder),
      gte: (column, value) => (filters.push((row) => String(row[column]) >= String(value)), builder),
      lte: (column, value) => (filters.push((row) => String(row[column]) <= String(value)), builder),
      order: (column, options = {}) => (orders.push([column, options.ascending !== false]), builder),
      limit: (count) => ((max = count), builder),
      maybeSingle: async () => ({ data: run()[0] || null, error: null }),
      update: (patch) => ({
        eq: async (column, value) => {
          updates.push({ table, patch, column, value });
          return { error: null };
        },
      }),
      then: (resolve, reject) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    };
    return builder;
  }
  return { from: query, updates };
}

function keyRow(key, overrides = {}) {
  const prefix = key.split("_")[1];
  return {
    id: `key-${prefix}`,
    partner_name: "Thierry Gascon",
    key_prefix: prefix,
    key_hash: sha256Hex(key),
    center_ids: [CLERMONT, TERVILLE],
    room_ids: null,
    scopes: ["appointments:read"],
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
}

function appointment(id, overrides = {}) {
  return {
    id,
    center_id: CLERMONT,
    client_id: "client-secret",
    service_id: "service-x",
    room_id: ROOM_A,
    appointment_date: "2026-11-02",
    starts_at: "09:30:00",
    ends_at: "10:15:00",
    duration_minutes: 45,
    status: "confirmed",
    origin: "crm",
    notes: "Mme Dupont, allergie au latex",
    created_at: "2026-10-20T08:00:00.000Z",
    updated_at: "2026-10-27T08:00:00.000Z",
    ...overrides,
  };
}

function seed() {
  return fakeSupabase({
    partner_api_keys: [
      keyRow(KEY),
      keyRow(REVOKED_KEY, { revoked_at: "2026-10-01T00:00:00Z" }),
      keyRow(ROOM_KEY, { center_ids: [CLERMONT], room_ids: [ROOM_A] }),
    ],
    centers: [
      { id: CLERMONT, name: "JFG Clinic Clermont-Ferrand", timezone: null },
      { id: TERVILLE, name: "JFG Clinic Terville", timezone: "Europe/Paris" },
      { id: GAILLARD, name: "JFG Clinic Gaillard", timezone: null },
    ],
    rooms: [
      { id: ROOM_A, center_id: CLERMONT, name: "Cabine 1", is_active: true, display_order: 1 },
      { id: ROOM_B, center_id: CLERMONT, name: "Cabine 2", is_active: true, display_order: 2 },
    ],
    appointments: [
      appointment("00000000-0000-4000-8000-000000000001"),
      appointment("00000000-0000-4000-8000-000000000002", {
        status: "cancelled",
        updated_at: "2026-10-28T09:00:00.000Z",
      }),
      appointment("00000000-0000-4000-8000-000000000003", {
        room_id: ROOM_B,
        notes: "[kind:Pause]",
        appointment_date: "2026-11-03",
      }),
      appointment("00000000-0000-4000-8000-000000000004", { center_id: GAILLARD }),
      appointment("00000000-0000-4000-8000-000000000005", { appointment_date: "2027-03-01" }),
      appointment("00000000-0000-4000-8000-000000000006", { origin: "partner_import" }),
      appointment("00000000-0000-4000-8000-000000000007", {
        center_id: TERVILLE,
        room_id: null,
        appointment_date: "2026-07-15",
        updated_at: "2026-10-28T09:30:00.000Z",
      }),
    ],
    appointment_deletions: [
      {
        appointment_id: "00000000-0000-4000-8000-000000000009",
        center_id: CLERMONT,
        room_id: ROOM_A,
        appointment_date: "2026-11-04",
        starts_at: "14:00:00",
        ends_at: "15:00:00",
        deleted_at: "2026-10-28T08:00:00.000Z",
      },
      {
        appointment_id: "00000000-0000-4000-8000-000000000010",
        center_id: GAILLARD,
        room_id: null,
        appointment_date: "2026-11-04",
        starts_at: "14:00:00",
        ends_at: "15:00:00",
        deleted_at: "2026-10-28T08:00:00.000Z",
      },
    ],
  });
}

async function call(handlerFactory, { method = "GET", key = KEY, query = {}, supabase = seed() } = {}) {
  const handler = handlerFactory({ createSupabase: () => supabase, now: () => NOW });
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(
    { method, query, headers: key ? { authorization: `Bearer ${key}` } : {} },
    res,
  );
  return res;
}

const ids = (res) => res.body.data.map((item) => item.id.slice(-2));

test("sans clé, clé inconnue ou révoquée : 401", async () => {
  assert.equal((await call(createAppointmentsHandler, { key: "" })).statusCode, 401);
  const unknown = `bkp_${"a1".repeat(6)}_${"00".repeat(24)}`;
  assert.equal((await call(createAppointmentsHandler, { key: unknown })).statusCode, 401);
  const revoked = await call(createAppointmentsHandler, { key: REVOKED_KEY });
  assert.equal(revoked.statusCode, 401);
  assert.equal(revoked.body.error.code, "revoked_api_key");
});

test("lecture seule : POST, PATCH, DELETE refusés (405)", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await call(createAppointmentsHandler, { method });
    assert.equal(res.statusCode, 405, method);
    assert.equal(res.headers.Allow, "GET");
  }
});

test("agenda non autorisé (autre centre) : 403", async () => {
  const res = await call(createAppointmentsHandler, { query: { calendar_id: GAILLARD } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "calendar_not_allowed");
});

test("période par défaut : uniquement les agendas autorisés, sans import partenaire", async () => {
  const res = await call(createAppointmentsHandler);
  assert.equal(res.statusCode, 200);
  // 04 = Gaillard (non autorisé), 05 = hors période, 06 = créneau importé, 07 = passé.
  assert.deepEqual(ids(res).sort(), ["01", "02", "03"]);
});

test("format : début/fin avec fuseau, statut, annulation, pause, aucune donnée personnelle", async () => {
  const res = await call(createAppointmentsHandler, { query: { calendar_id: CLERMONT } });
  const first = res.body.data.find((item) => item.id.endsWith("01"));
  assert.equal(first.start, "2026-11-02T09:30:00+01:00");
  assert.equal(first.end, "2026-11-02T10:15:00+01:00");
  assert.equal(first.timezone, "Europe/Paris");
  assert.equal(first.status, "confirmed");
  assert.equal(first.cancelled, false);
  assert.equal(first.type, "appointment");
  assert.equal(first.updated_at, "2026-10-27T08:00:00.000Z");
  const json = JSON.stringify(res.body);
  assert.doesNotMatch(json, /Dupont|latex|client-secret|service-x|notes|client_id/);

  const cancelled = res.body.data.find((item) => item.id.endsWith("02"));
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.status, "cancelled");

  const pause = res.body.data.find((item) => item.id.endsWith("03"));
  assert.equal(pause.type, "block");
  assert.equal(pause.block_kind, "Pause");
});

test("filtres : cabine, période, dernière modification", async () => {
  const byRoom = await call(createAppointmentsHandler, { query: { room_id: ROOM_B } });
  assert.deepEqual(ids(byRoom), ["03"]);

  const byPeriod = await call(createAppointmentsHandler, {
    query: { from: "2026-11-03", to: "2026-11-30" },
  });
  assert.deepEqual(ids(byPeriod), ["03"]);

  const changed = await call(createAppointmentsHandler, {
    query: { updated_since: "2026-10-28T00:00:00Z" },
  });
  // Toutes périodes confondues : l'annulation (02) et le rendez-vous passé de Terville (07).
  assert.deepEqual(ids(changed), ["02", "07"]);
  assert.deepEqual(changed.body.deleted.map((item) => item.id.slice(-2)), ["09"]);
  assert.equal(changed.body.deleted[0].deleted, true);
  assert.equal(changed.body.deleted[0].status, "deleted");
});

test("clé limitée à une cabine : les autres cabines sont invisibles ou refusées", async () => {
  const res = await call(createAppointmentsHandler, { key: ROOM_KEY });
  assert.deepEqual(ids(res).sort(), ["01", "02"]);
  const refused = await call(createAppointmentsHandler, { key: ROOM_KEY, query: { room_id: ROOM_B } });
  assert.equal(refused.statusCode, 403);
  const otherCenter = await call(createAppointmentsHandler, { key: ROOM_KEY, query: { calendar_id: TERVILLE } });
  assert.equal(otherCenter.statusCode, 403);
});

test("pagination : le curseur reprend après le dernier élément, sans doublon", async () => {
  const first = await call(createAppointmentsHandler, { query: { limit: "2" } });
  assert.equal(first.body.data.length, 2);
  assert.ok(first.body.next_cursor);
  const second = await call(createAppointmentsHandler, {
    query: { limit: "2", cursor: first.body.next_cursor },
  });
  const all = [...ids(first), ...ids(second)];
  assert.deepEqual(all.sort(), ["01", "02", "03"]);
  assert.equal(second.body.next_cursor, null);
});

test("paramètres invalides : 400 explicite", async () => {
  for (const query of [
    { from: "28/10/2026" },
    { updated_since: "hier" },
    { limit: "0" },
    { limit: "501" },
    { from: "2026-01-01", to: "2027-12-31" },
    { cursor: "pas-un-curseur" },
    { calendar_id: "clermont" },
  ]) {
    const res = await call(createAppointmentsHandler, { query });
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
});

test("/calendars : centres et cabines autorisés uniquement", async () => {
  const res = await call(createCalendarsHandler);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map((item) => item.name), [
    "JFG Clinic Clermont-Ferrand",
    "JFG Clinic Terville",
  ]);
  assert.equal(res.body.data[0].rooms.length, 2);
  assert.equal(res.body.data[0].timezone, "Europe/Paris");

  const limited = await call(createCalendarsHandler, { key: ROOM_KEY });
  assert.deepEqual(limited.body.data.map((item) => item.rooms.map((room) => room.name)), [["Cabine 1"]]);
});

test("fuseau : heure d'été et d'hiver à Paris, aller-retour", () => {
  assert.equal(localToIso("2026-07-15", "09:00:00"), "2026-07-15T09:00:00+02:00");
  assert.equal(localToIso("2026-12-15", "09:00:00"), "2026-12-15T09:00:00+01:00");
  assert.deepEqual(isoToLocal("2026-07-15T07:00:00Z"), { date: "2026-07-15", time: "09:00:00" });
});
