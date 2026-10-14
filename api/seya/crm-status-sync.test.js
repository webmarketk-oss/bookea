const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  conversationOnRelanceHold,
  crmRecallDayFor,
  loadRelanceHoldKeys,
  syncCrmFromConversation,
} = require("./crm-sync");
const {
  CRM_LEAD_STATUSES,
  CRM_STATUS_ALIASES,
  crmStatusLabel,
  syncConversationsCrmStatus,
} = require("./booking-close");
const { mergeSeyaConversationLists } = require("./conversation-key");
const { sendDueWelcomes } = require("./welcome");
const { pickRelanceRound } = require("./relance");

const NOW = new Date("2026-10-13T10:00:00Z");

function leadsTable(rows, seen = []) {
  return {
    from(table) {
      assert.equal(table, "leads");
      return {
        select(columns) {
          seen.push(columns);
          if (/(^|,)\s*phone\s*(,|$)/.test(columns)) {
            return {
              eq: async () => ({
                data: null,
                error: { code: "42703", message: "column leads.phone does not exist" },
              }),
            };
          }
          return { eq: async () => ({ data: rows, error: null }) };
        },
      };
    },
  };
}

function lead(id, status, phone, extra = {}) {
  return {
    id,
    client_id: `client-${id}`,
    status,
    recall_date: null,
    created_at: "2026-10-01T09:00:00Z",
    updated_at: "2026-10-01T09:00:00Z",
    clients: { phone },
    ...extra,
  };
}

function thread(leadId, phone, extra = {}) {
  return {
    id: leadId,
    leadId,
    phone,
    status: "Qualifié",
    proposedSlots: [{ date: "2026-10-20", time: "10:00" }],
    bookingState: { pendingQuestion: "offer_slots", lastOfferedSlots: ["x"] },
    messages: [
      { author: "seya", text: "Bonjour", at: "2026-10-10T09:00:00Z" },
      { author: "lead", text: "Oui je veux bien des infos", at: "2026-10-10T09:05:00Z" },
    ],
    ...extra,
  };
}

test("la synchro lit le téléphone sur la fiche client (leads n’a pas de colonne phone)", async () => {
  const seen = [];
  const hold = await loadRelanceHoldKeys(
    leadsTable([lead("malika", "PI", "0612345678")], seen),
    "center-1",
    NOW,
  );
  assert.doesNotMatch(seen[0], /(^|,)\s*phone\s*(,|$)/);
  assert.match(seen[0], /clients\(phone\)/);
  assert.equal(conversationOnRelanceHold(thread("autre-id", "+33612345678"), hold), true);
});

test("Malika : PI dans le CRM → Seya affiche « Pas intéressé », ferme et n’envoie plus rien", async () => {
  const hold = await loadRelanceHoldKeys(
    leadsTable([lead("malika", "PI", "0612345678")]),
    "center-1",
    NOW,
  );
  const malika = thread("malika", "0612345678", { welcomeSendAt: "2026-10-13T10:05:00Z" });
  const next = await syncCrmFromConversation(null, "center-1", malika, hold);
  assert.equal(next.crmStatus, "Pas intéressé");
  assert.equal(next.status, "Pas intéressé");
  assert.equal(next.welcomeSendAt, null);
  assert.deepEqual(next.proposedSlots, []);
  assert.equal(next.bookingState.pendingQuestion, null);
  assert.equal(pickRelanceRound({ ...next, status: "Qualifié" }, NOW, { crmHold: hold }), 0);
});

test("statuts sans relance : affichés tels quels, relances bloquées, conversation fermée seulement selon les règles existantes", async () => {
  const noRelance = [
    "Pas intéressé",
    "Hors zone",
    "En réflexion",
    "Reviendra vers nous",
    "Prospect perdu",
    "Acompte envoyé",
    "Acompte reçu",
    "No show",
    "Devis",
    "Vendu",
    "Doublon",
    "Intraitable",
    "Numéro invalide",
  ];
  const closing = { "Pas intéressé": "Pas intéressé", "Hors zone": "Hors zone", "Prospect perdu": "Pas intéressé", Intraitable: "Pas intéressé" };
  for (const status of noRelance) {
    const hold = await loadRelanceHoldKeys(
      leadsTable([lead("l1", status, "0611111111")]),
      "center-1",
      NOW,
    );
    const conversation = thread("l1", "0611111111");
    assert.equal(conversationOnRelanceHold(conversation, hold), true, status);
    const next = await syncCrmFromConversation(null, "center-1", conversation, hold);
    assert.equal(next.crmStatus, status, status);
    assert.equal(next.status, closing[status] || "Qualifié", status);
  }
});

