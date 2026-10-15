const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isGaillardCenter,
  repairGaillardLaserBrief,
  repairGaillardLaserSettings,
  repairOpeningPlaceholders,
} = require("./gaillard-laser-pricing");
const { mergeTreatmentBriefLists } = require("./settings-patch");
const { buildPriceReply } = require("./price");
const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");

delete process.env.OPENAI_API_KEY;

const NOW = new Date("2026-10-15T10:00:00");

test("seuls les centres Gaillard sont ciblés", () => {
  assert.equal(isGaillardCenter("JFG Clinic Gaillard"), true);
  assert.equal(isGaillardCenter("JFG Clinique Clermont"), false);
});

test("ouverture : le 2e {centre} après offre devient {offre}", () => {
  assert.equal(
    repairOpeningPlaceholders(
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour notre offre {centre}.",
    ),
    "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour notre offre {offre}.",
  );
});

test("Gaillard laser : champs tarifaires remis au bon endroit, sans 300 €", () => {
  const { brief, changed } = repairGaillardLaserBrief({
    name: "Épilation définitive",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour notre offre {centre}.",
    price: "à partir de 300 €",
    pricing: {
      bilan: "",
      discovery: "",
      session: "à partir de 300 €",
      package: "à partir de 300 €",
      sessionPolicy: "from",
    },
    brief: "Grille par zone + remises multizones + aisselles offertes.",
  });
  assert.equal(changed, true);
  assert.equal(brief.pricing.bilan, "offert et sans engagement");
  assert.match(brief.pricing.discovery, /test laser offert/i);
  assert.equal(brief.pricing.session, "");
  assert.doesNotMatch(brief.pricing.package, /300/);
  assert.match(brief.pricing.package, /8 séances|grille|aisselles/i);
  assert.match(brief.opening, /offre \{offre\}/);
  assert.doesNotMatch(brief.opening, /offre \{centre\}/);
});

test("Clermont n’est pas modifié par la réparation Gaillard", () => {
  const settings = {
    treatmentBriefs: [
      {
        name: "Épilation définitive",
        pricing: { bilan: "offert", package: "à partir de 300 €", session: "63 €" },
      },
    ],
  };
  const repaired = repairGaillardLaserSettings(settings, "JFG Clinique Clermont");
  assert.equal(repaired.changed, false);
  assert.equal(repaired.settings.treatmentBriefs[0].pricing.session, "63 €");
});

test("merge tarifs : un champ modifié conserve brief, durée et autres axes", () => {
  const remote = [
    {
      name: "Soin minceur",
      brief: "Minceur A",
      durationMinutes: 90,
      pricing: { bilan: "offert", package: "500", session: "" },
    },
    {
      name: "Épilation définitive",
      brief: "Laser A",
      pricing: { bilan: "offert", package: "grille", session: "" },
    },
  ];
  const incoming = [
    {
      name: "Épilation définitive",
      pricing: { package: "grille mise à jour" },
    },
  ];
  const merged = mergeTreatmentBriefLists(remote, incoming);
  assert.equal(merged.find((item) => item.name === "Soin minceur")?.brief, "Minceur A");
  assert.equal(merged.find((item) => item.name === "Soin minceur")?.durationMinutes, 90);
  assert.equal(
    merged.find((item) => item.name === "Épilation définitive")?.brief,
    "Laser A",
  );
  assert.equal(
    merged.find((item) => item.name === "Épilation définitive")?.pricing.bilan,
    "offert",
  );
  assert.equal(
    merged.find((item) => item.name === "Épilation définitive")?.pricing.package,
    "grille mise à jour",
  );
});

test("deux centres : même question, tarifs propres", async () => {
  const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "19:00",
    closed: weekday === 0,
  }));
  const gaillard = {
    seyaMission: "qualify_callback",
    bookAppointment: false,
    treatmentBriefs: [
      {
        name: "Épilation définitive",
        brief: "Épilation laser Gaillard. Remises multizones.",
        pricing: {
          bilan: "offert et sans engagement",
          discovery: "test laser offert et sans engagement",
          session: "",
          package:
            "Programme de 8 séances (6 + 2 entretien), grille par zone. Aisselles offertes selon conditions.",
          sessionPolicy: "after_bilan",
        },
      },
      {
        name: "Soin minceur",
        pricing: { bilan: "offert", package: "à partir de 500 euros" },
      },
    ],
  };
  const clermont = {
    seyaMission: "book",
    bookAppointment: true,
    treatmentBriefs: [
      {
        name: "Épilation définitive",
        pricing: { bilan: "offert", session: "63 €", sessionPolicy: "from" },
      },
      {
        name: "Soin minceur",
        pricing: { bilan: "offert", package: "à partir de 700 euros" },
      },
    ],
  };

  assert.match(
    buildPriceReply("c’est combien le forfait", gaillard, {
      treatment: "Épilation définitive",
      _seya: gaillard,
      qualification: { need: "Épilation" },
    }),
    /8 séances|grille|aisselles/i,
  );
  assert.doesNotMatch(
    buildPriceReply("c’est combien le forfait", gaillard, {
      treatment: "Épilation définitive",
      _seya: gaillard,
      qualification: { need: "Épilation" },
    }),
    /500|700|63/,
  );
  assert.match(
    buildPriceReply("c’est combien une séance", clermont, {
      treatment: "Épilation définitive",
      _seya: clermont,
      qualification: { need: "Épilation" },
    }),
    /63/,
  );

  let conversation = startConversation(
    {
      leadId: "cross-family",
      centerId: "gaillard",
      firstName: "Léa",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinic Gaillard",
    gaillard,
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Je veux faire épiler les jambes, ça coûte combien ?",
    seya: gaillard,
    appointments: [],
    hours,
    centerName: "JFG Clinic Gaillard",
    centerAddress: "58 rue de la Libération, 74240 Gaillard",
    centerId: "gaillard",
    now: NOW,
  });
  const said =
    [...(result.conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || "";
  assert.doesNotMatch(said, /500 euros|analyse corporelle/i);
  assert.match(said, /bilan pilaire|forfait|8 séances|grille|séance/i);
});

test("tarif absent : aucune invention", () => {
  const seya = {
    treatmentBriefs: [{ name: "Soin visage", pricing: { bilan: "", session: "", package: "" } }],
  };
  assert.match(
    buildPriceReply("c’est combien", seya, {
      treatment: "Soin visage",
      _seya: seya,
      qualification: { need: "Soin visage" },
    }),
    /pas ce tarif|pas .*fiche|équipe/i,
  );
});
