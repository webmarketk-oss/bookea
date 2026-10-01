const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inferCareFamily,
  pickApprovedTemplate,
} = require("./care-family");
const {
  resolvePersonName,
  sanitizePersonName,
} = require("../../lib/seya-person-name");

const templates = [
  { name: "seya_accueil_minceur", status: "APPROVED" },
  { name: "seya_accueil_laser", status: "APPROVED" },
  { name: "seya_accueil_visage", status: "APPROVED" },
  { name: "seya_accueil_", status: "APPROVED" },
  { name: "hello_world", status: "APPROVED" },
];

test("Ferrand JFG n’est pas un nom de famille", () => {
  const person = sanitizePersonName("malerika", "FERRAND JFG");
  assert.equal(person.firstName, "malerika");
  assert.equal(person.lastName, "");
});

test("un vrai nom de famille est conservé", () => {
  const person = sanitizePersonName("Cynthia", "Martin");
  assert.equal(person.lastName, "Martin");
});

test("le champ nom du centre ne devient pas le nom du lead", () => {
  const person = resolvePersonName(
    {
      first_name: "Samantha",
      nom: "FERRAND JFG",
      last_name: "",
    },
    (fields, names) => {
      for (const name of names) {
        if (fields[name]) return fields[name];
      }
      return "";
    },
  );
  assert.equal(person.firstName, "Samantha");
  assert.equal(person.lastName, "");
});

test("un lead laser ne prend pas le template minceur", () => {
  const picked = pickApprovedTemplate(templates, inferCareFamily("Épilation laser JFG"));
  assert.equal(picked.name, "seya_accueil_laser");
});

test("un lead minceur prend le template minceur", () => {
  const picked = pickApprovedTemplate(templates, inferCareFamily("Soin minceur"));
  assert.equal(picked.name, "seya_accueil_minceur");
});

test("un lead visage prend le template visage", () => {
  const picked = pickApprovedTemplate(templates, inferCareFamily("Hydrafacial"));
  assert.equal(picked.name, "seya_accueil_visage");
});

test("sans soin connu : template générique, jamais minceur par défaut", () => {
  const picked = pickApprovedTemplate(templates, inferCareFamily("Meta Lead Ads"));
  assert.equal(picked.name, "seya_accueil_");
});

test("bilan laser reste du laser", () => {
  assert.equal(inferCareFamily("Bilan laser offert FERRAND JFG"), "epilation");
});

test("l’offre se dit naturellement, jamais « le minceur »", () => {
  const { humanizeOfferTitle, naturalOfferPhrase } = require("./care-family");
  assert.equal(naturalOfferPhrase("minceur", ""), "un soin minceur");
  assert.equal(humanizeOfferTitle("le minceur"), "un soin minceur");
  assert.match(
    humanizeOfferTitle("Bilan minceur + séance découverte offerte"),
    /un bilan minceur et une séance découverte offerte/i,
  );
  assert.doesNotMatch(naturalOfferPhrase("minceur", "le minceur"), /le minceur/);
});

test("l’intitulé campagne du centre choisit le texte WhatsApp du 1er message", () => {
  const { findOfferMap, phraseConfiguredOffer } = require("./care-family");
  const seya = {
    offerMaps: [
      {
        match: "Soin minceur",
        label: "offre découverte minceur (bilan + séance découverte offerte)",
      },
      {
        match: "lift 4 149-copy",
        label: "diagnostic de votre peau détaillé offert",
      },
    ],
  };
  const minceur = findOfferMap(seya, "Soin minceur");
  assert.equal(
    minceur.label,
    "offre découverte minceur (bilan + séance découverte offerte)",
  );
  const lift = findOfferMap(seya, "lift-4-149-copy", "Soin minceur");
  assert.equal(lift.match, "lift 4 149-copy");
  assert.equal(lift.label, "diagnostic de votre peau détaillé offert");
  assert.equal(
    phraseConfiguredOffer(lift.label),
    "diagnostic de votre peau détaillé offert",
  );
  assert.equal(findOfferMap({ offerMaps: [] }, "Soin minceur"), null);
});

test("un titre de soin se dit naturellement, sans copier l’enseigne", () => {
  const { phraseFromCareTitle } = require("./care-family");
  assert.match(
    phraseFromCareTitle(
      "Soins Visage anti-âge (sans chirurgie) - JFG Clinic Saint-Gilles-Croix-de-Vie",
    ),
    /des soins visage anti-âge/i,
  );
  assert.doesNotMatch(
    phraseFromCareTitle(
      "Soins Visage anti-âge (sans chirurgie) - JFG Clinic Saint-Gilles-Croix-de-Vie",
    ),
    /JFG|Saint-Gilles/i,
  );
  assert.match(
    phraseFromCareTitle("Épilation définitive (laser Triwave) - JFG Clinic Saint-Gilles"),
    /une épilation définitive/i,
  );
  assert.equal(phraseFromCareTitle(""), "");
});
