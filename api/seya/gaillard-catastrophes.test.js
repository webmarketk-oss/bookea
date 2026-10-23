/**
 * Conversations Gaillard (Sandrine / Amel / Mouna / Rrushe) — parcours complets avec état.
 * Affiche réponse, champs modifiés, nb messages Seya à chaque tour.
 */
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
const { startConversation } = require("./agent");

const NOW = new Date("2026-10-14T10:00:00");
const GAILLARD = "JFG Clinic Gaillard";
const CLOSING = /rappellera pour échanger|rappellera pour organiser|Je transmets votre demande/i;
const KEEP_OPEN = /Avec plaisir 😊 Je reste disponible/i;

const seya = {
  seyaMission: "qualify_callback",
  bookAppointment: false,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      brief:
        "Après les régimes, on propose un rééquilibrage alimentaire avec suivi sur application. Technologies : cryolipolyse et radiofréquence. Le bilan et la séance découverte sont offerts.",
      pricing: {
        bilan: "offert",
        discovery: "offerte",
        sessionPolicy: "after_bilan",
        package: "à partir de 500 euros, paiement jusqu'à 10x",
      },
    },
    {
      name: "Épilation définitive",
      brief: "Réceptionniste. Laser inefficace sur poils blancs, blonds, roux ou gris.",
    },
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

function seyaMessages(conversation) {
  return (conversation.messages || []).filter((item) => item.author === "seya");
}

function open(treatment, firstName = "Léa") {
  return startConversation(
    {
      leadId: `lead-${treatment}-${firstName}-${Date.now()}`,
      centerId: "gaillard",
      firstName,
      phone: "0611223344",
      treatment,
    },
    GAILLARD,
    seya,
  );
}

async function say(conversation, text, label = "") {
  const before = seyaMessages(conversation).length;
  const beforeQual = JSON.stringify(conversation.qualification || {});
  const beforeNotes = JSON.stringify(conversation.teamNotes || {});
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: [],
    hours: hours(),
    centerName: GAILLARD,
    centerAddress: "58 rue de la Libération, 74240 Gaillard",
    centerId: "gaillard",
    now: NOW,
  });
  assert.equal(result.shouldBook, null);
  const next = result.conversation;
  const after = seyaMessages(next).length;
  const sent = after - before;
  if (process.env.SEYA_TRACE === "1") {
    const qualChanged = JSON.stringify(next.qualification || {}) !== beforeQual;
    const notesChanged = JSON.stringify(next.teamNotes || {}) !== beforeNotes;
    console.error(
      `\n[${label || text.slice(0, 40)}]\n` +
        `  lead: ${text}\n` +
        `  seya (${sent} msg): ${lastSeya(next)}\n` +
        `  qual: ${JSON.stringify(next.qualification || {})}${qualChanged ? " *" : ""}\n` +
        `  notes.handedOff: ${Boolean(next.teamNotes?.handedOffAt)}${notesChanged ? " *" : ""}\n` +
        `  need: ${next.teamNotes?.need || ""}`,
    );
  }
  assert.equal(sent, 1, `exactement 1 message Seya par tour (reçu ${sent}) pour « ${text} »`);
  return next;
}

