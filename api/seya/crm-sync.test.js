const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conversationHasSentSeyaMessage,
  conversationOnRelanceHold,
  isCrmRelanceHold,
  markLeadWhatsAppSent,
  syncCrmFromConversation,
} = require("./crm-sync");

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
