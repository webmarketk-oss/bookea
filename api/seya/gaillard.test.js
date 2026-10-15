const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

let aiReply = "";
const openaiPath = require.resolve("openai");
require.cache[openaiPath] = {
  id: openaiPath,
  filename: openaiPath,
  loaded: true,
  exports: class {
    constructor() {
      this.chat = {
        completions: { create: async () => ({ choices: [{ message: { content: aiReply } }] }) },
      };
    }
  },
};

const { generateSeyaReply } = require("./ai");
const { relanceCopy, startConversation } = require("./agent");
const { centerNotifyCopy } = require("./center-notify");

const NOW = new Date("2026-10-14T10:00:00");
const GAILLARD = "JFG Clinic Gaillard";
const NO_PLANNING =
  /disponibilit|quand seriez|quel jour|quelle heure|créneau|opératrice|distance|habitez|annemasse/i;

const seya = {
  seyaMission: "qualify_callback",
  bookAppointment: false,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      brief: "Réceptionniste.",
      pricing: { bilan: "offert", discovery: "offerte", sessionPolicy: "after_bilan" },
    },
    { name: "Épilation définitive", brief: "Réceptionniste." },
    { name: "Soin visage", brief: "Réceptionniste." },
  ],
};

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

function open(treatment, centerName = GAILLARD, settings = seya) {
  return startConversation(
    { leadId: `lead-${treatment}`, centerId: "gaillard", firstName: "Léa", phone: "0611223344", treatment },
    centerName,
    settings,
  );
}

async function say(conversation, text, centerName = GAILLARD, settings = seya) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya: settings,
    appointments: [],
    hours: hours(),
    centerName,
    centerAddress: "58 rue de la Libération, 74240 Gaillard",
    centerId: "gaillard",
    now: NOW,
  });
  assert.equal(result.shouldBook, null);
  return result.conversation;
}

test("Gaillard minceur : besoin → déjà testé → fiche/bilan → rappel seulement après confirmation", async () => {
  const settings = {
    ...seya,
    treatmentBriefs: [
      {
        name: "Soin minceur",
        brief:
          "Après les régimes, on propose un rééquilibrage alimentaire avec suivi sur application. Des compléments physio-minces peuvent être conseillés, sans être obligatoires. Technologies : cryolipolyse et radiofréquence. Le bilan et la séance découverte sont offerts.",
        pricing: {
          bilan: "offert",
          discovery: "offerte",
          sessionPolicy: "after_bilan",
          package: "à partir de 500 euros",
        },
      },
    ],
  };
  let conversation = open("Soin minceur", GAILLARD, settings);
  conversation = await say(conversation, "Bonjour oui", GAILLARD, settings);
  assert.match(lastSeya(conversation), /objectif.*zones/i);
  conversation = await say(
    conversation,
    "Je voudrais perdre du ventre et des cuisses",
    GAILLARD,
    settings,
  );
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(conversation, "J'ai déjà fait des régimes", GAILLARD, settings);
  assert.match(lastSeya(conversation), /rééquilibrage|application|bilan/i);
  assert.match(lastSeya(conversation), /Souhaitez-vous/i);
  assert.doesNotMatch(lastSeya(conversation), /rappellera/i);
  assert.equal(Boolean(conversation.teamNotes?.handedOffAt), false);

  conversation = await say(conversation, "Oui je veux bien le bilan", GAILLARD, settings);
  assert.match(lastSeya(conversation), /expert ou une experte minceur.*rappellera/i);
  assert.equal(conversation.status, "À recontacter");
  assert.equal(conversation.bookingState.pendingQuestion, "callback");
  for (const item of conversation.messages.filter((entry) => entry.author === "seya").slice(1)) {
    assert.doesNotMatch(item.text, NO_PLANNING);
  }

  conversation = await say(conversation, "Merci", GAILLARD, settings);
  assert.equal(conversation.status, "À recontacter");
  assert.doesNotMatch(lastSeya(conversation), /C’est bien noté, je le transmets à l’équipe/);
  assert.doesNotMatch(lastSeya(conversation), NO_PLANNING);
});