// ——— Sandrine ———
test("Sandrine : parcours après transmission (fermeté, autre clinique, hésitation)", async () => {
  let conversation = open("Soin visage", "Sandrine");
  conversation = await say(conversation, "j'aimerais améliorer mon ovale", "ovale");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await say(conversation, "Non pas vraiment", "tried");
  assert.match(lastSeya(conversation), CLOSING);
  assert.ok(conversation.teamNotes?.handedOffAt);

  conversation = await say(conversation, "Qu'il soit plus ferme", "ferme");
  assert.doesNotMatch(lastSeya(conversation), CLOSING);
  assert.doesNotMatch(lastSeya(conversation), KEEP_OPEN);
  assert.match(lastSeya(conversation), /raffermir.*ovale|ovale.*visage|fermeté/i);

  conversation = await say(
    conversation,
    "Là j'ai rendez-vous dans une clinique qui fait des soins esthétiques pour voir ce que je peux faire",
    "autre clinique",
  );
  assert.doesNotMatch(lastSeya(conversation), /jour|heure|créneau|préférence/i);
  assert.match(lastSeya(conversation), /comparer/i);

  conversation = await say(conversation, "Mais je n'arrive pas trop à me décider", "hésitation");
  assert.doesNotMatch(lastSeya(conversation), KEEP_OPEN);
  assert.doesNotMatch(lastSeya(conversation), /sans engagement/i);
  assert.match(lastSeya(conversation), /hésiter|choix du soin|résultats|budget/i);
});

// ——— Amel ———
test("Amel : ventre gonflé ≠ kilos ; LPG/cryo ; je ne sais pas ; prix cryo", async () => {
  let conversation = open("Soin minceur", "Amel");
  conversation = await say(
    conversation,
    "Je voudrais perdre du ventre, il est tout le temps gonflé dès que je mange",
    "gonflé",
  );
  assert.doesNotMatch(lastSeya(conversation), /Combien de kilos/i);
  assert.match(lastSeya(conversation), /gonflé|gonflement/i);

  conversation = await say(
    conversation,
    "Je regarde la différence entre lgp et la cryothérapie",
    "lpg/cryo",
  );
  assert.match(lastSeya(conversation), /LPG|cryolipolyse|comparer/i);
  assert.doesNotMatch(lastSeya(conversation), /Combien de kilos|déjà testé/i);

  conversation = await say(conversation, "Perdre du poids et affiner mon ventre", "poids");
  assert.match(lastSeya(conversation), /kilos|objectif de poids|déjà testé|essayé/i);

  if (/Combien de kilos|objectif de poids/i.test(lastSeya(conversation))) {
    conversation = await say(conversation, "Je ne sais pas du tout", "kilos inconnu");
    assert.doesNotMatch(lastSeya(conversation), /Combien de kilos/i);
    assert.equal(conversation.qualification?.kilos, "non chiffré");
  }

  conversation = await say(
    conversation,
    "J'hésite encore quels sont les prix d'une cryothérapie",
    "prix cryo",
  );
  assert.doesNotMatch(lastSeya(conversation), /500|cures commencent|à partir de 500/i);
  assert.match(lastSeya(conversation), /cryolipolyse|pas le tarif|bilan.*offert|protocole/i);
});

test("Amel : « ça peut faire du bien » = intérêt, pas acceptation du rappel", async () => {
  let conversation = open("Soin minceur", "AmelInterest");
  conversation = await say(conversation, "perdre du poids ventre", "zones");
  conversation = await say(conversation, "Je ne sais pas du tout", "kilos");
  conversation = await say(conversation, "non jamais, j'allais juste à la salle", "tried");
  assert.match(lastSeya(conversation), /Souhaitez-vous|bilan/i);
  assert.equal(Boolean(conversation.teamNotes?.handedOffAt), false);

  conversation = await say(
    conversation,
    "Pour sa je me suis dit peux être que sa peux faire du bien autre chose",
    "intérêt",
  );
  assert.doesNotMatch(lastSeya(conversation), KEEP_OPEN);
  assert.doesNotMatch(lastSeya(conversation), CLOSING);
  assert.match(lastSeya(conversation), /Souhaitez-vous|bilan minceur offert/i);
});

