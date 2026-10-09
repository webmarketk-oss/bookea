const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const {
  applyCareSwitch,
  extractNeed,
  faqReply,
  startConversation,
  visitDurationMinutes,
} = require("./agent");
const { buildPriceReply } = require("./price");
const { pickBookingResources } = require("./axis-resources");
const { inferCareFamily } = require("./care-family");

const NOW = new Date("2026-09-27T12:00:00");

function hours() {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "19:00",
    closed: weekday === 0,
  }));
}

function lastSeya(conversation) {
  return (
    [...(conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function axisBriefs(center) {
  const clermont = center === "clermont";
  return [
    {
      name: "Épilation laser",
      durationMinutes: clermont ? 45 : 30,
      pricing: {
        bilan: clermont ? "offert" : "49€",
        discovery: "",
        session: clermont ? "" : "à partir de 29€",
        package: "",
        sessionPolicy: clermont ? "after_bilan" : "from",
      },
      price: clermont ? "" : "Bilan laser 49€",
      brief: clermont ? "Laser Clermont uniquement." : "Laser Vichy uniquement.",
      health: {
        validated: true,
        contraindications: clermont
          ? "Grossesse Clermont laser."
          : "Grossesse Vichy laser.",
        precautions: clermont ? "Pas de soleil Clermont." : "Pas de soleil Vichy.",
        professionalQuestions: "",
        transferTo: "la praticienne laser",
      },
    },
    {
      name: "Soin minceur",
      durationMinutes: clermont ? 60 : 75,
      pricing: {
        bilan: clermont ? "offert" : "99€",
        discovery: clermont ? "offerte" : "99€",
        session: "",
        package: clermont ? "à partir de 500€" : "",
        sessionPolicy: "after_bilan",
      },
      brief: clermont ? "Minceur Clermont uniquement." : "Minceur Vichy uniquement.",
    },
    {
      name: "Soin visage",
      durationMinutes: clermont ? 50 : 40,
      pricing: {
        bilan: clermont ? "149€" : "89€",
        discovery: "",
        session: "",
        package: "",
        sessionPolicy: "after_bilan",
      },
      brief: clermont ? "Visage Clermont uniquement." : "Visage Vichy uniquement.",
    },
  ];
}

function centerSeya(id) {
  return {
    whatsappAgentEnabled: true,
    autoMessageOnNewLead: true,
    seyaMission: "book",
    treatmentBriefs: axisBriefs(id),
    offerMaps:
      id === "clermont"
        ? [
            { match: "offre laser clermont", label: "bilan laser offert Clermont" },
            { match: "offre minceur clermont", label: "bilan minceur offert Clermont" },
            { match: "offre visage clermont", label: "diagnostic visage 149€ Clermont" },
          ]
        : [
            { match: "offre laser vichy", label: "bilan laser 49€ Vichy" },
            { match: "offre minceur vichy", label: "bilan minceur 99€ Vichy" },
            { match: "offre visage vichy", label: "soin visage 89€ Vichy" },
          ],
    catalogServices:
      id === "clermont"
        ? [
            { name: "Épilation Laser", category: "Laser", duration: 45, cabins: "Cabine Laser", practitioners: "Samantha" },
            { name: "Cryolipolyse", category: "Silhouette", duration: 60, cabins: "Cabine Minceur", practitioners: "Aurélie" },
            { name: "Hydrafacial", category: "Soin du visage", duration: 50, cabins: "Cabine Visage", practitioners: "Camille" },
          ]
        : [
            { name: "Épilation Laser", category: "Laser", duration: 30, cabins: "Cabine 1", practitioners: "Marie" },
            { name: "Soin minceur", category: "Silhouette", duration: 75, cabins: "Cabine 2", practitioners: "Inès" },
            { name: "Hydrafacial", category: "Soin du visage", duration: 40, cabins: "Cabine 3", practitioners: "Léa" },
          ],
  };
}

const clermont = centerSeya("clermont");
const vichy = centerSeya("vichy");

function lead(centerId, treatment, campaign) {
  return startConversation(
    {
      leadId: `lead-${centerId}-${treatment}`,
      centerId,
      firstName: "Léa",
      lastName: "Test",
      phone: "0612345678",
      treatment,
      campaign,
    },
    centerId === "center-clermont" ? "JFG Clermont" : "Dépil Tech Vichy",
    centerId === "center-clermont" ? clermont : vichy,
  );
}

async function ask(conversation, text, seya, centerId, centerName) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: [],
    hours: hours(),
    centerName,
    centerId,
    now: NOW,
  });
  return result.conversation;
}

const AXES = [
  { treatment: "Épilation laser", family: "epilation", durationKey: /45|30/, clermontPrice: /offert/i, vichyPrice: /49€/ },
  { treatment: "Soin minceur", family: "minceur", durationKey: /60|75|1 heure/, clermontPrice: /offert/i, vichyPrice: /99€/ },
  { treatment: "Soin visage", family: "visage", durationKey: /50|40/, clermontPrice: /149€/, vichyPrice: /89€/ },
];

test("chaque axe garde sa durée, y compris d’un centre à l’autre", () => {
  for (const axis of AXES) {
    const clermontLead = lead("center-clermont", axis.treatment, "");
    const vichyLead = lead("center-vichy", axis.treatment, "");
    const clermontMin = visitDurationMinutes(clermont, clermontLead, "");
    const vichyMin = visitDurationMinutes(vichy, vichyLead, "");
    assert.notEqual(clermontMin, vichyMin, axis.treatment);
    assert.equal(
      clermontMin,
      axis.treatment === "Épilation laser" ? 45 : axis.treatment === "Soin minceur" ? 60 : 50,
    );
    assert.equal(
      vichyMin,
      axis.treatment === "Épilation laser" ? 30 : axis.treatment === "Soin minceur" ? 75 : 40,
    );
  }
});

test("les trois axes de Clermont ne se mélangent pas avec Vichy sur le tarif", async () => {
  for (const axis of AXES) {
    const clermontConv = await ask(
      lead("center-clermont", axis.treatment, `offre ${axis.family} clermont`),
      "C’est combien ?",
      clermont,
      "center-clermont",
      "JFG Clermont",
    );
    const vichyConv = await ask(
      lead("center-vichy", axis.treatment, `offre ${axis.family} vichy`),
      "C’est combien ?",
      vichy,
      "center-vichy",
      "Dépil Tech Vichy",
    );
    const clermontText = lastSeya(clermontConv);
    const vichyText = lastSeya(vichyConv);
    assert.match(clermontText, axis.clermontPrice, axis.treatment);
    assert.match(vichyText, axis.vichyPrice, axis.treatment);
    assert.doesNotMatch(clermontText, /Vichy|\b99€|\b89€|\b49€/);
    assert.doesNotMatch(vichyText, /Clermont|500€|149€/);
    if (axis.family === "epilation") {
      assert.doesNotMatch(clermontText, /analyse corporelle|500€/);
      assert.doesNotMatch(vichyText, /analyse corporelle|500€/);
    }
    if (axis.family === "visage") {
      assert.doesNotMatch(clermontText, /analyse corporelle|offerts, c’est gratuit/i);
    }
  }
});

test("un switch laser → minceur oublie la campagne laser et prend la durée minceur", () => {
  const conversation = {
    ...lead("center-clermont", "Épilation laser", "offre laser clermont"),
    campaign: "offre laser clermont",
    offerLabel: "bilan laser offert Clermont",
  };
  const switched = applyCareSwitch(conversation, { need: "Soin minceur" });
  assert.equal(switched.campaign, "");
  assert.equal(switched.offerLabel, "");
  assert.match(switched.treatment, /minceur/i);
  assert.equal(
    visitDurationMinutes(clermont, { ...switched, qualification: { need: "Soin minceur" } }, ""),
    60,
  );
  assert.equal(
    visitDurationMinutes(clermont, conversation, ""),
    45,
  );
});

test("après « non pas du laser, du minceur », le besoin n’est plus le laser", () => {
  assert.equal(extractNeed("Non pas du laser, du minceur"), "Soin minceur");
  assert.equal(inferCareFamily("Non pas du laser, du minceur"), "minceur");
});

test("un axe flou déclenche une question courte, sans inventer un soin", async () => {
  const conversation = startConversation(
    {
      leadId: "lead-ambigu",
      centerId: "center-clermont",
      firstName: "Sam",
      lastName: "Test",
      phone: "0611223344",
      treatment: "",
      campaign: "Meta Lead Ads",
    },
    "JFG Clermont",
    clermont,
  );
  const next = await ask(
    conversation,
    "Bonjour, je vous contacte pour un renseignement",
    clermont,
    "center-clermont",
    "JFG Clermont",
  );
  assert.match(lastSeya(next), /minceur|visage|épilation/i);
  assert.doesNotMatch(lastSeya(next), /149€|500€|49€/);
});

test("la durée dite à la cliente suit la fiche de l’axe", () => {
  const laser = lead("center-vichy", "Épilation laser", "");
  const minceur = lead("center-clermont", "Soin minceur", "");
  const visage = lead("center-clermont", "Soin visage", "");
  assert.match(
    faqReply("Ça dure combien de temps ?", { seya: vichy, conversation: laser }),
    /30 minutes/,
  );
  assert.match(
    faqReply("Ça dure combien de temps ?", { seya: clermont, conversation: minceur }),
    /1 heure/,
  );
  assert.match(
    faqReply("Ça dure combien de temps ?", { seya: clermont, conversation: visage }),
    /50 minutes/,
  );
});

test("l’agenda choisit cabine et praticienne de l’axe, pas celles d’un autre soin", () => {
  const rooms = [
    { id: "r-laser", name: "Cabine Laser" },
    { id: "r-minceur", name: "Cabine Minceur" },
    { id: "r-visage", name: "Cabine Visage" },
  ];
  const practitioners = [
    { id: "p-sam", first_name: "Samantha", last_name: "" },
    { id: "p-aurelie", first_name: "Aurélie", last_name: "" },
    { id: "p-camille", first_name: "Camille", last_name: "" },
  ];
  const laser = pickBookingResources({
    rooms,
    practitioners,
    seya: clermont,
    family: "epilation",
  });
  const minceur = pickBookingResources({
    rooms,
    practitioners,
    seya: clermont,
    family: "minceur",
  });
  const visage = pickBookingResources({
    rooms,
    practitioners,
    seya: clermont,
    family: "visage",
  });
  assert.equal(laser.room.id, "r-laser");
  assert.equal(laser.practitioner.id, "p-sam");
  assert.equal(minceur.room.id, "r-minceur");
  assert.equal(minceur.practitioner.id, "p-aurelie");
  assert.equal(visage.room.id, "r-visage");
  assert.equal(visage.practitioner.id, "p-camille");
});

test("un tarif visage Clermont ne fuit pas sur un lead minceur du même centre", () => {
  const text = buildPriceReply("C’est combien ?", clermont, {
    treatment: "Soin minceur",
    campaign: "offre minceur clermont",
    qualification: { need: "Soin minceur" },
  });
  assert.match(text, /offert/i);
  assert.doesNotMatch(text, /149€|89€|diagnostic visage/i);
});
