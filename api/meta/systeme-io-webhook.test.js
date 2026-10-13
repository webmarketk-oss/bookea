const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("./saveleads");
const {
  extractLooseContact,
  incomingLeadFields,
  leadOrigin,
  mapIncomingLead,
  payloadFromBody,
  resolveIncomingSource,
} = handler;

function systemeIoOptIn(first, last, email, phone) {
  return {
    contact: {
      id: 12345,
      email,
      registeredAt: "2026-10-13T10:00:00+00:00",
      locale: "fr",
      sourceURL: "https://jfg-clermont.systeme.io/bilan-minceur",
      unsubscribed: false,
      bounced: false,
      needsConfirmation: false,
      fields: [
        { fieldName: "Prénom", slug: "first_name", value: first },
        { fieldName: "Nom", slug: "surname", value: last },
        { fieldName: "Téléphone", slug: "phone_number", value: phone },
        { fieldName: "Pays", slug: "country", value: "FR" },
      ],
      tags: [{ id: 10253858268, name: "minceur" }],
    },
  };
}

function read(body, query) {
  const payload = payloadFromBody(JSON.stringify(body));
  return { payload, fields: incomingLeadFields(payload, query), mapped: mapIncomingLead(payload, query) };
}

test("Systeme.io officiel : chaque contact garde son propre téléphone, prénom et nom", () => {
  const query = { center: "jfg-clinic-clermont", source: "systeme.io" };
  const sylvie = read(systemeIoOptIn("Sylvie", "Vellard", "sylvievellard@sfr.fr", "0612345678"), query);
  const alice = read(systemeIoOptIn("Alice", "Ouvry", "alice.ouvry@yahoo.fr", "07 98 76 54 32"), query);
  assert.equal(sylvie.mapped.phone, "0612345678");
  assert.equal(sylvie.mapped.firstName, "Sylvie");
  assert.equal(sylvie.mapped.lastName, "Vellard");
  assert.equal(sylvie.mapped.email, "sylvievellard@sfr.fr");
  assert.equal(alice.mapped.phone, "07 98 76 54 32");
  assert.equal(alice.mapped.firstName, "Alice");
  assert.notEqual(sylvie.mapped.firstName, "minceur");
});

test("Systeme.io sans source dans l’URL : provenance Systeme.io, pas Facebook", () => {
  const body = systemeIoOptIn("Sylvie", "Vellard", "sylvievellard@sfr.fr", "0612345678");
  const { payload, fields } = read(body, { center: "jfg-clinic-clermont" });
  const label = resolveIncomingSource(payload, { center: "jfg-clinic-clermont" }, "Facebook", { headers: {} });
  assert.equal(leadOrigin(label, fields, false).source, "Systeme.io");
  assert.equal(leadOrigin("Facebook", { full_name: "Marie", phone: "0612345678" }, false).source, "Facebook");
  assert.equal(leadOrigin("Facebook", fields, true).source, "Facebook");
});

function fakeDb(clients, leads) {
  return {
    from(table) {
      const rows = table === "clients" ? clients : leads;
      let list = [...rows];
      const query = {
        select: () => query,
        eq: (key, value) => {
          list = list.filter((row) => String(row[key]).toLowerCase() === String(value).toLowerCase());
          return query;
        },
        in: (key, values) => {
          list = list.filter((row) => values.includes(row[key]));
          return query;
        },
        gte: (key, value) => {
          list = list.filter((row) => row[key] >= value);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: list[0] || null, error: null }),
        then: (resolve) => resolve({ data: list, error: null }),
      };
      return query;
    },
  };
}

test("même email, même centre, < 30 min : pas de seconde fiche ; autre centre ou plus ancien : nouvelle fiche", async () => {
  const now = new Date("2026-10-13T11:00:00Z");
  const db = fakeDb(
    [
      { id: "c1", center_id: "clermont", email: "sylvievellard@sfr.fr", created_at: "2026-10-13T10:55:00Z" },
      { id: "c2", center_id: "gaillard", email: "autre@test.fr", created_at: "2026-10-13T10:58:00Z" },
      { id: "c3", center_id: "clermont", email: "ancienne@test.fr", created_at: "2026-10-12T10:00:00Z" },
    ],
    [
      { id: "l1", center_id: "clermont", client_id: "c1", created_at: "2026-10-13T10:55:00Z" },
      { id: "l2", center_id: "gaillard", client_id: "c2", created_at: "2026-10-13T10:58:00Z" },
      { id: "l3", center_id: "clermont", client_id: "c3", created_at: "2026-10-12T10:00:00Z" },
    ],
  );
  const find = handler.findRecentSameSubmission;
  assert.equal(await find(db, "clermont", { email: "SylvieVellard@sfr.fr" }, now), "l1");
  assert.equal(await find(db, "clermont", { email: "autre@test.fr" }, now), null);
  assert.equal(await find(db, "clermont", { email: "ancienne@test.fr" }, now), null);
  assert.equal(await find(db, "clermont", { email: "" }, now), null);
});

test("un numéro n’est jamais extrait du milieu d’un identifiant", () => {
  assert.equal(extractLooseContact("id 10253858268 tag").phone, "");
  assert.equal(extractLooseContact("ref:902538582681").phone, "");
  assert.match(extractLooseContact("Marie Dupont 06 12 34 56 78").phone, /06 12 34 56 78/);
  assert.match(extractLooseContact("Exclusive0613277582reseau@gmail.com").phone, /0613277582/);
});
