const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conversationHasSentSeyaMessage,
  conversationOnRelanceHold,
  isCrmRelanceHold,
  markLeadWhatsAppSent,
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