test("Gaillard épilation : zones, déjà testé, rappel d’un expert en épilation", async () => {
  let conversation = open("Épilation définitive");
  conversation = await say(conversation, "Oui je suis intéressée");
  assert.match(lastSeya(conversation), /quelles zones/i);
  conversation = await say(conversation, "Les jambes et le maillot");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(conversation, "non jamais");
  assert.match(lastSeya(conversation), /expert ou une experte en épilation du centre vous rappellera/);
});

test("Gaillard visage : préoccupations et attentes, un simple bonjour ne compte pas comme réponse", async () => {
  let conversation = open("Soin visage");
  conversation = await say(conversation, "Bonjour");
  assert.match(lastSeya(conversation), /préoccupe.*attendez/i);
  conversation = await say(conversation, "J'ai des rides et la peau terne");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(conversation, "oui des soins en institut");
  assert.match(lastSeya(conversation), /expert ou une experte en soins visage du centre vous rappellera/);
});

test("Gaillard : informations déjà données, pas de question répétée, proposition de bilan", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(
    conversation,
    "Je veux perdre du ventre, j'ai déjà fait des régimes sans résultat",
  );
  assert.match(lastSeya(conversation), /bilan|Souhaitez-vous/i);
  assert.doesNotMatch(lastSeya(conversation), /rappellera/i);
  assert.equal(
    conversation.messages.filter((item) =>
      /quel est votre objectif|déjà testé une solution/i.test(item.text),
    ).length,
    0,
  );
});

test("Gaillard minceur : zones seules → objectif, puis déjà testé (pas de clôture anticipée)", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(conversation, "Le ventre et les hanches.");
  assert.match(lastSeya(conversation), /objectif/i);
  assert.doesNotMatch(lastSeya(conversation), /rappellera/i);
  assert.equal(Boolean(conversation.teamNotes?.handedOffAt), false);
  conversation = await say(conversation, "Affiner ma silhouette");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(
    conversation,
    "Quel appareil utilisez-vous pour la minceur ?",
  );
  assert.match(lastSeya(conversation), /fiche|machines|équipe|cryo|radio|technologie/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /C’est bien noté, je le transmets à l’équipe/,
  );
});

test("Gaillard minceur : perte de poids, zones puis kilos", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(conversation, "Je voudrais perdre du poids");
  assert.match(lastSeya(conversation), /zones/i);
  conversation = await say(conversation, "Le ventre");
  assert.match(lastSeya(conversation), /Combien de kilos aimeriez-vous perdre \?/);
  conversation = await say(conversation, "Une dizaine");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(conversation, "non jamais");
  assert.match(lastSeya(conversation), /bilan|Souhaitez-vous/i);
  conversation = await say(conversation, "Oui");
  assert.equal(conversation.status, "À recontacter");
  assert.match(conversation.teamNotes.need, /kilos : Une dizaine/);
  assert.equal(conversation.messages.filter((item) => /combien de kilos/i.test(item.text)).length, 1);
});

test("Gaillard minceur : kilos déjà précisés, zones encore demandées", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(conversation, "J'aimerais perdre 8 kilos");
  assert.match(lastSeya(conversation), /zones/i);
  assert.equal(conversation.messages.filter((item) => /combien de kilos/i.test(item.text)).length, 0);
  conversation = await say(conversation, "Ventre et hanches");
  assert.match(lastSeya(conversation), /déjà testé/i);
});

test("Gaillard : polish IA ne remplace pas une question ouverte par un rappel expert", async () => {
  process.env.OPENAI_API_KEY = "test";
  try {
    aiReply =
      "Merci pour ces précisions 😊 Un expert ou une experte minceur du centre vous rappellera pour échanger sur votre besoin et convenir de votre rendez-vous.";
    let conversation = open("Soin minceur");
    conversation = await say(conversation, "Le ventre et les hanches.");
    assert.match(lastSeya(conversation), /objectif/i);
    assert.doesNotMatch(lastSeya(conversation), /rappellera/i);
    assert.equal(Boolean(conversation.teamNotes?.handedOffAt), false);
  } finally {
    delete process.env.OPENAI_API_KEY;
    aiReply = "";
  }
});

