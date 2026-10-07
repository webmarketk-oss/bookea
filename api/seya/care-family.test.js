const test = require("node:test");
const assert = require("node:assert/strict");
const {
  activeCareFamily,
  inferCareFamily,
  pickApprovedTemplate,
  understandThread,
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

test("elle relit tout le fil : minceur puis visage, le soin actuel est visage", () => {
  const thread = understandThread(
    {
      treatment: "Soin minceur",
      campaign: "lift 4 149-copy",
      qualification: { need: "Soin minceur" },
      messages: [
        { author: "lead", text: "Bonjour je veut bien prendre un soin" },
        { author: "seya", text: "Souhaitez-vous le créneau pour le soin minceur ?" },
        { author: "lead", text: "C’est gratuit" },
        { author: "seya", text: "Oui, le bilan est offert." },
        { author: "lead", text: "Non pour le visage" },
        { author: "seya", text: "Pour le soin du visage, à partir de 149 €." },
      ],
    },
    "Ok c’est quoi le prix déjà",
  );
  assert.equal(thread.family, "visage");
  assert.match(thread.need, /visage/i);
  assert.ok(thread.asked.includes("prix"));
});

test("après « non pour le visage », le soin actif n’est plus minceur", () => {
  assert.equal(
    activeCareFamily({
      treatment: "Soin minceur",
      campaign: "lift 4 149-copy",
      offerLabel: "bilan minceur offert",
      qualification: { need: "Soin minceur" },
      messages: [
        { author: "lead", text: "C’est gratuit" },
        { author: "lead", text: "Non pour le visage" },
      ],
    }),
    "visage",
  );
});

test("sans soin connu : template générique, jamais minceur par défaut", () => {
  const picked = pickApprovedTemplate(templates, inferCareFamily("Meta Lead Ads"));
  assert.equal(picked.name, "seya_accueil_");
});

test("bilan laser reste du laser", () => {
  assert.equal(inferCareFamily("Bilan laser offert FERRAND JFG"), "epilation");
});

test("aisselles, c’est du laser, pas de la minceur", () => {
  assert.equal(inferCareFamily("C’est combien pour les aisselles"), "epilation");
  assert.equal(
    activeCareFamily({
      treatment: "Soin minceur",
      campaign: "offre découverte minceur",
      qualification: { need: "Soin minceur" },
      messages: [{ author: "lead", text: "C’est combien pour les aisselles" }],
    }),
    "epilation",
  );
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
  const { findOfferMap, humanizeOfferTitle, phraseConfiguredOffer } = require("./care-family");
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
  assert.equal(
    phraseConfiguredOffer(minceur.label),
    "notre offre découverte minceur (bilan + séance découverte offerte)",
  );
  assert.match(
    humanizeOfferTitle(minceur.label),
    /notre offre découverte minceur/i,
  );
  assert.doesNotMatch(humanizeOfferTitle(minceur.label), /un offre/i);
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
