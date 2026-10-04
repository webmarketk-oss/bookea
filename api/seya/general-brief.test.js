const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COMMON_SEYA_GENERAL_BRIEF,
  isLegacyGeneralBrief,
  resolveGeneralBrief,
} = require("./general-brief");

test("les consignes communes remplacent l’ancien brief JFG et les textes legacy", () => {
  assert.equal(isLegacyGeneralBrief(""), true);
  assert.equal(
    isLegacyGeneralBrief(
      "Tu es Seya, au standard du centre. Chaleureuse, naturelle, vouvoiement.",
    ),
    true,
  );
  assert.equal(
    isLegacyGeneralBrief(
      "RÈGLES STRICTES DE PRISE DE RENDEZ-VOUS pour JFG CLINIC CLERMONT FERRAND\nCRÉNEAUX AUTORISÉS DU LUNDI AU VENDREDI",
    ),
    true,
  );
  assert.equal(resolveGeneralBrief(""), COMMON_SEYA_GENERAL_BRIEF);
  assert.match(COMMON_SEYA_GENERAL_BRIEF, /Apm.*après-midi/i);
  assert.match(
    COMMON_SEYA_GENERAL_BRIEF,
    /N’applique aucune grille horaire commune/i,
  );
  assert.match(COMMON_SEYA_GENERAL_BRIEF, /Planity/i);
  assert.equal(
    resolveGeneralBrief("Consignes spécifiques du centre Gap."),
    "Consignes spécifiques du centre Gap.",
  );
});
