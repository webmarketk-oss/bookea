const test = require("node:test");
const assert = require("node:assert/strict");
const { previewTemplateBody } = require("./template-slots");

test("seya_scan : le centre reste après « du centre », l’offre après « pour notre »", () => {
  const body =
    "Bonjour 😊 Je suis Seya du centre {{1}}. Vous avez fait une demande pour notre {{2}}. Vous souhaitez plutôt faire le point sur votre composition corporelle ?";
  const preview = previewTemplateBody(
    body,
    "Bilan Scan 360° + séance test haute technologie minceur de 20 minutes offerts",
  );
  assert.match(preview, /du centre \[centre\]/);
  assert.match(preview, /pour notre Bilan Scan 360° \+ séance test haute technologie minceur de 20 minutes offerts/);
  assert.doesNotMatch(preview, /du centre \[prénom\]/);
  assert.doesNotMatch(preview, /pour notre \[centre\]/);
});

test("modèle avec prénom : l’ordre classique reste prénom, centre, offre", () => {
  const preview = previewTemplateBody(
    "Bonjour {{1}} 😊 Je suis Seya du centre {{2}}. Vous avez fait une demande pour notre offre {{3}}.",
    "bilan laser + test offerts",
  );
  assert.match(preview, /Bonjour \[prénom\]/);
  assert.match(preview, /du centre \[centre\]/);
  assert.match(preview, /notre offre bilan laser \+ test offerts/);
});
