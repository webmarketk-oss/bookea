const test = require("node:test");
const assert = require("node:assert/strict");
const { briefFacts, findFacts } = require("./brief-facts");

const BRIEF = `ACCOMPAGNEMENT
Pose la question des régimes déjà essayés. « J'ai fait plusieurs régimes » répond déjà à la question.
Le suivi se fait sur une application, entre les séances.
Tu présentes ensuite le bilan.
BILAN ET TECHNOLOGIES
Les technologies proposées au centre.
- Cryolipolyse
- Radiofréquence
Le bilan minceur est offert.`;

test("fiche : titres, consignes et phrases d’exemple écartés, informations gardées", () => {
  assert.deepEqual(briefFacts([BRIEF]), [
    "Le suivi se fait sur une application, entre les séances.",
    "Les technologies proposées au centre : cryolipolyse, radiofréquence.",
    "Le bilan minceur est offert.",
  ]);
});

test("fiche : titre en début de ligne retiré de l’information", () => {
  assert.deepEqual(findFacts(["BILAN ET TECHNOLOGIES Le bilan est offert."], /bilan/), [
    "Le bilan est offert.",
  ]);
});

test("fiche : liste introduite par une consigne non recopiée", () => {
  assert.deepEqual(briefFacts(["Propose ensuite :\n- le bilan\n- la séance découverte"]), []);
});

test("fiche : consignes « explique / ne prescris pas » écartées", () => {
  const facts = briefFacts([
    "Le suivi se fait sur une application, entre les séances.",
    "Pour un objectif de perte de poids, explique que l’approche est globale : les technologies s’inscrivent dans un accompagnement comprenant aussi l’alimentation.",
    "Ne prescris pas de régime, de restriction alimentaire ou d’objectif calorique personnalisé.",
  ]);
  assert.deepEqual(facts, ["Le suivi se fait sur une application, entre les séances."]);
});
