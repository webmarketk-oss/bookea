const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applySettingsPatch,
  mergeTreatmentBriefLists,
} = require("./settings-patch");
const { writeSeyaConversations } = require("./store");

function mockCenterClient(seya) {
  let stored = { seya };
  return {
    stored: () => stored,
    from(table) {
      if (table !== "centers") {
        return { insert: async () => ({ error: null }) };
      }
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { settings: structuredClone(stored) },
                  error: null,
                }),
              };
            },
          };
        },
        update(payload) {
          return {
            eq: async () => {
              stored = payload.settings;
              return { error: null };
            },
          };
        },
      };
    },
  };
}

test("modifier un seul champ ne vide pas les autres axes", () => {
  const base = {
    brief: "Consignes A",
    offerMaps: [{ match: "visage", label: "offre A" }],
    treatmentBriefs: [
      { name: "Soin minceur", brief: "Minceur A", opening: "O minceur" },
      { name: "Soin visage", brief: "Visage A", opening: "O visage" },
      { name: "Épilation laser", brief: "Laser A", opening: "O laser" },
    ],
  };
  const next = {
    ...base,
    treatmentBriefs: base.treatmentBriefs.map((item) =>
      item.name === "Soin visage"
        ? { ...item, brief: "Visage A modifié" }
        : item,
    ),
  };
  const merged = applySettingsPatch(base, next, ["treatmentBriefs"]);
  assert.equal(
    merged.treatmentBriefs.find((item) => item.name === "Soin minceur")?.brief,
    "Minceur A",
  );
  assert.equal(
    merged.treatmentBriefs.find((item) => item.name === "Épilation laser")?.brief,
    "Laser A",
  );
  assert.equal(
    merged.treatmentBriefs.find((item) => item.name === "Soin visage")?.brief,
    "Visage A modifié",
  );
  assert.equal(merged.brief, "Consignes A");
});

test("un patch brief ne remplace pas les fiches soin", () => {
  const base = {
    brief: "Consignes A",
    treatmentBriefs: [
      { name: "Soin visage", brief: "Visage A", opening: "O visage" },
    ],
  };
  const merged = applySettingsPatch(
    base,
    { ...base, brief: "Nouvelles consignes" },
    ["brief"],
  );
  assert.equal(merged.brief, "Nouvelles consignes");
  assert.equal(merged.treatmentBriefs[0].brief, "Visage A");
  assert.equal(merged.treatmentBriefs[0].opening, "O visage");
});

test("Clermont et Gaillard restent isolés dans le merge", () => {
  const clermont = {
    treatmentBriefs: [
      { name: "Soin visage", brief: "Visage Clermont", opening: "O Clermont" },
    ],
  };
  const gaillard = {
    treatmentBriefs: [
      { name: "Soin visage", brief: "Visage Gaillard", opening: "O Gaillard" },
    ],
    offerMaps: [{ match: "visage", label: "offre Gaillard" }],
  };
  const savedGaillard = applySettingsPatch(
    gaillard,
    {
      ...gaillard,
      treatmentBriefs: [
        {
          name: "Soin visage",
          brief: "Visage Gaillard modifié",
          opening: "O Gaillard",
        },
      ],
    },
    ["treatmentBriefs"],
  );
  assert.equal(clermont.treatmentBriefs[0].brief, "Visage Clermont");
  assert.equal(savedGaillard.treatmentBriefs[0].brief, "Visage Gaillard modifié");
  assert.doesNotMatch(JSON.stringify(savedGaillard), /Clermont/);
});

test("mergeTreatmentBriefLists conserve les champs absents du patch", () => {
  const merged = mergeTreatmentBriefLists(
    [
      {
        name: "Soin visage",
        brief: "long brief",
        opening: "ouverture",
        title: "titre",
        health: {
          validated: true,
          contraindications: "grossesse",
          precautions: "",
          professionalQuestions: "",
          transferTo: "équipe",
        },
      },
    ],
    [{ name: "Soin visage", brief: "long brief modifié" }],
  );
  assert.equal(merged[0].brief, "long brief modifié");
  assert.equal(merged[0].opening, "ouverture");
  assert.equal(merged[0].title, "titre");
  assert.equal(merged[0].health.contraindications, "grossesse");
});

test("writeSeyaConversations préserve les fiches soin du centre", async () => {
  const supabase = mockCenterClient({
    whatsappAgentEnabled: true,
    treatmentBriefs: [
      { name: "Soin visage", brief: "Visage Clermont", opening: "O" },
      { name: "Soin minceur", brief: "Minceur Clermont" },
    ],
    conversations: [{ id: "c1", centerId: "center-1", phone: "0611111111" }],
  });
  await writeSeyaConversations(supabase, "center-1", [
    { id: "c2", centerId: "center-1", phone: "0622222222" },
  ]);
  const seya = supabase.stored().seya;
  assert.equal(seya.treatmentBriefs[0].brief, "Visage Clermont");
  assert.equal(seya.treatmentBriefs[1].brief, "Minceur Clermont");
  assert.equal(seya.conversations.length, 2);
});