test("Gaillard : reformulation IA rejetée, la réponse de remplacement ne repose pas une question déjà répondue", async () => {
  process.env.OPENAI_API_KEY = "test";
  try {
    let conversation = open("Soin visage");
    aiReply = "Quel est votre objectif ? Quand seriez-vous disponible ?";
    conversation = await say(conversation, "J'ai des taches et la peau terne");
    assert.match(lastSeya(conversation), /déjà testé/i);
    assert.doesNotMatch(lastSeya(conversation), /objectif|disponible/i);

    aiReply = "D’accord. Quelles zones souhaitez-vous traiter ?";
    conversation = await say(conversation, "Le soleil, c'est grave ?");
    assert.doesNotMatch(lastSeya(conversation), /quelles zones|préoccupe/i);
  } finally {
    delete process.env.OPENAI_API_KEY;
    aiReply = "";
  }
});

test("Gaillard : disponibilité spontanée gardée pour l’équipe, sans promesse de rappel à cette heure", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(conversation, "Je suis dispo mardi après-midi pour venir");
  assert.match(lastSeya(conversation), /je note votre préférence pour l’équipe/i);
  assert.match(lastSeya(conversation), /objectif/i);
  assert.doesNotMatch(lastSeya(conversation), /mardi|rappellera (mardi|à)/i);
  conversation = await say(conversation, "Affiner les cuisses");
  conversation = await say(conversation, "rappelez moi demain à 18h");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(conversation, "non");
  assert.match(lastSeya(conversation), /bilan|Souhaitez-vous/i);
  conversation = await say(conversation, "Oui");
  assert.equal(conversation.status, "À recontacter");

  const prefs = conversation.teamNotes.preferences;
  assert.equal(prefs[0].context, "pour venir au centre");
  assert.equal(prefs[1].context, "pour être rappelé(e)");
  const mail = centerNotifyCopy({ kind: "callback", centerName: GAILLARD, conversation }).text;
  assert.match(mail, /Un expert ou une experte doit le rappeler/);
  assert.match(mail, /« Je suis dispo mardi après-midi pour venir » \(pour venir au centre\)/);
  assert.match(mail, /Aucun rappel ni rendez-vous n’a été promis/);
  assert.doesNotMatch(mail, /opératrice/i);

  conversation = await say(conversation, "Samedi matin c'est mieux");
  assert.equal(
    lastSeya(conversation),
    "Merci, je transmets votre préférence à l’équipe 😊 Un expert ou une experte du centre vous rappellera pour organiser votre rendez-vous.",
  );
});

test("Gaillard : pantalon et modalités non renseignées, réponse prudente", async () => {
  let conversation = open("Épilation définitive");
  conversation = await say(conversation, "Est-ce que je peux garder mon pantalon ?");
  assert.equal(
    lastSeya(conversation),
    "Les modalités du soin vous seront expliquées au centre. Un expert ou une experte pourra également répondre à cette question lors de votre échange.",
  );
});

test("Gaillard : modalité validée dans la fiche du soin, elle est reprise telle quelle", async () => {
  const withTenue = {
    ...seya,
    treatmentBriefs: seya.treatmentBriefs.map((item) =>
      /minceur/i.test(item.name)
        ? { ...item, brief: "Réceptionniste. Un short jetable est fourni pour la séance." }
        : item,
    ),
  };
  let conversation = open("Soin minceur", GAILLARD, withTenue);
  conversation = await say(conversation, "Je dois venir en jupe ou en pantalon ?", GAILLARD, withTenue);
  assert.equal(lastSeya(conversation), "Un short jetable est fourni pour la séance.");
});

test("Gaillard : bilan et découverte minceur, environ 1 h 30 au total, découverte ~20 min", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(conversation, "Ça dure combien de temps le bilan ?");
  assert.match(lastSeya(conversation), /environ 1 h 30/);
  assert.match(lastSeya(conversation), /20 minutes/);
  conversation = await say(conversation, "La séance découverte dure combien de temps ?");
  assert.match(lastSeya(conversation), /20 minutes/);
  assert.doesNotMatch(lastSeya(conversation), /1 h 30/);
});

test("Gaillard épilation : prix demandé sans tarif en fiche, rien d’inventé, promotions à voir au centre", async () => {
  let conversation = open("Épilation définitive");
  conversation = await say(conversation, "C'est combien pour les jambes ?");
  assert.doesNotMatch(lastSeya(conversation), /\d+\s*€/);
  assert.match(lastSeya(conversation), /promotions sont régulièrement proposées.*à voir au centre/);
});

