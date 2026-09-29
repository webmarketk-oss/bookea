const test = require("node:test");
const assert = require("node:assert/strict");

const { mapIncomingLead } = require("./saveleads");

test("la campagne prend le champ offre plutôt que Meta Lead Ads", () => {
  const mapped = mapIncomingLead({
    email: "marie@test.fr",
    prénom: "Marie",
    nom: "Dupont",
    téléphone: "06 12 34 56 78",
    offre: "Bilan minceur + séance découverte offerte",
    campaign: "Meta Lead Ads",
    campaign_name: "Meta Lead Ads",
  });

  assert.equal(mapped.campaign, "Bilan minceur + séance découverte offerte");
  assert.match(mapped.phone.replace(/\D/g, ""), /612345678/);
});

test("l’offre fonctionne aussi dans une liste name/value SaveMyLeads", () => {
  const mapped = mapIncomingLead({
    email: "lea@test.fr",
    options: [
      { name: "prénom", value: "Léa" },
      { name: "offre", value: "Cryolipolyse ventre" },
    ],
  });

  assert.equal(mapped.campaign, "Cryolipolyse ventre");
  assert.equal(mapped.firstName, "Léa");
});

test("l’offre fonctionne avec key/value", () => {
  const mapped = mapIncomingLead({
    email: "sam@test.fr",
    custom: [{ key: "offre", value: "Hydrafacial" }],
  });

  assert.equal(mapped.campaign, "Hydrafacial");
});

test("payload_offer_title est lu comme campagne", () => {
  const mapped = mapIncomingLead({
    email: "a@b.fr",
    payload_offer_title: "Laser jumelles",
    form_name: "Meta Lead Ads",
  });

  assert.equal(mapped.campaign, "Laser jumelles");
});
