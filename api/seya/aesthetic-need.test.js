const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply, pickSafeReply } = require("./ai");
const { startConversation } = require("./agent");
const { applyBookingMessage } = require("./booking-state");
const { awaitingHealthReply, classifyHealthMessage } = require("./health");

const NOW = new Date("2026-10-13T10:00:00");

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

function healthSheet(who) {
  return {
    validated: true,
    contraindications: `Grossesse ${who}.`,
    precautions: "",
    professionalQuestions: "",
    transferTo: `la praticienne ${who}`,
  };
}

function centerSettings(who, mission, offers) {
  return {
    whatsappAgentEnabled: true,
    autoMessageOnNewLead: true,
    seyaMission: mission,
    treatmentBriefs: [
      { name: "Soin visage", brief: `Visage ${who}.`, durationMinutes: 75, health: healthSheet(who) },
      { name: "Soin minceur", brief: `Minceur ${who}.`, durationMinutes: 60, health: healthSheet(who) },
      { name: "Épilation laser", brief: `Laser ${who}.`, durationMinutes: 30, health: healthSheet(who) },
    ],
    offerMaps: [
      { match: "visage", label: offers.visage },
      { match: "minceur", label: offers.minceur },
      { match: "laser", label: offers.laser },
    ],
  };
}

const CENTERS = {
  lift: {
    id: "center-lift",
    name: "Centre Lift",
    seya: centerSettings("Lift", "book", {
      visage: "bilan Lift4 offert + test sur une moitié du visage (1 h 15)",
      minceur: "bilan minceur offert",
      laser: "bilan laser offert",
    }),
  },
  rappel: {
    id: "center-rappel",
    name: "Centre Rappel",
    seya: centerSettings("Rappel", "qualify_callback", {
      visage: "bilan visage à 89€",
      minceur: "bilan minceur à 99€",
      laser: "test laser à 49€",
    }),
  },
};

const AXES = {
  visage: "Soin visage",
  minceur: "Soin minceur",
  laser: "Épilation laser",
};

const AESTHETIC = {
  visage: [
    "J’ai des rides et un relâchement, je peux faire le soin ?",
    "J’ai des taches sur le visage, est-ce possible de les traiter ?",
    "Ma peau manque d’éclat, je peux faire le soin ?",
  ],
  minceur: [
    "J’ai 10 kilos à perdre et de la cellulite sur les cuisses, je peux faire une séance ?",
    "Je fais 85 kg, je voudrais perdre du ventre, c’est possible ?",
    "Je voudrais affiner ma silhouette",
  ],
  laser: [
    "J’ai des poils sur le menton, est-ce possible au laser ?",
    "J’ai une pilosité importante aux aisselles, je peux faire le laser ?",
    "je suis très poilue, je voudrais les aisselles et le maillot",
  ],
};

function start(center, axis) {
  return startConversation(
    {
      leadId: `lead-${center.id}-${axis}`,
      centerId: center.id,
      firstName: "Léa",
      phone: "0612345678",
      treatment: AXES[axis],
      campaign: axis,
    },
    center.name,
    center.seya,
  );
}

function reply(center, conversation, text) {
  return generateSeyaReply({
    conversation,
    text,
    seya: center.seya,
    appointments: [],
    hours: hours(),
    centerName: center.name,
    centerAddress: "1 rue du Centre",
    centerId: center.id,
    now: NOW,
  });
}

test("un objectif esthétique n’est jamais classé comme situation de santé", () => {
  for (const messages of Object.values(AESTHETIC)) {
    for (const text of messages) {
      const kind = classifyHealthMessage(text);
      assert.equal(kind.personal, false, text);
      assert.equal(kind.general, false, text);
    }
  }
  for (const text of [
    "Je suis intéressée par un traitement anti-âge",
    "j’ai besoin d’un traitement pour les jambes",
    "j’ai déjà fait un traitement laser ailleurs",
    "Je veux faire attention à ma silhouette",
    "Je veux perdre du poids pour ma santé",
  ]) {
    assert.equal(classifyHealthMessage(text).personal, false, text);
  }
});

test("une vraie information de santé reste détectée", () => {
  for (const text of [
    "Je suis enceinte, je peux faire la cryo ?",
    "Je prends un traitement, je peux faire le laser ?",
    "J’ai un pacemaker",
    "j’ai un problème de santé",
    "je suis diabétique, est-ce possible ?",
    "J’allaite encore mon bébé",
    "Je suis sous roaccutane",
  ]) {
    assert.equal(classifyHealthMessage(text).personal, true, text);
  }
  assert.equal(classifyHealthMessage("Quelles sont les contre-indications ?").general, true);
  assert.equal(classifyHealthMessage("Est-ce dangereux pendant la grossesse ?").personal, false);
});