// ——— Mouna ———
test("Mouna : « Perdre » reformulé ; drainage noté ; acceptation → une transmission", async () => {
  let conversation = open("Soin minceur", "Mouna");
  conversation = await say(conversation, "bas du ventre et cuisses", "zones");
  conversation = await say(conversation, "Perdre du gras je pense", "objectif");
  assert.match(lastSeya(conversation), /déjà testé|essayé/i);

  conversation = await say(conversation, "Perdre", "objectif décalé");
  assert.match(lastSeya(conversation), /réduire la graisse|déjà essayé des soins/i);
  assert.doesNotMatch(lastSeya(conversation), /rééquilibrage alimentaire.*Souhaitez-vous/i);

  conversation = await say(conversation, "non jamais", "tried");
  assert.match(lastSeya(conversation), /Souhaitez-vous|bilan/i);

  conversation = await say(
    conversation,
    "Rééquilibrage oui drainage lymphatique aussi 10 séance c'est tout",
    "drainage",
  );
  assert.doesNotMatch(lastSeya(conversation), KEEP_OPEN);
  assert.doesNotMatch(lastSeya(conversation), CLOSING);
  assert.match(lastSeya(conversation), /drainage|rééquilibrage/i);
  assert.match(lastSeya(conversation), /Souhaitez-vous|bilan/i);
  assert.equal(Boolean(conversation.teamNotes?.handedOffAt), false);

  conversation = await say(
    conversation,
    "Ok je vais faire la séance gratuit ensuite je verais ce que vous proposer",
    "acceptation",
  );
  assert.match(lastSeya(conversation), CLOSING);
  assert.doesNotMatch(lastSeya(conversation), /500|tarif fixe|cures commencent/i);
  assert.ok(conversation.teamNotes?.handedOffAt);
  assert.equal(
    seyaMessages(conversation).filter((item) => CLOSING.test(item.text)).length,
    1,
    "une seule annonce de rappel",
  );
});

// ——— Rrushe ———
test("Rrushe : zone intime ; cheveux blancs clarifiés ; français difficile", async () => {
  let conversation = open("Épilation définitive", "Rrushe");
  conversation = await say(conversation, "Zone intime", "zone");
  assert.doesNotMatch(lastSeya(conversation), /Quelles zones souhaitez-vous traiter/);
  assert.match(lastSeya(conversation), /déjà testé/i);

  conversation = await say(
    conversation,
    "Non, je n'ai jamais essayé, mais maintenant j'aimerais bien. Le problème, c'est que j'ai des cheveux blancs. Est-ce que le laser est efficace ou pas ?",
    "cheveux blancs",
  );
  assert.doesNotMatch(lastSeya(conversation), /bloquer un créneau|organiser le rendez-vous/i);
  assert.match(lastSeya(conversation), /poils blancs|zone/i);

  conversation = await say(conversation, "Je ne comprends pas beaucoup le français.", "langue");
  assert.doesNotMatch(lastSeya(conversation), KEEP_OPEN);
  assert.doesNotMatch(lastSeya(conversation), /No problem|I can keep/i);
  assert.match(lastSeya(conversation), /Quelle langue|langue préférez/i);
});

// ——— Règles transverses ———
test("Gaillard : « maintenant » seul ne déclenche pas une réservation", async () => {
  const gaillard = require("./gaillard");
  assert.equal(
    gaillard.asksBookingNow(
      "Non, je n'ai jamais essayé, mais maintenant j'aimerais bien. Est-ce que le laser est efficace ?",
    ),
    false,
  );
});

test("Gaillard : ballonnement seul ne pose pas la question kilos", async () => {
  let conversation = open("Soin minceur", "Bloat");
  conversation = await say(conversation, "Mon ventre est toujours gonflé", "bloat only");
  assert.doesNotMatch(lastSeya(conversation), /Combien de kilos/i);
});

const LIVE_MINCEUR_BRIEF = {
  ...seya,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      brief:
        "Le parcours comprend un accompagnement au rééquilibrage alimentaire avec un suivi sur une application.\nPour un objectif de perte de poids, explique que l’approche est globale : les technologies s’inscrivent dans un accompagnement comprenant aussi l’alimentation.\nNe prescris pas de régime, de restriction alimentaire ou d’objectif calorique personnalisé.",
      pricing: { bilan: "offert", discovery: "offerte", sessionPolicy: "after_bilan" },
    },
  ],
};