test("statuts encore actifs : Seya peut relancer", async () => {
  for (const status of ["Nouveau", "Message WhatsApp envoyé", "Apl en abs", "À relancer"]) {
    const hold = await loadRelanceHoldKeys(
      leadsTable([lead("l1", status, "0611111111")]),
      "center-1",
      NOW,
    );
    assert.equal(conversationOnRelanceHold(thread("l1", "0611111111"), hold), false, status);
  }
});

test("relance à date lointaine : rien avant la date, date visible dans Seya", async () => {
  const hold = await loadRelanceHoldKeys(
    leadsTable([lead("l1", "À relancer", "0611111111", { recall_date: "2026-12-01" })]),
    "center-1",
    NOW,
  );
  const conversation = thread("l1", "0611111111");
  assert.equal(conversationOnRelanceHold(conversation, hold), true);
  assert.equal(crmRecallDayFor(conversation, hold), "2026-12-01");
  const next = await syncCrmFromConversation(null, "center-1", conversation, hold);
  assert.equal(next.crmStatus, "À relancer");
  assert.equal(next.crmRecallDate, "2026-12-01");
  assert.equal(next.status, "Qualifié");
});

test("une fiche Doublon au même numéro ne bloque pas la vraie fiche", async () => {
  const hold = await loadRelanceHoldKeys(
    leadsTable([
      lead("vraie", "Message WhatsApp envoyé", "0622222222"),
      lead("doublon", "Doublon", "0622222222", { updated_at: "2026-10-12T09:00:00Z" }),
    ]),
    "center-1",
    NOW,
  );
  const real = thread("vraie", "0622222222");
  assert.equal(conversationOnRelanceHold(real, hold), false);
  const next = await syncCrmFromConversation(null, "center-1", real, hold);
  assert.equal(next.crmStatus, "Message WhatsApp envoyé");
});

test("chaque centre ne lit que ses propres prospects", async () => {
  const filters = [];
  const supabase = {
    from() {
      return {
        select() {
          return {
            eq: async (column, value) => {
              filters.push([column, value]);
              return { data: [], error: null };
            },
          };
        },
      };
    },
  };
  await loadRelanceHoldKeys(supabase, "center-gaillard", NOW);
  assert.deepEqual(filters, [["center_id", "center-gaillard"]]);
});

test("un statut CRM changé après le dernier message du prospect n’est pas écrasé par Seya", async () => {
  let updated = null;
  const row = lead("l1", "Apl en abs", "0611111111", { updated_at: "2026-10-12T09:00:00Z" });
  const supabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { eq() { return { maybeSingle: async () => ({ data: row, error: null }) }; } };
            },
          };
        },
        update(payload) {
          updated = payload;
          return { eq() { return { eq: async () => ({ error: null }) }; } };
        },
      };
    },
  };
  const conversation = thread("l1", "0611111111", {
    messages: [{ author: "lead", text: "Je ne suis pas intéressée", at: "2026-10-10T09:00:00Z" }],
  });
  const next = await syncCrmFromConversation(supabase, "center-1", conversation, new Set());
  assert.equal(updated, null);
  assert.equal(next.crmStatus, "Apl en abs");
});

test("CRM → Seya côté tableau de bord : tous les statuts sont reportés, seuls PI / Hors zone / perdu / intraitable ferment", () => {
  const base = thread("l1", "0611111111");
  const [reflexion] = syncConversationsCrmStatus([base], { leadId: "l1" }, "En réflexion", "2026-11-02");
  assert.equal(reflexion.crmStatus, "En réflexion");
  assert.equal(reflexion.crmRecallDate, "2026-11-02");
  assert.equal(reflexion.status, "Qualifié");
  const [pi] = syncConversationsCrmStatus([base], { leadId: "l1" }, "PI");
  assert.equal(pi.crmStatus, "Pas intéressé");
  assert.equal(pi.status, "Pas intéressé");
  const [other] = syncConversationsCrmStatus([base], { leadId: "autre" }, "PI");
  assert.equal(other, base);
});

test("le statut CRM le plus récent gagne quand deux versions de la conversation se croisent", () => {
  const stale = { ...thread("l1", "0611111111"), crmStatus: "Nouveau", crmSyncedAt: "2026-10-13T09:00:00Z", updatedAt: "2026-10-13T09:59:00Z" };
  const fresh = { ...thread("l1", "0611111111"), crmStatus: "Pas intéressé", crmSyncedAt: "2026-10-13T09:30:00Z", updatedAt: "2026-10-13T09:00:00Z" };
  assert.equal(mergeSeyaConversationLists([fresh], [stale])[0].crmStatus, "Pas intéressé");
  assert.equal(mergeSeyaConversationLists([stale], [fresh])[0].crmStatus, "Pas intéressé");
});

