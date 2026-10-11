const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conversationHasSentSeyaMessage,
  conversationOnRelanceHold,
  isCrmRelanceHold,
  loadRelanceHoldKeys,
  markLeadWhatsAppSent,
  syncCrmFromConversation,
} = require("./crm-sync");
const { closeConversationsForCrmStatus } = require("./booking-close");
const { inboxTag } = require("../../lib/seya-inbox-sort.ts");

test("un fil déjà envoyé n’est plus « À envoyer »", () => {
  assert.equal(
    conversationHasSentSeyaMessage({
      status: "À envoyer",
      messages: [{ author: "seya", text: "Bonjour" }],
    }),
    false,
  );
  assert.equal(
    conversationHasSentSeyaMessage({
      status: "En cours",
      messages: [{ author: "seya", text: "Bonjour" }],
    }),
    true,
  );
});

test("date de rappel ou reviendra vers nous bloquent la relance", () => {
  assert.equal(isCrmRelanceHold({ status: "Reviendra vers nous" }), true);
  assert.equal(isCrmRelanceHold({ status: "Pas intéressé" }), true);
  assert.equal(isCrmRelanceHold({ status: "Hors zone" }), true);
  assert.equal(isCrmRelanceHold({ status: "Intraitable" }), true);
  assert.equal(isCrmRelanceHold({ status: "Nouveau", recall_date: "2026-10-10" }), true);
  assert.equal(isCrmRelanceHold({ status: "Nouveau" }), false);
  assert.equal(
    conversationOnRelanceHold(
      { leadId: "lead-1", status: "En cours" },
      new Set(["id:lead-1"]),
    ),
    true,
  );
});

test("un Nouveau passe en Message WhatsApp envoyé après l’envoi Seya", async () => {
  let updated = null;
  const supabase = {
    from(table) {
      assert.equal(table, "leads");
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: "lead-1", status: "Nouveau" },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        update(payload) {
          updated = payload;
          return {
            eq() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        },
      };
    },
  };

  assert.equal(await markLeadWhatsAppSent(supabase, "center-1", "lead-1"), true);
  assert.equal(updated.status, "Message WhatsApp envoyé");
});

test("un « plus rien cette semaine » met le CRM en Reviendra vers nous", async () => {
  let updated = null;
  const supabase = {
    from(table) {
      assert.equal(table, "leads");
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: "lead-1",
                        phone: "0611223344",
                        status: "Message WhatsApp envoyé",
                        recall_date: null,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        update(payload) {
          updated = payload;
          return {
            eq() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        },
      };
    },
  };
  const hold = new Set();
  const next = await syncCrmFromConversation(
    supabase,
    "center-1",
    {
      leadId: "lead-1",
      phone: "0611223344",
      status: "En cours",
      messages: [
        { author: "lead", text: "Plus rien sur la semaine qui arrive" },
        { author: "centre", text: "Très bien, prenez le temps. À bientôt !" },
      ],
    },
    hold,
  );
  assert.equal(next.status, "Terminé");
  assert.equal(updated.status, "Reviendra vers nous");
  assert.equal(hold.has("id:lead-1"), true);
});

test("j’habite dans le 01 / trop de route met le CRM en Hors zone", async () => {
  let updated = null;
  const supabase = {
    from(table) {
      assert.equal(table, "leads");
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: "lead-evelyne",
                        phone: "0664307133",
                        status: "Qualifié",
                        recall_date: null,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        update(payload) {
          updated = payload;
          return {
            eq() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        },
      };
    },
  };
  const hold = new Set();
  const next = await syncCrmFromConversation(
    supabase,
    "center-1",
    {
      leadId: "lead-evelyne",
      phone: "0664307133",
      status: "Qualifié",
      messages: [
        {
          author: "lead",
          text: "j’habite dans le 01, j’ai peur que cela me fasse beaucoup de route",
        },
      ],
    },
    hold,
  );
  assert.equal(next.status, "Terminé");
  assert.equal(updated.status, "Hors zone");
  assert.equal(hold.has("id:lead-evelyne"), true);
});

const emma = {
  leadId: "lead-emma",
  phone: "+33618798109",
  status: "Qualifié",
  proposedSlots: [{ date: "2026-10-14", time: "10:00" }],
  bookingState: { pendingQuestion: "offer_slots", lastOfferedSlots: ["x"] },
  messages: [
    { author: "lead", text: "Je souhaite réfléchir" },
    { author: "seya", text: "Bonjour Emma, je me permets de revenir vers vous" },
  ],
};

test("CRM Pas intéressé : la conversation Seya passe en Fermé, sans toucher les autres", () => {
  const other = { ...emma, leadId: "lead-autre", phone: "0611223344" };
  const [closed, untouched] = closeConversationsForCrmStatus(
    [emma, other],
    { leadId: "lead-emma", phone: "0618798109" },
    "Pas intéressé",
  );
  assert.equal(closed.status, "Pas intéressé");
  assert.deepEqual(closed.proposedSlots, []);
  assert.equal(closed.bookingState.pendingQuestion, null);
  assert.equal(inboxTag(emma), "qualifie");
  assert.equal(inboxTag(closed), "ferme");
  assert.equal(untouched, other);
});

test("CRM Hors zone / Prospect perdu / Intraitable ferment, les autres statuts non", () => {
  const match = { leadId: "lead-emma" };
  assert.equal(inboxTag(closeConversationsForCrmStatus([emma], match, "Hors zone")[0]), "hors_zone");
  assert.equal(closeConversationsForCrmStatus([emma], match, "Prospect perdu")[0].status, "Pas intéressé");
  assert.equal(closeConversationsForCrmStatus([emma], match, "Intraitable")[0].status, "Pas intéressé");
  for (const status of ["En réflexion", "Reviendra vers nous", "À relancer", "Message WhatsApp envoyé"]) {
    assert.equal(closeConversationsForCrmStatus([emma], match, status)[0], emma);
  }
});

test("un RDV déjà pris n’est pas fermé par le statut CRM", () => {
  const booked = { ...emma, status: "RDV confirmé", bookedSlot: { date: "2026-10-14", time: "10:00" } };
  assert.equal(closeConversationsForCrmStatus([booked], { leadId: "lead-emma" }, "Pas intéressé")[0], booked);
});

test("passage relance : un lead déjà en Pas intéressé dans le CRM ferme sa conversation", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "leads");
      return {
        select() {
          return {
            eq: async () => ({
              data: [
                { id: "lead-emma", phone: "0618798109", status: "Pas intéressé", recall_date: null },
                { id: "lead-autre", phone: "0611223344", status: "Message WhatsApp envoyé", recall_date: null },
              ],
              error: null,
            }),
          };
        },
      };
    },
  };
  const hold = await loadRelanceHoldKeys(supabase, "center-1");
  assert.equal(conversationOnRelanceHold(emma, hold), true);

  const next = await syncCrmFromConversation(supabase, "center-1", emma, hold);
  assert.equal(next.status, "Pas intéressé");
  assert.equal(inboxTag(next), "ferme");

  const byPhone = await syncCrmFromConversation(
    supabase,
    "center-1",
    { ...emma, leadId: "" },
    hold,
  );
  assert.equal(byPhone.status, "Pas intéressé");

  const other = { ...emma, leadId: "lead-autre", phone: "0611223344", messages: [] };
  assert.equal(await syncCrmFromConversation(supabase, "center-1", other, hold), other);
});