async function sayLive(conversation, text) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya: LIVE_MINCEUR_BRIEF,
    appointments: [],
    hours: hours(),
    centerName: GAILLARD,
    centerAddress: "58 rue de la Libération, 74240 Gaillard",
    centerId: "gaillard",
    now: NOW,
  });
  assert.equal(result.shouldBook, null);
  return result.conversation;
}

test("Gaillard capture : après graisse du ventre, une question, sans consigne ni bilan", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-gaillard-capture",
      centerId: "gaillard",
      firstName: "Léa",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    GAILLARD,
    LIVE_MINCEUR_BRIEF,
  );
  conversation = await sayLive(conversation, "Bonjour");
  conversation = {
    ...conversation,
    messages: [
      ...conversation.messages,
      {
        id: "seya-objectif",
        author: "seya",
        text: "Quel est votre objectif pour ce soin minceur ?",
        at: NOW.toISOString(),
      },
    ],
  };
  conversation = await sayLive(conversation, "Une diminution de la graisse du ventre");
  assert.match(lastSeya(conversation), /déjà (testé|essayé)/i);
  assert.doesNotMatch(lastSeya(conversation), /prescris|explique que|restriction alimentaire|objectif calorique/i);
  assert.doesNotMatch(lastSeya(conversation), /Souhaitez-vous que je fasse remonter|bilan minceur offert/i);
  assert.doesNotMatch(lastSeya(conversation), /Quelest|votreobjectif|Leparcours|comprendun/i);
});

test("Gaillard Rose : pas de lecture, séance offerte, essai transmis", async () => {
  const settings = {
    ...LIVE_MINCEUR_BRIEF,
    offerMaps: [
      {
        match: "minceur",
        label: "Bilan minceur complet + séance découverte d’environ 20 minutes offerts",
      },
    ],
  };
  async function sayRose(conversation, text) {
    const result = await generateSeyaReply({
      conversation,
      text,
      seya: settings,
      appointments: [],
      hours: hours(),
      centerName: GAILLARD,
      centerAddress: "58 rue de la Libération, 74240 Gaillard",
      centerId: "gaillard",
      now: NOW,
    });
    assert.equal(result.shouldBook, null);
    return result.conversation;
  }
  let conversation = startConversation(
    {
      leadId: "lead-rose",
      centerId: "gaillard",
      firstName: "Rose",
      phone: "0611223344",
      treatment: "Soin minceur",
      campaign: "minceur",
    },
    GAILLARD,
    settings,
  );
  conversation = await sayRose(conversation, "Mon ventre");
  conversation = await sayRose(conversation, "Retrouver une belle silhouette");
  conversation = await sayRose(conversation, "Non");
  assert.match(lastSeya(conversation), /Souhaitez-vous que je fasse remonter|bilan minceur offert/i);
  assert.doesNotMatch(lastSeya(conversation), /approche globale|technologies avancées|compléments alimentaires|prescris|explique que/i);

  conversation = await sayRose(
    conversation,
    "Je ne mange pas beaucoup je fait attention\nLe but c’est de perdre du poids repidement\nSurtout avoir un ventre plat",
  );
  assert.doesNotMatch(lastSeya(conversation), /Combien de kilos/i);
  assert.match(lastSeya(conversation), /Souhaitez-vous que je fasse remonter|bilan minceur offert/i);

  conversation = await sayRose(conversation, "Je ne cet pas\nJe verrais sa avec vous");
  assert.doesNotMatch(lastSeya(conversation), /Je reste disponible|Je n’ai pas cette information/i);
  assert.match(lastSeya(conversation), /Souhaitez-vous que je fasse remonter|bilan minceur offert|rappellera/i);

  conversation = await sayRose(conversation, "La 1iere séance est gratuite ?");
  assert.match(lastSeya(conversation), /Oui, le bilan et la séance découverte d’environ 20 minutes sont offerts/i);
  assert.doesNotMatch(lastSeya(conversation), /Je n’ai pas cette information/i);

  conversation = await sayRose(conversation, "Je pourrais faire un essaie qd");
  assert.match(lastSeya(conversation), /offert|rappelle|remonter/i);
  assert.doesNotMatch(lastSeya(conversation), /Je reste disponible|Je n’ai pas cette information/i);

  conversation = await sayRose(conversation, "Oui je veux bien");
  assert.equal(conversation.status, "À recontacter");
  assert.match(lastSeya(conversation), /rappellera/i);
});