test("Gaillard épilation : tarif de la fiche + mention des promotions", async () => {
  const priced = {
    ...seya,
    treatmentBriefs: seya.treatmentBriefs.map((item) =>
      /pilation/i.test(item.name)
        ? { ...item, pricing: { session: "63 €", sessionPolicy: "from" } }
        : item,
    ),
  };
  let conversation = open("Épilation définitive", GAILLARD, priced);
  conversation = await say(conversation, "Quel est le prix d'une séance ?", GAILLARD, priced);
  assert.match(lastSeya(conversation), /63 €/);
  assert.match(lastSeya(conversation), /promotions sont régulièrement proposées/);
});

test("Gaillard : question IA, réponse transparente", async () => {
  let conversation = open("Soin visage");
  conversation = await say(conversation, "Vous êtes une IA ?");
  assert.equal(
    lastSeya(conversation),
    "Je suis Seya, l’assistante virtuelle du centre JFG Clinic Gaillard 😊 Je recueille les informations sur votre demande, puis un expert ou une experte du centre vous rappelle pour vous accompagner.",
  );
});

test("Gaillard : adresse du centre uniquement, pas de distance ni d’autre centre", async () => {
  let conversation = open("Soin minceur");
  conversation = await say(conversation, "Où se trouve le centre ?");
  assert.equal(lastSeya(conversation), "Nous sommes au 58 rue de la Libération, 74240 Gaillard.");
  conversation = await say(conversation, "J'habite à Annemasse");
  assert.doesNotMatch(lastSeya(conversation), NO_PLANNING);
  assert.doesNotMatch(lastSeya(conversation), /centre à|autre centre/i);
});

test("Gaillard : relances sans demande de disponibilités ni opératrice", () => {
  const conversation = open("Soin minceur");
  for (const round of [1, 2, 3]) {
    const text = relanceCopy(conversation, round, GAILLARD, seya);
    assert.match(text, /expert ou une experte du centre/);
    assert.doesNotMatch(text, NO_PLANNING);
  }
  const custom = {
    ...seya,
    relances: [
      { afterDays: 1, message: "Bonjour {prenom}, quand seriez-vous disponible pour qu’une opératrice vous rappelle ?" },
    ],
  };
  assert.doesNotMatch(relanceCopy(conversation, 1, GAILLARD, custom), NO_PLANNING);
});

test("Clermont n’est pas concerné : la mission rappel garde son fonctionnement", async () => {
  const clermont = "JFG Clinique Clermont";
  let conversation = open("Soin minceur", clermont);
  conversation = await say(conversation, "Je veux un rendez-vous", clermont);
  conversation = await say(conversation, "Jeudi à 15h", clermont);
  assert.match(lastSeya(conversation), /opératrice vous rappellera/i);
  assert.equal(
    relanceCopy(conversation, 1, clermont, seya),
    "Bonjour Léa, je reviens vers vous. Quand seriez-vous disponible pour qu’une opératrice vous rappelle ?",
  );
});