test("message d’accueil programmé annulé si le prospect est passé en PI entre-temps", async () => {
  const conversation = {
    ...thread("l1", "0611111111"),
    status: "À envoyer",
    welcomeSendAt: "2026-10-13T09:55:00Z",
    messages: [{ author: "seya", text: "Bonjour", at: "2026-10-13T09:51:00Z" }],
  };
  let written = null;
  const supabase = {
    from(table) {
      if (table === "leads") {
        return leadsTable([lead("l1", "Pas intéressé", "0611111111")]).from("leads");
      }
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { id: "center-1", settings: { seya: { conversations: [conversation] } } },
                  error: null,
                }),
              };
            },
          };
        },
        update(payload) {
          written = payload;
          const chain = {
            eq() { return chain; },
            select: async () => ({ data: [{ id: "center-1" }], error: null }),
            then: (resolve) => resolve({ data: [{ id: "center-1" }], error: null }),
          };
          return chain;
        },
      };
    },
  };
  let sentCount = 0;
  const sent = await sendDueWelcomes(
    supabase,
    { id: "center-1", name: "Centre" },
    async () => {
      sentCount += 1;
      return { sent: true };
    },
    NOW,
  );
  assert.equal(sentCount, 0);
  assert.deepEqual(sent, []);
  const saved = written?.settings?.seya?.conversations?.[0];
  assert.ok(saved);
  assert.equal(saved.welcomeSendAt, null);
  assert.equal(saved.crmStatus, "Pas intéressé");
});

test("libellés CRM identiques entre Seya et lib/lead-statuses.ts", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../lib/lead-statuses.ts"), "utf8");
  const listBlock = source.match(/export const leadStatuses[^=]*=\s*\[([\s\S]*?)\];/)[1];
  const labels = [...listBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(CRM_LEAD_STATUSES, labels);
  const aliasBlock = source.match(/const leadStatusAliasMap[^=]*=\s*\{([\s\S]*?)\};/)[1];
  const aliases = Object.fromEntries(
    [...aliasBlock.matchAll(/^\s*(?:"([^"]+)"|(\w+)):\s*"([^"]+)"/gm)].map((match) => [
      match[1] || match[2],
      match[3],
    ]),
  );
  assert.deepEqual(CRM_STATUS_ALIASES, aliases);
  assert.equal(crmStatusLabel("PI"), "Pas intéressé");
  assert.equal(crmStatusLabel("pi"), "Pas intéressé");
  assert.equal(crmStatusLabel("Perdu"), "Prospect perdu");
});

test("Seya met à jour le CRM entre PI, En réflexion, Reviendra vers nous et Hors zone", () => {
  const { canSeyaSetCrmStatus } = require("./crm-sync");
  const { crmStatusFromLeadMessage } = require("./conversation");
  const when = new Date("2026-10-14T08:00:00Z");
  assert.equal(crmStatusFromLeadMessage("Je vais réfléchir", when).status, "En réflexion");
  assert.equal(crmStatusFromLeadMessage("laissez moi réfléchir merci", when).status, "En réflexion");
  assert.equal(crmStatusFromLeadMessage("Je reviendrai vers vous", when).status, "Reviendra vers nous");
  assert.equal(crmStatusFromLeadMessage("C est trop loin pour moi", when).status, "Hors zone");
  assert.equal(crmStatusFromLeadMessage("pas intéressée merci", when).status, "Pas intéressé");
  assert.equal(crmStatusFromLeadMessage("J'ai réfléchi, c'est bon pour moi", when), null);
  assert.equal(require("./conversation").crmUpdateFromLeadMessage("Je vais réfléchir", when), null);

  const prospect = ["Pas intéressé", "En réflexion", "Reviendra vers nous", "Hors zone"];
  for (const from of [...prospect, "Nouveau", "Message WhatsApp envoyé", "À relancer"]) {
    for (const to of prospect) {
      const expected = from !== to;
      assert.equal(
        canSeyaSetCrmStatus({ status: from, recall_date: "2026-11-01" }, { status: to }),
        expected,
        `${from} → ${to}`,
      );
    }
  }
  for (const from of ["RDV pris", "RDV confirmé", "Devis", "Vendu", "Acompte reçu", "Doublon", "Numéro invalide", "Intraitable", "Prospect perdu", "No show"]) {
    assert.equal(canSeyaSetCrmStatus({ status: from }, { status: "Pas intéressé" }), false, from);
  }
  assert.equal(canSeyaSetCrmStatus({ status: "Reviendra vers nous" }, { status: "À relancer", reminderDate: null }), false);
});