test("2 centres × 3 axes : le besoin esthétique qualifie, sans transfert", async () => {
  for (const center of Object.values(CENTERS)) {
    for (const [axis, messages] of Object.entries(AESTHETIC)) {
      for (const text of messages) {
        const result = await reply(center, start(center, axis), text);
        const conversation = result.conversation;
        const said = lastSeya(conversation);
        const where = `${center.name} / ${axis} / ${text}`;
        assert.notEqual(conversation.status, "Revue santé", where);
        assert.notEqual(conversation.healthReview?.status, "awaiting_human_health_review", where);
        assert.doesNotMatch(
          said,
          /vérifi\w* votre situation|contre-indication|transmet|vous faire rappeler|n’hésitez pas|en attendant/i,
          where,
        );
        assert.equal(conversation.qualification.need, AXES[axis], where);
      }
    }
  }
});

test("« est-ce possible ? » : réponse avec l’offre de CE centre uniquement", async () => {
  const lift = CENTERS.lift;
  const rappel = CENTERS.rappel;

  const liftVisage = lastSeya(
    (await reply(lift, start(lift, "visage"), AESTHETIC.visage[0])).conversation,
  );
  assert.match(liftVisage, /Lift4/);
  assert.match(liftVisage, /rides/);
  assert.doesNotMatch(liftVisage, /89€/);

  const rappelVisage = lastSeya(
    (await reply(rappel, start(rappel, "visage"), AESTHETIC.visage[0])).conversation,
  );
  assert.match(rappelVisage, /bilan visage à 89€/);
  assert.doesNotMatch(rappelVisage, /Lift4|moitié du visage|1 h 15/);

  const rappelLaser = lastSeya(
    (await reply(rappel, start(rappel, "laser"), AESTHETIC.laser[0])).conversation,
  );
  assert.match(rappelLaser, /test laser à 49€/);
  assert.doesNotMatch(rappelLaser, /minceur|visage|Lift4/i);
});

test("mission rendez-vous : une info de santé suit la fiche du soin de CE centre", async () => {
  const center = CENTERS.lift;
  const result = await reply(
    center,
    start(center, "laser"),
    "Je suis enceinte, je peux faire le laser ?",
  );
  const said = lastSeya(result.conversation);
  assert.equal(result.conversation.status, "Revue santé");
  assert.match(said, /praticienne Lift/);
  assert.doesNotMatch(said, /praticienne Rappel|vous pouvez|c’est possible|contre-indiqué/i);
  assert.equal(result.conversation.healthTask?.transferTo, "la praticienne Lift");
});

test("mission rappel : l’info santé est notée pour l’équipe, la qualification continue", async () => {
  const center = CENTERS.rappel;
  let conversation = start(center, "minceur");
  const said = [];
  let lastResult = null;
  for (const text of [
    "Le ventre",
    "Je suis enceinte, je peux faire la séance ?",
    "10 km",
    "Jamais rien fait",
    "Jeudi après-midi",
    "15h",
  ]) {
    lastResult = await reply(center, conversation, text);
    conversation = lastResult.conversation;
    said.push(lastSeya(conversation));
  }
  assert.match(said[1], /je le note pour l’équipe/);
  assert.match(said[1], /distance/);
  assert.doesNotMatch(said[1], /vérifi\w* votre situation|vous pouvez|c’est possible|contre-indiqué|compatible/i);
  assert.match(said[3], /expertes vous recontactera/);
  assert.match(said[5], /rappellera jeudi 15\/10 à 15h00/);
  assert.notEqual(conversation.status, "Revue santé");
  assert.equal(conversation.healthTask?.transferTo, "la praticienne Rappel");
  assert.match(conversation.healthTask?.context || "", /enceinte/);
  assert.equal(conversation.qualification.distance, "10 km");
  assert.equal(lastResult.shouldBook, null);
});

test("objectif sans zone (kilos, cellulite, poils) : on qualifie et on avance", async () => {
  const center = {
    ...CENTERS.rappel,
    seya: {
      ...CENTERS.rappel.seya,
      offerMaps: [
        { match: "minceur", label: "un bilan minceur à 99€" },
        { match: "laser", label: "une épilation définitive" },
      ],
    },
  };
  for (const [axis, text] of [
    ["minceur", "J’ai de la cellulite, c’est possible ?"],
    ["minceur", "Je voudrais perdre 10 kilos"],
    ["laser", "pilosité importante, ça marche ?"],
  ]) {
    let conversation = start(center, axis);
    conversation = {
      ...conversation,
      messages: [
        ...conversation.messages,
        { author: "seya", text: "Qu’aimeriez-vous améliorer et sur quelle zone ?" },
      ],
    };
    const said = lastSeya((await reply(center, conversation, text)).conversation);
    assert.match(said, /distance/, `${text} → ${said}`);
    assert.doesNotMatch(said, /je vous écoute|créneau|notre (un|une) |notre e /i, `${text} → ${said}`);
  }
});

