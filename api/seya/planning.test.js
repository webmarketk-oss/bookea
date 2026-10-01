const assert = require("node:assert/strict");
const test = require("node:test");
const { generatePlanningReply, isPlanningProspectTone, planningPrompt } = require("./planning-ai");
const { pickPlanningSlots } = require("./planning-rules");

const seya = {
  brief: "Toujours vérifier le planning réel.",
  treatmentBriefs: [
    {
      name: "Cryolipolyse",
      brief: "Bilan 75 min. Pacemaker : ne pas poser.",
      price: "89 € le bilan",
    },
  ],
  offerMaps: [],
  centerProfile: {},
};

test("le prompt Planning n’est pas le script WhatsApp prospect", () => {
  const prompt = planningPrompt({
    settings: {
      brief: seya.brief,
      treatmentBriefs: seya.treatmentBriefs,
      centerProfile: {},
    },
    seya,
    slots: [{ label: "jeu. 08/10 à 16h00" }],
    hoursText: "Lun 09:00-19:00",
    centerName: "Formlyy",
    centerAddress: "12 rue Test",
    brief: "Bilan 75 min",
    price: "89 €",
    draft: "Créneau libre : jeu. 08/10 à 16h00.",
  });

  assert.match(prompt, /Seya Planning/);
  assert.match(prompt, /équipe/);
  assert.match(prompt, /pas Seya WhatsApp/);
  assert.match(prompt, /89 €/);
  assert.match(prompt, /plusieurs semaines/);
  assert.doesNotMatch(prompt, /Tu es Seya, au standard WhatsApp/);
});

test("sans clé IA, Planning répond en langage équipe", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await generatePlanningReply({
    conversation: {
      id: "agenda-desk",
      leadId: "agenda-desk",
      firstName: "l'équipe",
      lastName: "",
      phone: "",
      treatment: "",
      status: "En cours",
      qualification: { need: "", zone: "", delay: "", availability: "" },
      proposedSlots: [],
      centerId: "center-1",
      messages: [],
    },
    text: "un créneau cryo jeudi",
    seya,
    slots: [{ date: "2026-10-08", time: "16:00", label: "jeu. 08/10 à 16h00" }],
    hours: [{ weekday: 4, label: "Jeu", startTime: "09:00", endTime: "19:00", closed: false }],
    centerName: "Formlyy",
    centerAddress: "",
  });

  const reply = [...result.conversation.messages].reverse().find((item) => item.author === "seya")?.text || "";
  assert.equal(result.via, "rules");
  assert.equal(isPlanningProspectTone(reply), false);
  assert.doesNotMatch(reply, /lequel vous irait|quelle zone/i);

  if (previous) {
    process.env.OPENAI_API_KEY = previous;
  }
});

test("Planning cherche d’autres samedis si le prochain est plein à 11h", () => {
  const hours = [
    { weekday: 6, label: "Sam", startTime: "09:00", endTime: "19:00", closed: false },
  ];
  const slots = pickPlanningSlots(
    [
      { date: "2026-10-03", start: "11:00", duration: 75, status: "Confirmé", cabinId: "c1" },
      { date: "2026-10-03", start: "11:30", duration: 75, status: "Confirmé", cabinId: "c1" },
    ],
    hours,
    "samedi entre 11h et midi",
    { now: new Date("2026-10-01T10:00:00"), duration: 75 },
  );

  assert.ok(slots.length > 0);
  assert.equal(slots.some((slot) => slot.date === "2026-10-03"), false);
  assert.ok(slots.some((slot) => slot.date === "2026-10-10" && slot.time === "11:00"));
});
