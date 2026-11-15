const test = require("node:test");
const assert = require("node:assert/strict");

const { retargetSeyaFiche } = require("./restore-seya-fiche");

test("la copie Sallanches → Gaillard change le nom et l’adresse, pas les soins", () => {
  const seya = {
    brief: "Fiche JFG Clinic Sallanches",
    centerProfile: {
      activity: "JFG Clinic Sallanches à Sallanches",
      extras: "86 All. Kepler, 74700 Sallanches",
      supportEmail: "sallanches@jfg-clinic.com",
      supportPhone: "0450219526",
    },
    treatmentBriefs: [
      { name: "Soin minceur", brief: "Cryo à Sallanches." },
      { name: "Laser", brief: "Épilation." },
    ],
    offerMaps: [{ match: "laser", label: "Épilation laser" }],
    conversations: [{ id: "must-not-copy" }],
  };
  const next = retargetSeyaFiche(
    seya,
    {
      name: "JFG Clinic Sallanches",
      city: "Sallanches",
      email: "sallanches@jfg-clinic.com",
      phone: "0450219526",
      address_line1: "86 All. Kepler",
      postal_code: "74700",
    },
    {
      name: "JFG Clinic Gaillard",
      city: "Gaillard",
      email: "gaillard@jfg-clinic.com",
      phone: "0450000000",
      address_line1: "58 rue de la Libération",
      postal_code: "74240",
    },
  );
  assert.equal(next.conversations, undefined);
  assert.equal(next.treatmentBriefs.length, 2);
  assert.match(next.brief, /JFG Clinic Gaillard/);
  assert.doesNotMatch(next.brief, /Sallanches/);
  assert.equal(next.centerProfile.extras, "58 rue de la Libération, 74240, Gaillard");
  assert.equal(next.centerProfile.supportEmail, "gaillard@jfg-clinic.com");
  assert.equal(next.centerProfile.supportPhone, "0450000000");
  assert.match(next.treatmentBriefs[0].brief, /Gaillard/);
});
