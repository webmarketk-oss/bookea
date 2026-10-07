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

test("le mail contact gagne sur le mail du membre / du compte", () => {
  const mapped = mapIncomingLead({
    email: "webmarket.k@gmail.com",
    payload_member_email: "webmarket.k@gmail.com",
    payload_contact_email: "nathalie.ramos@outlook.fr",
    payload_member_first_name: "Nathalie",
    payload_member_last_name: "Ramos",
    payload_contact_phone_number: "33679836461",
    offre: "Soin minceur",
  });
  assert.equal(mapped.email, "nathalie.ramos@outlook.fr");
});

test("le mail du centre n’est pas collé sur le prospect Facebook", () => {
  const { rejectOwnerEmail, ownerEmailsFromCenter } = require("./saveleads");
  const blocked = ownerEmailsFromCenter({
    email: "webmarket.k@gmail.com",
    settings: { center: { email: "webmarket.k@gmail.com" } },
  });
  assert.equal(rejectOwnerEmail("webmarket.k@gmail.com", blocked), "");
  assert.equal(rejectOwnerEmail("nathalie@cliente.fr", blocked), "nathalie@cliente.fr");
});

test("Make : email mappé sur payload_member_email du compte → ignoré s’il est affilié", () => {
  const mapped = mapIncomingLead({
    email: "webmarket.k@gmail.com",
    payload_affiliate_user_email: "webmarket.k@gmail.com",
    payload_member_email: "webmarket.k@gmail.com",
    prénom: "Nathalie",
    nom: "Ramos",
    téléphone: "33679836461",
    offre: "Soin minceur",
  });
  assert.equal(mapped.email, "");
  assert.equal(mapped.firstName, "Nathalie");
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

test("Make : un bundle webhook Facebook suffit, même avec NOM/TEL dans l’URL", () => {
  const { payloadFromBody, mapIncomingLead } = require("./saveleads");
  const payload = payloadFromBody({
    bundle: {
      full_name: "Réseau Beauté Exclusive",
      phone: "0613277582",
      email: "reseaubeauteexclusive@gmail.com",
      offer: "Bilan laser offert + test offert",
    },
  });
  const mapped = mapIncomingLead(payload, {
    center: "depil-tech-vichy",
    full_name: "NOM",
    phone: "TEL",
    email: "MAIL",
    offre: "OFFRE",
  });
  assert.equal(mapped.firstName, "Réseau");
  assert.match(mapped.lastName, /Beaut/);
  assert.equal(mapped.email, "reseaubeauteexclusive@gmail.com");
  assert.match(mapped.phone.replace(/\D/g, ""), /613277582/);
  assert.match(mapped.campaign, /Bilan laser/);
});

test("Make : le nom de page SFK n’écrase pas le contact Facebook", () => {
  const mapped = mapIncomingLead({
    page: { name: "SFK Agency fz llc" },
    full_name: "Réseau Beauté Exclusive",
    phone: "0613277582",
    email: "reseaubeauteexclusive@gmail.com",
    offer: "Bilan laser offert + test offert",
  });
  assert.equal(mapped.firstName, "Réseau");
  assert.match(mapped.lastName, /Beaut/);
});

test("Make : le full_name Facebook est enregistré tel quel", () => {
  const mapped = mapIncomingLead({
    full_name: "SFK Agency fz llc",
    phone: "0613277583",
    email: "reseaubeauteexclusive@gmail.com",
    offer: "Bilan laser offert + test offert",
  });
  assert.equal(mapped.firstName, "SFK");
  assert.match(mapped.lastName, /Agency/);
  assert.equal(mapped.email, "reseaubeauteexclusive@gmail.com");
  assert.match(mapped.phone.replace(/\D/g, ""), /613277583/);
  assert.match(mapped.campaign, /Bilan laser/);
});

test("Make / Systeme.io / SaveMyLeads : la source n’est pas Facebook", () => {
  const { resolveIncomingSource } = require("./saveleads");
  assert.equal(resolveIncomingSource({}, { source: "make" }, "Facebook"), "Make");
  assert.equal(
    resolveIncomingSource({ source: "systeme.io" }, {}, "Facebook"),
    "Systeme.io",
  );
  assert.equal(
    resolveIncomingSource({}, { source: "savemyleads" }, "Facebook"),
    "SaveMyLeads",
  );
  assert.equal(
    resolveIncomingSource({}, { source: "bookea" }, "Facebook"),
    "Bookea",
  );
  assert.equal(
    resolveIncomingSource({}, { source: "landing" }, "Facebook"),
    "Landing",
  );
  assert.equal(
    resolveIncomingSource({}, { source: "vercel" }, "Facebook"),
    "Landing",
  );
  assert.equal(
    resolveIncomingSource({}, {}, "Facebook", {
      headers: { "user-agent": "SaveMyLeads" },
    }),
    "SaveMyLeads",
  );
  assert.equal(
    resolveIncomingSource({}, { source: "systeme.io" }, "Facebook", {
      headers: { "user-agent": "SaveMyLeads" },
    }),
    "Systeme.io",
  );
  assert.equal(resolveIncomingSource({}, {}, "Facebook"), "Facebook");
});

test("SaveMyLeads : le mail du compte n’est pas collé sur le prospect", () => {
  const mapped = mapIncomingLead({
    user: { email: "webmarket.k@gmail.com", name: "Bookea" },
    account: { email: "webmarket.k@gmail.com" },
    full_name: "NATHALIE RAMOS",
    phone: "33679836461",
    form_name: "Soin minceur",
  });
  assert.equal(mapped.email, "");
  assert.equal(mapped.firstName, "NATHALIE");
  assert.equal(mapped.lastName, "RAMOS");
});

test("SaveMyLeads : user_email est le mail Facebook du prospect", () => {
  const mapped = mapIncomingLead({
    user_email: "nathalie.ramos@outlook.fr",
    full_name: "NATHALIE RAMOS",
    phone: "33679836461",
    form_name: "Soin minceur",
  });
  assert.equal(mapped.email, "nathalie.ramos@outlook.fr");
  assert.equal(mapped.firstName, "NATHALIE");
});

test("SaveMyLeads : email + user_email identiques = mail du prospect", () => {
  const mapped = mapIncomingLead({
    email: "nathalie.ramos@outlook.fr",
    user_email: "nathalie.ramos@outlook.fr",
    phone: "33679836461",
    full_name: "NATHALIE RAMOS",
  });
  assert.equal(mapped.email, "nathalie.ramos@outlook.fr");
});

test("SaveMyLeads : le mail Facebook gagne sur payload_member_email du compte", () => {
  const mapped = mapIncomingLead({
    email: "nathalie.ramos@outlook.fr",
    payload_member_email: "webmarket.k@gmail.com",
    payload_affiliate_user_email: "webmarket.k@gmail.com",
    phone: "33679836461",
    full_name: "NATHALIE RAMOS",
  });
  assert.equal(mapped.email, "nathalie.ramos@outlook.fr");
});

test("SaveMyLeads : Options Name/Value sans email Facebook", () => {
  const mapped = mapIncomingLead({
    options: [
      { name: "prénom", value: "Mohammed" },
      { name: "nom", value: "DERGHAL" },
      { name: "téléphone", value: "33611111111" },
      { name: "offre", value: "Soin minceur" },
    ],
  });
  assert.equal(mapped.email, "");
  assert.equal(mapped.firstName, "Mohammed");
  assert.equal(mapped.lastName, "DERGHAL");
});
