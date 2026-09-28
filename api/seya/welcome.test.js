const test = require("node:test");
const assert = require("node:assert/strict");

const { isActiveWhatsAppThread } = require("./welcome");

test("un fil de plus de 24 h n’est plus considéré comme actif", () => {
  const stale = {
    status: "En cours",
    updatedAt: new Date(Date.now() - 40 * 3600000).toISOString(),
    messages: [
      {
        author: "seya",
        text: "Bonjour",
        at: new Date(Date.now() - 40 * 3600000).toISOString(),
      },
    ],
  };
  assert.equal(isActiveWhatsAppThread(stale), false);
});

test("un fil récent reste bloqué pour éviter un second accueil", () => {
  const hot = {
    status: "En cours",
    updatedAt: new Date().toISOString(),
    messages: [
      {
        author: "lead",
        text: "Ok",
        at: new Date().toISOString(),
      },
    ],
  };
  assert.equal(isActiveWhatsAppThread(hot), true);
});

test("un fil fermé peut être réouvert à la réinscription", () => {
  const closed = {
    status: "Pas intéressé",
    updatedAt: new Date().toISOString(),
    messages: [
      {
        author: "lead",
        text: "Non merci",
        at: new Date().toISOString(),
      },
    ],
  };
  assert.equal(isActiveWhatsAppThread(closed), false);
});