test("mission rendez-vous : besoin → distance → essais → créneaux → réservation", async () => {
  const center = CENTERS.lift;
  let conversation = start(center, "visage");
  const turns = [];
  for (const text of [
    "J’ai des rides, je peux faire le soin ?",
    "10 km",
    "Non jamais",
    "Jeudi après-midi",
    "La première",
  ]) {
    const result = await reply(center, conversation, text);
    conversation = result.conversation;
    turns.push({ text, said: lastSeya(conversation), result });
  }
  assert.match(turns[0].said, /distance/);
  assert.doesNotMatch(turns[1].said, /zone|objectif pour la peau/i);
  assert.match(turns[2].said, /jours où vous êtes disponible/);
  assert.match(turns[3].said, /14h00/);
  assert.equal(turns[4].result.shouldBook?.time, "14:00");
  assert.equal(conversation.qualification.zone, "rides");
});

test("mission rappel : jour donné → on demande l’heure, pas le jour ; aucun créneau posé", async () => {
  const center = CENTERS.rappel;
  let conversation = start(center, "minceur");
  const said = [];
  let lastResult = null;
  for (const text of ["Le ventre", "10 km", "Jamais rien fait", "Jeudi après-midi", "15h"]) {
    lastResult = await reply(center, conversation, text);
    conversation = lastResult.conversation;
    said.push(lastSeya(conversation));
  }
  assert.match(said[2], /expertes vous recontactera/);
  assert.match(said[3], /jeudi 15\/10 après-midi/);
  assert.match(said[3], /À quelle heure/);
  assert.doesNotMatch(said[3], /début de semaine|fin de semaine/);
  assert.match(said[4], /rappellera jeudi 15\/10 à 15h00/);
  assert.equal(lastResult.shouldBook, null);
  assert.equal((conversation.proposedSlots || []).length, 0);
});

test("10 km, 10 kilos ou 15 min ne deviennent jamais un horaire", () => {
  for (const text of ["10 km", "à 10 km du centre", "j’ai 10 kilos à perdre", "15 min en voiture", "10 minutes"]) {
    const state = applyBookingMessage(null, text, { centerId: "c", now: NOW });
    assert.deepEqual(state.preferredTimes, [], text);
  }
  for (const [text, clock] of [["Jeudi 10h", "10:00"], ["plutôt vers 17", "17:00"], ["14h30", "14:30"]]) {
    const state = applyBookingMessage(null, text, { centerId: "c", now: NOW });
    assert.equal(state.preferredTimes[0], clock, text);
  }
});

test("les réglages des centres ne sont jamais modifiés par une réponse", async () => {
  const before = JSON.stringify(CENTERS);
  for (const center of Object.values(CENTERS)) {
    for (const axis of Object.keys(AXES)) {
      await reply(center, start(center, axis), AESTHETIC[axis][0]);
      await reply(center, start(center, axis), "Je suis enceinte, je peux faire le soin ?");
    }
  }
  assert.equal(JSON.stringify(CENTERS), before);
});

test("l’IA ne peut pas ajouter un transfert santé ni une phrase de remplissage", () => {
  const draft = "Pour les rides, c’est justement ce que l’on regarde avec vous pendant notre bilan offert. Vous êtes à quelle distance du centre ?";
  const conversation = { messages: [] };
  assert.equal(
    pickSafeReply(
      draft,
      "Merci pour ces précisions. Il faut que l’équipe vérifie votre situation avant de confirmer le soin.",
      {},
      conversation,
    ),
    draft,
  );
  const polished = pickSafeReply(
    draft,
    "Les rides, c’est justement ce qu’on regarde pendant le bilan offert. Vous habitez à quelle distance du centre ? En attendant, si vous avez des questions sur le prix, l’adresse ou les horaires, n’hésitez pas.",
    {},
    conversation,
  );
  assert.doesNotMatch(polished, /n’hésitez pas|En attendant/);
  assert.match(polished, /distance du centre \?$/);
  assert.doesNotMatch(awaitingHealthReply(), /En attendant|prix|adresse/);
});
