const test = require("node:test");
const assert = require("node:assert/strict");

const { applyOfferPatch } = require("./patch-seya-offer");

const ORVAULT = {
  brief: "Accueil Orvault",
  treatmentBriefs: [
    {
      name: "Épilation définitive",
      title: "",
      brief: "Tu accueilles pour l’épilation.",
      opening: "Bonjour {prenom}",
    },
    {
      name: "Soin minceur",
      title: "",
      brief: "Tu commences par la zone.",
    },
  ],
  offerMaps: [],
  conversations: [{ id: "must-keep" }],
};

test("Orvault laser : l’offre -40 % se mappe sans vider les briefs", () => {
  const next = applyOfferPatch(ORVAULT, {
    offerMaps: [
      {
        match: "Laser",
        label: "Offre limitée jusqu'à -40 % sur nos forfaits",
      },
    ],
    treatmentName: "Épilation définitive",
    treatmentTitle: "Offre limitée jusqu'à -40 % sur nos forfaits",
  });
  assert.equal(next.conversations[0].id, "must-keep");
  assert.equal(next.treatmentBriefs.length, 2);
  assert.equal(next.treatmentBriefs[0].brief, "Tu accueilles pour l’épilation.");
  assert.equal(
    next.treatmentBriefs[0].title,
    "Offre limitée jusqu'à -40 % sur nos forfaits",
  );
  assert.equal(next.treatmentBriefs[1].title, "");
  assert.equal(next.offerMaps[0].match, "Laser");
  assert.match(next.offerMaps[0].label, /-40 %/);
});

test("un patch vide ne supprime pas les offres déjà remplies", () => {
  const filled = {
    ...ORVAULT,
    offerMaps: [{ match: "Laser", label: "Jusqu'à -40 %" }],
  };
  const next = applyOfferPatch(filled, {});
  assert.equal(next.offerMaps[0].label, "Jusqu'à -40 %");
  assert.equal(next.treatmentBriefs[0].brief, "Tu accueilles pour l’épilation.");
});
