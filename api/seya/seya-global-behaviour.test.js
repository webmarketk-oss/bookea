const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { shouldSkipRelance } = require("./relance");
const { isLeadRefusal } = require("./conversation");

const NOW = new Date("2026-10-15T10:00:00");
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

const DEVICES = {
  clermont: { minceur: "cryolipolyse et radiofréquence", laser: "laser diode", visage: "HydraFacial" },
  lyon: { minceur: "pressothérapie et cavitation", laser: "laser alexandrite", visage: "microneedling" },
  gaillard: { minceur: "cryolipolyse et radiofréquence", laser: "laser diode", visage: "HydraFacial" },
  vichy: { minceur: "lipolaser et électrostimulation", laser: "laser Nd:YAG", visage: "peeling" },
};

const briefs = (id) => [
  {
    name: "Soin minceur",
    brief: `Bilan minceur offert avec analyse corporelle.\nAppareils minceur : ${DEVICES[id].minceur}.`,
    pricing: { bilan: "offert", discovery: "offerte", sessionPolicy: "after_bilan" },
  },
  {
    name: "Épilation laser",
    brief: `Épilation au ${DEVICES[id].laser}.\nUn bilan pilaire est offert avant la première séance.`,
  },
  {
    name: "Soin visage",
    brief: `Diagnostic de peau offert.\nAppareil visage : ${DEVICES[id].visage}.`,
  },
];

const CENTERS = [
  {
    name: "JFG Clinique Clermont",
    id: "clermont",
    address: "12 rue de la République, 63000 Clermont-Ferrand",
    seya: { seyaMission: "book", bookAppointment: true, askForAppointment: true, handoffToHuman: true, treatmentBriefs: briefs("clermont") },
  },
  {
    name: "Centre Lyon Rappel",
    id: "lyon",
    address: "1 place Bellecour, 69002 Lyon",
    seya: { seyaMission: "qualify_callback", bookAppointment: false, handoffToHuman: true, treatmentBriefs: briefs("lyon") },
  },
  {
    name: "JFG Clinic Gaillard",
    id: "gaillard",
    address: "58 rue de la Libération, 74240 Gaillard",
    seya: { seyaMission: "qualify_callback", bookAppointment: false, treatmentBriefs: briefs("gaillard") },
  },
  {
    name: "Centre Vichy Accueil",
    id: "vichy",
    address: "3 rue de Paris, 03200 Vichy",
    seya: { seyaMission: "welcome_relance", bookAppointment: false, handoffToHuman: true, treatmentBriefs: briefs("vichy") },
  },
];

const SPOKEN_DEVICE = {
  "cryolipolyse et radiofréquence": /la cryo,.*radiofréquence/,
  // Le prospect parle du ventre : la pressothérapie (jambes) n’est pas citée.
  "pressothérapie et cavitation": /cavitation/,
  "lipolaser et électrostimulation": /lipolaser|électrostimulation/,
  "laser diode": /laser diode/,
  "laser alexandrite": /laser alexandrite/,
  "laser Nd:YAG": /laser Nd:YAG/,
  HydraFacial: /HydraFacial/,
  microneedling: /microneedling/,
  peeling: /peeling/,
};
const ALL_DEVICES = /\bcryo\b|radiofréquence|pressothérapie|cavitation|lipolaser|électrostimulation|laser diode|alexandrite|Nd:YAG|HydraFacial|microneedling|peeling/g;

const FAMILIES = [
  ["minceur", "Soin minceur", "Je veux perdre du ventre"],
  ["laser", "Épilation laser", "Les aisselles et le maillot"],
  ["visage", "Soin visage", "J'ai des rides et la peau terne"],
];

function lastSeya(conversation) {
  return [...(conversation.messages || [])].reverse().find((m) => m.author === "seya")?.text || "";
}

async function say(center, conversation, text) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya: center.seya,
    appointments: [],
    hours,
    centerName: center.name,
    centerAddress: center.address,
    centerId: center.id,
    now: NOW,
  });
  return result.conversation;
}

async function opened(center, family, treatment, need) {
  const conversation = startConversation(
    { leadId: `l-${center.id}-${family}`, centerId: center.id, firstName: "Léa", phone: "0611223344", treatment },
    center.name,
    center.seya,
  );
  return say(center, conversation, need);
}

function withAskOther(conversation) {
  return {
    ...conversation,
    messages: [
      ...conversation.messages,
      { author: "lead", text: "Merci pour l'info", at: NOW.toISOString() },
      { author: "seya", text: "Avec plaisir 😊 Avez-vous une autre question ?", at: NOW.toISOString() },
    ],
  };
}

