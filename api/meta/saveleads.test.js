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

test("Systeme.io : un prénom de formulaire n’est pas écrasé par un member_first_name vide", () => {
  const mapped = mapIncomingLead({
    first_name: "Clara",
    last_name: "Martin",
    payload_member_first_name: "",
    payload_member_last_name: "",
    payload_member_email: "clara@test.fr",
    payload_contact_phone_number: "0611111111",
  });

  assert.equal(mapped.firstName, "Clara");
  assert.equal(mapped.lastName, "Martin");
});

test("Systeme.io : le nom complet du membre suffit", () => {
  const mapped = mapIncomingLead({
    payload_member_name: "Léa Bernard",
    payload_member_email: "lea@test.fr",
    payload_contact_phone_number: "0622222222",
  });

  assert.equal(mapped.firstName, "Léa");
  assert.equal(mapped.lastName, "Bernard");
});

test("Systeme.io : même si email = mail affilié, on garde le mail du membre", () => {
  const mapped = mapIncomingLead({
    email: "webmarket.k@gmail.com",
    payload_affiliate_user_email: "webmarket.k@gmail.com",
    payload_member_email: "cliente.test@outlook.com",
    payload_member_first_name: "Clara",
    payload_contact_phone_number: "0611111111",
  });

  assert.equal(mapped.email, "cliente.test@outlook.com");
});

test("Systeme.io : un mail affilié tout seul n’est pas collé sur le lead", () => {
  const mapped = mapIncomingLead({
    email: "webmarket.k@gmail.com",
    payload_affiliate_user_email: "webmarket.k@gmail.com",
    payload_contact_phone_number: "0611111111",
  });

  assert.equal(mapped.email, "");
});

test("Systeme.io : le mail du membre, pas celui de l’affilié", () => {
  const mapped = mapIncomingLead({
    payload_affiliate_user_email: "sami@bookea.fr",
    payload_affiliate_user_name: "Sami",
    payload_member_email: "marie@cliente.fr",
    payload_member_first_name: "Marie",
    payload_member_last_name: "Dupont",
    payload_contact_phone_number: "06 12 34 56 78",
    payload_offer_title: "Laser jumelles",
  });

  assert.equal(mapped.email, "marie@cliente.fr");
  assert.equal(mapped.firstName, "Marie");
  assert.equal(mapped.lastName, "Dupont");
  assert.match(mapped.phone.replace(/\D/g, ""), /612345678/);
  assert.equal(mapped.campaign, "Laser jumelles");
});

test("payload_offer_title est lu comme campagne", () => {
  const mapped = mapIncomingLead({
    email: "a@b.fr",
    payload_offer_title: "Laser jumelles",
    form_name: "Meta Lead Ads",
  });

  assert.equal(mapped.campaign, "Laser jumelles");
});

test("Make : NOM/TEL collés dans l’offre sont recollés en vrai contact", () => {
  const mapped = mapIncomingLead(
    {},
    {
      center: "depil-tech-vichy",
      full_name: "NOM",
      phone: "TEL",
      email: "MAIL",
      offre:
        "OFFRERéseau Beauté Exclusive0613277582reseaubeauteexclusive@gmail.comBilan laser offert",
    },
  );
  assert.equal(mapped.firstName, "Réseau");
  assert.match(mapped.lastName, /Beaut/);
  assert.equal(mapped.email, "reseaubeauteexclusive@gmail.com");
  assert.match(mapped.phone.replace(/\D/g, ""), /613277582/);
  assert.match(mapped.campaign, /Bilan laser/);
});

test("Make : 4 lignes collées (nom, tel, email, offre) suffisent", () => {
  const { payloadFromBody, mapIncomingLead } = require("./saveleads");
  const payload = payloadFromBody(
    "Marie Dupont\n06 12 34 56 78\nmarie@cliente.fr\nÉpilation laser",
  );
  const mapped = mapIncomingLead(payload, {});
  assert.equal(mapped.firstName, "Marie");
  assert.equal(mapped.lastName, "Dupont");
  assert.equal(mapped.email, "marie@cliente.fr");
  assert.match(mapped.phone.replace(/\D/g, ""), /612345678/);
  assert.equal(mapped.campaign, "Épilation laser");
});

test("Make / Systeme.io : la source n’est pas Facebook", () => {
  const { resolveIncomingSource } = require("./saveleads");
  assert.equal(resolveIncomingSource({}, { source: "make" }, "Facebook"), "Make");
  assert.equal(
    resolveIncomingSource({ source: "systeme.io" }, {}, "Facebook"),
    "Systeme.io",
  );
  assert.equal(resolveIncomingSource({}, {}, "Facebook"), "Facebook");
});
