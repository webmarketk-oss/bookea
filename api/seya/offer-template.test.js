const test = require("node:test");
const assert = require("node:assert/strict");

test("modèle WA : le nom saisi sur l’offre passe avant le choix automatique, sinon repli", () => {
  const { pickApprovedTemplate } = require("./care-family");
  const templates = [
    { name: "seya_accueil_minceur", status: "APPROVED" },
    { name: "seya_accueil_laser", status: "APPROVED" },
    { name: "seya_laser_gaillard", status: "APPROVED" },
    { name: "seya_laser_attente", status: "PENDING" },
  ];
  assert.equal(pickApprovedTemplate(templates, "epilation", "seya_laser_gaillard").name, "seya_laser_gaillard");
  assert.equal(pickApprovedTemplate(templates, "epilation", "seya_laser_attente").name, "seya_accueil_laser");
  assert.equal(pickApprovedTemplate(templates, "epilation").name, "seya_accueil_laser");
});

test("ligne d’offre Visage sans le mot visage dans le texte : reste un soin visage", () => {
  const { inferFamily } = require("./agent");
  const seya = {
    offerMaps: [
      { match: "Visage", label: "Bilan ultra-personnalisé + Soin découverte OFFERTS" },
      { match: "minceur", label: "Bilan minceur complet + séance découverte offerts" },
    ],
  };
  assert.equal(inferFamily(seya, "", "Visage"), "visage");
  assert.equal(inferFamily(seya, "Bilanscan360", ""), "minceur");
});