for (const center of CENTERS) {
  for (const [family, treatment, need] of FAMILIES) {
    const label = `${center.name} — ${family}`;

    test(`${label} : la question sur les appareils reçoit les appareils de CE centre et de CE soin, reformulés`, async () => {
      const conversation = await say(center, await opened(center, family, treatment, need), "Quels appareils utilisez-vous ?");
      const said = lastSeya(conversation);
      const own = DEVICES[center.id][family];
      assert.match(said, SPOKEN_DEVICE[own]);
      for (const device of said.match(ALL_DEVICES) || []) {
        assert.ok(own.toLowerCase().includes(device.toLowerCase()), `${device} n’appartient pas à ${label}`);
      }
      assert.doesNotMatch(said, /Appareils? (minceur|visage) :|fiche|pressothérapie|cryo[\s-]*lipolys/i);
    });

    test(`${label} : « Non merci » après « autre question ? » clôt sans question ni « Pas intéressé »`, async () => {
      for (const reply of ["Non merci", "No", "non merci 😊"]) {
        const conversation = await say(center, withAskOther(await opened(center, family, treatment, need)), reply);
        assert.match(lastSeya(conversation), /merci à vous/i, reply);
        assert.doesNotMatch(lastSeya(conversation), /\?/, reply);
        assert.doesNotMatch(String(conversation.status), /pas int/i, reply);
        assert.equal(shouldSkipRelance(conversation), true, reply);
      }
    });

    test(`${label} : un refus commercial ferme le fil, sans relance`, async () => {
      const conversation = await say(center, await opened(center, family, treatment, need), "Ça ne m'intéresse pas");
      assert.equal(conversation.status, "Pas intéressé");
      assert.doesNotMatch(lastSeya(conversation), /\?/);
      assert.equal(shouldSkipRelance(conversation), true);
    });

    test(`${label} : « je reviendrai vers vous » met en pause, puis un nouveau message reçoit une réponse`, async () => {
      let conversation = await say(center, await opened(center, family, treatment, need), "Je reviendrai vers vous");
      assert.equal(conversation.status, "Terminé");
      assert.doesNotMatch(lastSeya(conversation), /\?/);
      assert.equal(shouldSkipRelance(conversation), true);
      conversation = await say(center, conversation, "Bonjour, finalement c'est combien ?");
      assert.match(lastSeya(conversation), /offert|tarif|bilan/i);
    });

    test(`${label} : un accord pour un rappel suit le fonctionnement du centre, sans relance automatique`, async () => {
      let conversation = await say(center, await opened(center, family, treatment, need), "Oui je veux bien être rappelée");
      if (center.id !== "gaillard") {
        assert.match(lastSeya(conversation), /demande a été transmise à l’équipe/);
        assert.match(lastSeya(conversation), /expert ou une experte/);
        assert.doesNotMatch(lastSeya(conversation), /\?|opératrice/);
        assert.ok(conversation.teamNotes?.handedOffAt);
        conversation = await say(center, conversation, "Mardi à 14h");
        assert.match(lastSeya(conversation), /mardi 20\/10 vers 14h/);
        assert.match(lastSeya(conversation), /préférence à votre demande de rappel/);
        assert.doesNotMatch(lastSeya(conversation), /je peux vous proposer|lequel vous irait|opératrice/i);
      }
      assert.equal(conversation.status, "À recontacter");
      assert.equal(conversation.bookingState.pendingQuestion, "callback");
      assert.equal(shouldSkipRelance(conversation), true);
    });
  }
}

test("« Non merci » à une question fermée du parcours est une réponse, pas un refus", async () => {
  const center = CENTERS.find((item) => item.id === "gaillard");
  const conversation = await say(center, await opened(center, "minceur", "Soin minceur", "Je veux perdre du ventre"), "Non merci");
  assert.doesNotMatch(String(conversation.status), /pas int/i);
  assert.equal(conversation.qualification.tried, "Non merci");
});

test("« Non merci » à une proposition ouverte : on n’insiste pas, sans « Pas intéressé »", async () => {
  const center = CENTERS.find((item) => item.id === "clermont");
  const conversation = await say(center, await opened(center, "minceur", "Soin minceur", "Je veux perdre du ventre"), "Non merci");
  assert.match(lastSeya(conversation), /je n’insiste pas/);
  assert.doesNotMatch(lastSeya(conversation), /\?/);
  assert.notEqual(conversation.status, "Pas intéressé");
  assert.equal(shouldSkipRelance(conversation), true);
});

test("« Ne me rappelez pas » n’entraîne jamais de transmission de rappel", async () => {
  for (const center of CENTERS) {
    const conversation = await say(
      center,
      await opened(center, "laser", "Épilation laser", "Les aisselles et le maillot"),
      "Ne me rappelez pas, je préfère écrire ici",
    );
    assert.notEqual(conversation.bookingState?.pendingQuestion, "callback", center.name);
    assert.ok(!conversation.teamNotes?.handedOffAt, center.name);
  }
});

test("le refus se lit dans son contexte", () => {
  const askOther = { messages: [{ author: "seya", text: "Avez-vous une autre question ?" }] };
  assert.equal(isLeadRefusal("Non merci", askOther), false);
  assert.equal(isLeadRefusal("Non merci"), true);
  assert.equal(isLeadRefusal("Ça ne m'intéresse pas", askOther), true);
  assert.equal(isLeadRefusal("Ne m'écrivez plus"), true);
});
