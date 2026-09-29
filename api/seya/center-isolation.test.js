const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { buildPriceReply } = require("./price");
const { generateSeyaReply } = require("./ai");
const { isolateSeyaFromRemote, isSeyaOff, isSeyaWelcomeOff } = require("./store");

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

const clermont = {
  whatsappAgentEnabled: true,
  autoMessageOnNewLead: true,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      pricing: {
        bilan: "offert",
        discovery: "offerte",
        session: "",
        package: "",
        sessionPolicy: "after_bilan",
      },
      price: "Le bilan et la séance découverte sont offerts.",
    },
  ],
  offerMaps: [],
};

const gap = {
  whatsappAgentEnabled: false,
  autoMessageOnNewLead: false,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      pricing: {
        bilan: "99€",
        discovery: "99€",
        session: "",
        package: "",
        sessionPolicy: "after_bilan",
      },
      price: "Le bilan est à 99€.",
    },
  ],
  offerMaps: [
    { match: "offre 99", label: "une séance découverte / bilan à 99€" },
    { match: "offre 49", label: "une séance découverte / bilan à 49€" },
  ],
};

test("le cache local de Clermont ne remplit jamais Gap", () => {
  const isolated = isolateSeyaFromRemote(gap, clermont);
  assert.equal(isolated.whatsappAgentEnabled, false);
  assert.equal(isolated.offerMaps[0].label.includes("99€"), true);
  assert.equal(isolated.treatmentBriefs[0].pricing.bilan, "99€");
  assert.doesNotMatch(JSON.stringify(isolated), /offert/i);
});

test("un seya Gap vide n’hérite pas des fiches offertes de Clermont", () => {
  const isolated = isolateSeyaFromRemote(
    { whatsappAgentEnabled: false, conversations: [] },
    clermont,
  );
  assert.equal(isolated.whatsappAgentEnabled, false);
  assert.deepEqual(isolated.treatmentBriefs, []);
  assert.deepEqual(isolated.offerMaps, []);
  assert.equal(isSeyaOff(isolated), true);
  assert.equal(isSeyaWelcomeOff(isolated), true);
});

test("Off sur Gap reste Off, On sur Clermont reste On", () => {
  assert.equal(isSeyaOff(gap), true);
  assert.equal(isSeyaWelcomeOff(gap), true);
  assert.equal(isSeyaOff(clermont), false);
  assert.equal(isSeyaWelcomeOff(clermont), false);
});

test("le tarif 99 € de Gap ne devient pas le bilan offert de Clermont", () => {
  const text = buildPriceReply("C’est combien ?", gap, {
    campaign: "offre 99",
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
  });
  assert.match(text, /99€/);
  assert.doesNotMatch(text, /offert|gratuit/i);

  const clermontText = buildPriceReply("C’est combien ?", clermont, {
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
  });
  assert.match(clermontText, /offert/i);
  assert.doesNotMatch(clermontText, /99€/);
});

test("deux centres à la suite : chaque réponse reste sur son tarif", async () => {
  const conversation = {
    id: "lead-iso",
    leadId: "lead-iso",
    centerId: "center-gap",
    firstName: "Léa",
    lastName: "Test",
    phone: "0612345678",
    treatment: "Soin minceur",
    campaign: "offre 99",
    qualification: { need: "Soin minceur" },
    messages: [],
  };

  const gapReply = await generateSeyaReply({
    conversation: { ...conversation, centerId: "center-gap" },
    text: "C’est combien le bilan ?",
    seya: gap,
    appointments: [],
    hours: hours(),
    centerName: "JFG Gap",
    centerId: "center-gap",
    now: NOW,
  });
  assert.match(lastSeya(gapReply.conversation), /99€/);
  assert.doesNotMatch(lastSeya(gapReply.conversation), /offert|gratuit/i);
  assert.equal(gapReply.conversation.centerId, "center-gap");

  const clermontReply = await generateSeyaReply({
    conversation: { ...conversation, centerId: "center-clermont", campaign: "" },
    text: "C’est combien le bilan ?",
    seya: clermont,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clermont",
    centerId: "center-clermont",
    now: NOW,
  });
  assert.match(lastSeya(clermontReply.conversation), /offert/i);
  assert.doesNotMatch(lastSeya(clermontReply.conversation), /99€/);
  assert.equal(clermontReply.conversation.centerId, "center-clermont");
});
