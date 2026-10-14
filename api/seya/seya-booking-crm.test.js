const test = require("node:test");
const assert = require("node:assert/strict");

const { ownershipFromRows } = require("./center-route");
const { loadRelanceHoldKeys, markSeyaBookedLeads } = require("./crm-sync");
const { markLeadBookedBySeya, resolveBookingLead } = require("./whatsapp");

const NOW = new Date("2026-10-14T07:00:00Z");

function chain(result, calls, table) {
  const node = {
    select(columns) {
      calls.push([table, "select", columns]);
      return node;
    },
    eq(column, value) {
      calls.push([table, "eq", column, value]);
      return node;
    },
    in(column, value) {
      calls.push([table, "in", column, value]);
      return node;
    },
    gte() {
      return node;
    },
    order() {
      return node;
    },
    limit() {
      return node;
    },
    update(payload) {
      calls.push([table, "update", payload]);
      return node;
    },
    insert(payload) {
      calls.push([table, "insert", payload]);
      return Promise.resolve({ error: null });
    },
    then(resolve) {
      return resolve(typeof result === "function" ? result(calls) : result);
    },
  };
  return node;
}

function client(tables, calls = []) {
  return {
    calls,
    from(table) {
      return chain(tables[table] || { data: [], error: null }, calls, table);
    },
  };
}

test("plusieurs fiches pour la même cliente : Seya retient la fiche en cours, pas l’ancienne ni le doublon", () => {
  const index = ownershipFromRows({
    clients: [{ id: "c1", center_id: "clermont", phone: "0612345678" }],
    leads: [
      { id: "ancienne", center_id: "clermont", client_id: "c1", phone: "0612345678", status: "Pas intéressé", created_at: "2025-03-01T10:00:00Z" },
      { id: "doublon", center_id: "clermont", client_id: "c1", phone: "0612345678", status: "Doublon", created_at: "2026-10-13T18:00:00Z" },
      { id: "actuelle", center_id: "clermont", client_id: "c1", phone: "0612345678", status: "Message WhatsApp envoyé", created_at: "2026-10-12T09:00:00Z" },
    ],
  });
  assert.equal(index.get("612345678")[0].leadId, "actuelle");
});

test("RDV Seya : la fiche de la conversation passe en RDV pris, écriture vérifiée", async () => {
  const supabase = client({
    leads: (calls) => {
      const last = calls.filter((call) => call[0] === "leads").at(-1);
      if (last[1] === "in") {
        return { data: [{ id: "actuelle", client_id: "c1", status: "Message WhatsApp envoyé" }], error: null };
      }
      return { data: [{ id: "actuelle" }], error: null };
    },
  });
  const lead = await resolveBookingLead(
    supabase,
    "clermont",
    { leadId: "ancienne", clientId: "c1" },
    { leadId: "actuelle" },
  );
  assert.equal(lead.id, "actuelle");
  const status = await markLeadBookedBySeya(supabase, "clermont", lead, { label: "jeudi 15 à 10:00" }, false);
  assert.equal(status, "RDV pris");
  const update = supabase.calls.find((call) => call[1] === "update");
  assert.equal(update[2].status, "RDV pris");
  assert.ok(supabase.calls.some((call) => call[0] === "leads" && call[1] === "eq" && call[2] === "center_id" && call[3] === "clermont"));
});

test("RDV Seya : une fiche déjà en Devis / Vendu / Acompte ne recule pas", async () => {
  const supabase = client({ leads: { data: [{ id: "l1" }], error: null } });
  for (const current of ["Devis", "Vendu", "Acompte reçu", "RDV confirmé"]) {
    const status = await markLeadBookedBySeya(supabase, "clermont", { id: "l1", status: current }, { label: "x" }, false);
    assert.equal(status, current);
  }
  assert.equal(supabase.calls.some((call) => call[1] === "update"), false);
});

test("rattrapage : un RDV Seya à venir met la fiche en RDV pris, sans toucher aux fiches PI ou déjà avancées", async () => {
  const leadsRows = [
    { id: "hier-soir", client_id: "c1", status: "Message WhatsApp envoyé", clients: { phone: "0611111111" } },
    { id: "pi", client_id: "c2", status: "Pas intéressé", clients: { phone: "0622222222" } },
    { id: "vendu", client_id: "c3", status: "Vendu", clients: { phone: "0633333333" } },
  ];
  const updates = [];
  const supabase = {
    from(table) {
      if (table === "leads") {
        return {
          select() {
            return { eq: async () => ({ data: leadsRows, error: null }) };
          },
          update(payload) {
            const node = {
              eq(column, value) {
                if (column === "id") updates.push([value, payload.status]);
                return node;
              },
              select: async () => ({ data: [{ id: "ok" }], error: null }),
            };
            return node;
          },
        };
      }
      if (table === "appointments") {
        const node = {
          select() { return node; },
          eq() { return node; },
          gte: async () => ({
            data: [
              { id: "a1", lead_id: "hier-soir", client_id: "c1", status: "pending", appointment_date: "2026-10-15", origin: "seya" },
              { id: "a2", lead_id: "pi", client_id: "c2", status: "pending", appointment_date: "2026-10-16", origin: "seya" },
              { id: "a3", lead_id: "vendu", client_id: "c3", status: "confirmed", appointment_date: "2026-10-16", origin: "seya" },
            ],
            error: null,
          }),
        };
        return node;
      }
      return { insert: async () => ({ error: null }) };
    },
  };
  const hold = await loadRelanceHoldKeys(supabase, "clermont", NOW);
  const marked = await markSeyaBookedLeads(supabase, "clermont", hold, NOW);
  assert.equal(marked, 1);
  assert.deepEqual(updates, [["hier-soir", "RDV pris"]]);
});