test("Gaillard : mention alimentaire dans un message précédent ne saute pas « déjà testé »", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-gaillard-aliment",
      centerId: "gaillard",
      firstName: "Léa",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    GAILLARD,
    LIVE_MINCEUR_BRIEF,
  );
  conversation = await sayLive(
    conversation,
    "Bonjour, je suis intéressée par votre accompagnement minceur avec rééquilibrage alimentaire",
  );
  conversation = await sayLive(conversation, "Une diminution de la graisse du ventre");
  assert.match(lastSeya(conversation), /déjà (testé|essayé)|zones|kilos|objectif/i);
  assert.doesNotMatch(lastSeya(conversation), /prescris|explique que/i);
  assert.doesNotMatch(lastSeya(conversation), /Souhaitez-vous que je fasse remonter/i);
});

const GAILLARD_LASER_GRID =
  "Tous les prix correspondent au programme de 8 séances : 6 séances + 2 séances d’entretien. FEMME : Aisselles : 296 € ; demi-jambes : 790 € ; trois quarts des jambes : 1 190 € ; jambes entières : 1 490 €. OFFRE : Les aisselles sont offertes pour toute zone du corps achetée. Le bilan pilaire et le test laser sont gratuits et sans engagement.";

test("Gaillard Erblina : prix + séances + à vie, sans « je n’ai pas cette information »", async () => {
  const settings = {
    ...seya,
    treatmentBriefs: [
      {
        name: "Épilation définitive",
        brief: "Épilation laser définitive. Bilan pilaire et test laser offerts.",
        pricing: {
          bilan: "Offert et sans engagement",
          discovery: "Test laser offert et sans engagement",
          sessionPolicy: "after_bilan",
          package: GAILLARD_LASER_GRID,
        },
      },
    ],
  };
  async function sayLaser(conversation, text) {
    const result = await generateSeyaReply({
      conversation,
      text,
      seya: settings,
      appointments: [],
      hours: hours(),
      centerName: GAILLARD,
      centerAddress: "58 rue de la Libération, 74240 Gaillard",
      centerId: "gaillard",
      now: NOW,
    });
    assert.equal(result.shouldBook, null);
    return result.conversation;
  }
  let conversation = startConversation(
    {
      leadId: "lead-erblina",
      centerId: "gaillard",
      firstName: "Erblina",
      phone: "0611223344",
      treatment: "Épilation définitive",
      campaign: "laser",
    },
    GAILLARD,
    settings,
  );
  conversation = await sayLaser(conversation, "Bonsoir,\nSeulement les jambes complète");
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await sayLaser(
    conversation,
    "Quel sont les prix svp\nEt combien de seances faut til ?\nCest a vie ou bien ?",
  );
  assert.match(lastSeya(conversation), /1 490 €/);
  assert.match(lastSeya(conversation), /8 séances/);
  assert.match(lastSeya(conversation), /définitive/i);
  assert.doesNotMatch(lastSeya(conversation), /Je n’ai pas cette information/i);
  assert.match(lastSeya(conversation), /déjà testé/i);
  conversation = await sayLaser(conversation, "Non");
  assert.equal(conversation.status, "À recontacter");
  assert.match(lastSeya(conversation), /rappellera/i);
});