test("Gaillard : après rappel, les questions pratiques restent traitées sans réponse générique", async () => {
  const priced = {
    ...seya,
    treatmentBriefs: [
      {
        name: "Soin minceur",
        brief:
          "Analyse corporelle puis séance découverte. Technologies minceur : cryolipolyse et radiofréquence.",
        pricing: {
          bilan: "offert",
          discovery: "offerte",
          sessionPolicy: "after_bilan",
          package: "à partir de 500 euros. Paiement jusqu'à 10x possible",
        },
      },
      {
        name: "Épilation définitive",
        brief: "Épilation laser. Consignes au bilan pilaire.",
        pricing: { session: "63 €", sessionPolicy: "from" },
      },
      { name: "Soin visage", brief: "Diagnostic peau." },
    ],
    centerProfile: {
      activity: "Technologies minceur et épilation laser",
      extras: "Un enfant peut attendre en salle d’attente accompagné d’un adulte.",
    },
  };
  let conversation = open("Soin minceur", GAILLARD, priced);
  conversation = await say(conversation, "Bonsoir le ventre et les poignées d amour", GAILLARD, priced);
  assert.match(lastSeya(conversation), /objectif/i);
  conversation = await say(conversation, "Affiner ma silhouette", GAILLARD, priced);
  assert.match(lastSeya(conversation), /déjà (testé|essayé)/i);
  conversation = await say(conversation, "Oui mais pas de résultats", GAILLARD, priced);
  assert.match(lastSeya(conversation), /bilan|Souhaitez-vous|cryolipolyse|radiofréquence/i);
  assert.doesNotMatch(lastSeya(conversation), /rappellera/i);
  conversation = await say(conversation, "Oui pour le bilan", GAILLARD, priced);
  assert.match(lastSeya(conversation), /expert ou une experte minceur.*rappellera/i);
  assert.equal(conversation.status, "À recontacter");
  assert.ok(conversation.teamNotes?.handedOffAt);

  const turns = [
    ["Je peux pas prendre rdv tout de suite ?", /réservation se fait avec l’équipe|convenir de votre rendez-vous/i],
    ["J ai vu que vous faisiez l épilation c est de la lumière pulsée ?", /laser|lumière pulsée|fiche/i],
    ["J ai eu un cancer il y a 2 ans je peux faire vos machines ?", /validation médicale/i],
    ["Et les soins visage vous faites ?", /proposons/i],
    ["Tu es pas un humain ?", /assistante virtuelle/i],
    ["Le prix c est quoi ?", /tarif|fiche|offert|gratuit|diagnostic|équipe/i],
    ["Combien de temps dure le bilan minceur ?", /1 h 30|20 minutes/i],
    ["Comment se déroule un bilan ?", /analyse corporelle|séance découverte/i],
    ["Vous êtes situés où ?", /58 rue de la Libération/i],
    ["En France ou en suisse ?", /France.*Gaillard|frontière suisse/i],
    ["Je peux venir avec mon enfant lors du rdv ?", /enfant|salle d’attente/i],
    ["Est ce que ça fait mal ?", /indolore/i],
    ["Ça coûte cher?", /offert|gratuit/i],
    ["Et après c est quoi vos prix ?", /500 euros|10x/i],
    ["Vous utilisez quoi comme technologie ?", /cryolipolyse|radiofréquence|Technologies minceur/i],
    ["Quel appareil utilisez-vous pour la minceur ?", /cryolipolyse|radiofréquence|Technologies minceur/i],
    ["Je veux faire épiler les jambes entières ça coute combien ?", /63 €|épilation|bilan pilaire/i],
    ["Oui mais pour l épilation laser ?", /63 €/i],
  ];

  for (const [message, expected] of turns) {
    conversation = await say(conversation, message, GAILLARD, priced);
    assert.match(
      lastSeya(conversation),
      expected,
      `« ${message} » → ${lastSeya(conversation)}`,
    );
    assert.doesNotMatch(
      lastSeya(conversation),
      /^Un expert ou une experte du centre pourra vous répondre en détail|C’est bien noté, je le transmets à l’équipe/,
      `réponse générique bloquée pour « ${message} »`,
    );
  }
});

test("Centre en mode prise de rendez-vous : une demande de créneau reste active", async () => {
  const booker = {
    seyaMission: "book",
    bookAppointment: true,
    askForAppointment: true,
    handoffToHuman: true,
    treatmentBriefs: [
      {
        name: "Soin minceur",
        brief: "Réceptionniste.",
        pricing: { bilan: "offert", discovery: "offerte", sessionPolicy: "after_bilan" },
      },
    ],
  };
  const center = "JFG Clinic Test Book";
  let conversation = startConversation(
    {
      leadId: "lead-book-mode",
      centerId: "test-book",
      firstName: "Léa",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    center,
    booker,
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Je veux un rendez-vous jeudi après-midi",
    seya: booker,
    appointments: [],
    hours: hours(),
    centerName: center,
    centerAddress: "1 rue Test, 75001 Paris",
    centerId: "test-book",
    now: NOW,
  });
  assert.match(lastSeya(result.conversation), /jeudi|créneau|disponible|propose/i);
  assert.notEqual(result.conversation.status, "À recontacter");
});
