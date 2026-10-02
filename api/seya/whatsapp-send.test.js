const test = require("node:test");
const assert = require("node:assert/strict");

const { isTemplateRequired, welcomeTemplateVars } = require("./whatsapp");

test("Meta 131047 force le modèle générique, pas le texte de campagne", () => {
  assert.equal(
    isTemplateRequired({
      code: 131047,
      message: "Message failed to send because more than 24 hours have passed",
    }),
    true,
  );
  assert.equal(
    isTemplateRequired({ code: 131026, message: "undeliverable" }),
    false,
  );
});

test("le modèle générique prend le texte WhatsApp de l’offre, pas le nom de campagne", () => {
  assert.deepEqual(
    welcomeTemplateVars({
      firstName: "Bernard",
      centerName: "JFG Clinic Clermont-Ferrand",
      treatment: "lift 4 149-copy",
      offerLabel: "lift 4 à 149 €",
    }),
    {
      firstName: "Bernard",
      centerName: "JFG Clinic Clermont-Ferrand",
      treatment: "lift 4 à 149 €",
    },
  );
});
