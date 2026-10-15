const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { shouldSkipRelance } = require("./relance");
const { centerNotifyCopy } = require("./center-notify");
const { resolveGeneralBrief, COMMON_SEYA_GENERAL_BRIEF } = require("./general-brief");

const NOW = new Date("2026-10-15T10:00:00");
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

const briefs = (label) => [
  {
    name: "Soin minceur",
    brief: `Bilan minceur offert avec analyse corporelle.\nAppareils minceur ${label} : cryolipolyse et radiofréquence.`,
    pricing: { bilan: "offert", discovery: "offerte", sessionPolicy: "after_bilan" },
  },
  {
    name: "Épilation laser",
    brief: `Épilation au laser diode ${label}.\nUn bilan pilaire est offert avant la première séance.`,
    pricing: { bilan: "offert" },
  },
  {
    name: "Soin visage",
    brief: `Diagnostic de peau offert.\nAppareil visage ${label} : HydraFacial.`,
    pricing: { bilan: "offert" },
  },
];

const BOOK = [
  {
    name: "JFG Clinique Clermont",
    address: "12 rue de la République, 63000 Clermont-Ferrand",
    seya: { seyaMission: "book", bookAppointment: true, handoffToHuman: true, treatmentBriefs: briefs("Clermont") },
  },
  {
    name: "Centre Annecy Rdv",
    address: "4 rue Royale, 74000 Annecy",
    seya: { seyaMission: "book", bookAppointment: true, handoffToHuman: false, treatmentBriefs: briefs("Annecy") },
  },
];

const CALLBACK = [
  {
    name: "Centre Lyon Rappel",
    address: "1 place Bellecour, 69002 Lyon",
    seya: { seyaMission: "qualify_callback", bookAppointment: false, handoffToHuman: true, treatmentBriefs: briefs("Lyon") },
  },
  {
    name: "Centre Nice Rappel",
    address: "8 avenue Jean Médecin, 06000 Nice",
    seya: { seyaMission: "qualify_callback", bookAppointment: false, handoffToHuman: true, treatmentBriefs: briefs("Nice") },
  },
];

const FAMILIES = [
  { family: "minceur", treatment: "Soin minceur", need: "Je voudrais perdre du ventre", visit: "bilan", expert: /expert ou une experte minceur/ },
  { family: "laser", treatment: "Épilation laser", need: "Les aisselles et le maillot", visit: "bilan", expert: /expert ou une experte en épilation/ },
  { family: "visage", treatment: "Soin visage", need: "J'ai des taches sur le visage", visit: "diagnostic", expert: /expert ou une experte en soins visage/ },
];

const QUESTIONNAIRE = /distance|habitez|déjà essayé|technologies avez-vous|combien de kilos|alimentation|antécédent/i;

function lastSeya(conversation) {
  return [...(conversation.messages || [])].reverse().find((m) => m.author === "seya")?.text || "";
}

function open(center, treatment) {
  return startConversation(
    { leadId: `lead-${center.name}-${treatment}`, centerId: center.name, firstName: "Léa", phone: "0611223344", treatment },
    center.name,
    center.seya,
  );
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
    centerId: center.name,
    now: NOW,
  });
  return { ...result, conversation: result.conversation, said: lastSeya(result.conversation) };
}

for (const center of BOOK) {
  for (const item of FAMILIES) {
    test(`${center.name} — ${item.family} : besoin → bilan → disponibilités → créneaux → réservation`, async () => {
      let turn = await say(center, open(center, item.treatment), item.need);
      assert.match(turn.said, /Quand seriez-vous disponible/);
      assert.doesNotMatch(turn.said, QUESTIONNAIRE);
      assert.doesNotMatch(turn.said, /garanti|résultat assuré/i);

      turn = await say(center, turn.conversation, "Mardi après-midi");
      assert.match(turn.said, /mar\. 20\/10/);
      assert.match(turn.said, /lequel vous irait/);

      turn = await say(center, turn.conversation, "Le premier");
      assert.ok(turn.shouldBook, turn.said);
      assert.doesNotMatch(turn.said, /rendez-vous est confirmé/i);
    });

    test(`${center.name} — ${item.family} : une question pendant le parcours reçoit sa réponse, puis l’étape reprend`, async () => {
      let turn = await say(center, open(center, item.treatment), item.need);
      turn = await say(center, turn.conversation, "C’est où exactement ?");
      assert.match(turn.said, new RegExp(center.address.split(",")[0]));
      // L’étape vient d’être demandée : rappel sans reposer la même question.
      assert.match(turn.said, /Quand vous le souhaitez, indiquez-moi vos disponibilités pour le (bilan|diagnostic)/);
      assert.doesNotMatch(turn.said, /Quand seriez-vous disponible/);
      assert.doesNotMatch(turn.said, QUESTIONNAIRE);
      turn = await say(center, turn.conversation, "Jeudi");
      assert.match(turn.said, /jeu\. 15\/10|jeu\. 22\/10/);
    });
  }

  test(`${center.name} : un refus de créneau ne repropose pas le même jour`, async () => {
    let turn = await say(center, open(center, "Soin minceur"), "Je voudrais perdre du ventre");
    turn = await say(center, turn.conversation, "Mardi");
    assert.match(turn.said, /mar\. 20\/10/);
    turn = await say(center, turn.conversation, "Non pas mardi finalement, plutôt vendredi");
    assert.match(turn.said, /ven\. 16\/10|ven\. 23\/10/);
    assert.doesNotMatch(turn.said, /mar\. 20\/10/);
  });
}

test("objectif A + rappel autorisé : une demande explicite de rappel est transmise, sans créneau", async () => {
  const center = BOOK[0];
  let turn = await say(center, open(center, "Soin minceur"), "Je voudrais perdre du ventre");
  turn = await say(center, turn.conversation, "Je préfère qu’on m’appelle");
  assert.match(turn.said, /demande a été transmise à l’équipe/);
  assert.match(turn.said, /expert ou une experte minceur/);
  assert.doesNotMatch(turn.said, /\?|lequel vous irait/);
  assert.equal(turn.conversation.status, "À recontacter");
  assert.equal(shouldSkipRelance(turn.conversation), true);
});

for (const center of CALLBACK) {
  for (const item of FAMILIES) {
    test(`${center.name} — ${item.family} : besoin → bilan → accord → transmission, sans redemander l’accord`, async () => {
      let turn = await say(center, open(center, item.treatment), item.need);
      assert.match(turn.said, new RegExp(`${item.visit} permettra d’évaluer`, "i"));
      assert.match(turn.said, item.expert);
      assert.match(turn.said, /du centre vous rappelle pour/);
      assert.doesNotMatch(turn.said, QUESTIONNAIRE);
      assert.doesNotMatch(turn.said, /lequel vous irait|\d{1,2}h\d{2}/);

      turn = await say(center, turn.conversation, "Oui");
      assert.match(turn.said, /^Avec plaisir 😊 Votre demande a été transmise à l’équipe\./);
      assert.match(turn.said, item.expert);
      assert.match(turn.said, new RegExp(`organiser votre ${item.visit}`));
      assert.match(turn.said, /Bonne journée !$/);
      assert.doesNotMatch(turn.said, /\?|autre question|opératrice/);
      assert.equal(turn.conversation.status, "À recontacter");
      assert.equal(turn.conversation.bookingState.pendingQuestion, "callback");
      assert.ok(turn.conversation.teamNotes?.handedOffAt);
      assert.equal(shouldSkipRelance(turn.conversation), true);

      const mail = centerNotifyCopy({ kind: "callback", centerName: center.name, conversation: turn.conversation });
      assert.match(mail.text, /Un expert ou une experte doit le rappeler/);
      assert.doesNotMatch(mail.text, /opératrice|Rappel convenu/);

      turn = await say(center, turn.conversation, "Merci");
      assert.doesNotMatch(turn.said, /du centre vous rappelle pour|\?/);
      assert.equal(turn.conversation.status, "À recontacter");
    });
  }

  test(`${center.name} : RDV demandé alors que seul le rappel est actif → l’équipe l’organise, préférence notée, aucun créneau`, async () => {
    let turn = await say(center, open(center, "Soin minceur"), "Je voudrais un rendez-vous mardi à 14h");
    assert.match(turn.said, /C’est l’équipe du centre qui organise le bilan/);
    assert.match(turn.said, /préférence \(mardi 20\/10 vers 14h\)/);
    assert.match(turn.said, /vous rappelle pour le convenir avec vous \?$/);
    assert.doesNotMatch(turn.said, /lequel vous irait|14h00|confirmé/);
    assert.equal((turn.conversation.proposedSlots || []).length, 0);

    turn = await say(center, turn.conversation, "Je veux perdre du ventre");
    assert.match(turn.said, /ventre/);
    assert.match(turn.said, /du centre vous rappelle pour/);

    turn = await say(center, turn.conversation, "oui mais c’est combien ?");
    assert.match(turn.said, /offert/);
    assert.match(turn.said, /demande a été transmise à l’équipe/);
    assert.equal(turn.conversation.status, "À recontacter");

    turn = await say(center, turn.conversation, "Finalement plutôt jeudi matin");
    assert.match(turn.said, /jeudi 15\/10 matin/);
    assert.match(turn.said, /préférence à votre demande de rappel/);
    assert.doesNotMatch(turn.said, /lequel vous irait|\?/);
    const preferences = turn.conversation.teamNotes?.preferences || [];
    assert.ok(preferences.some((entry) => /mardi à 14h/.test(entry.text)));
    assert.ok(preferences.some((entry) => /jeudi matin/.test(entry.text)));
  });

  test(`${center.name} : une question après la proposition de rappel → réponse puis reprise, et « oui » vaut accord`, async () => {
    let turn = await say(center, open(center, "Soin visage"), "J'ai des taches sur le visage");
    turn = await say(center, turn.conversation, "Vous utilisez quel appareil ?");
    assert.match(turn.said, /HydraFacial/);
    assert.match(turn.said, /du centre peut vous rappeler pour en parler\.$/);
    assert.doesNotMatch(turn.said, /\?/);
    turn = await say(center, turn.conversation, "ok");
    assert.match(turn.said, /demande a été transmise à l’équipe/);
  });

  test(`${center.name} : « pas pour l’instant » → aucune transmission, aucune relance forcée`, async () => {
    let turn = await say(center, open(center, "Soin minceur"), "Je voudrais perdre du ventre");
    turn = await say(center, turn.conversation, "Non pas pour l’instant");
    assert.doesNotMatch(turn.said, /transmise|vous rappelle/);
    assert.ok(!turn.conversation.teamNotes?.handedOffAt);
    assert.notEqual(turn.conversation.status, "À recontacter");
  });
}

test("aucune action active : on répond et on explique le bilan, sans proposer d’action impossible", async () => {
  const center = {
    name: "Centre Accueil",
    address: "3 rue de Paris, 03200 Vichy",
    seya: { seyaMission: "welcome_relance", bookAppointment: false, handoffToHuman: false, treatmentBriefs: briefs("Vichy") },
  };
  let turn = await say(center, open(center, "Soin minceur"), "Je voudrais perdre du ventre");
  assert.match(turn.said, /bilan permettra d’évaluer/);
  assert.doesNotMatch(turn.said, /\?|disponible|vous rappelle|lequel/);
  turn = await say(center, turn.conversation, "C’est combien ?");
  assert.match(turn.said, /offert/);
  assert.doesNotMatch(turn.said, /Quand seriez-vous disponible|vous rappelle pour/);
});

test("après « je reviendrai vers vous », un nouveau message est traité avec les infos déjà connues", async () => {
  const center = BOOK[1];
  let turn = await say(center, open(center, "Soin minceur"), "Je voudrais perdre du ventre");
  turn = await say(center, turn.conversation, "Ok je reviendrai vers vous");
  assert.doesNotMatch(turn.said, /\?/);
  assert.equal(shouldSkipRelance(turn.conversation), true);
  turn = await say(center, turn.conversation, "Bonjour, finalement mardi ?");
  assert.match(turn.said, /mar\. 20\/10/);
  assert.doesNotMatch(turn.said, /quelle zone|Quand seriez-vous disponible/);
});

test("pas de boucle : le fallback ne répète jamais « Avez-vous une autre question ? »", async () => {
  for (const center of [...BOOK, ...CALLBACK]) {
    let conversation = open(center, "Soin minceur");
    const said = [];
    for (const text of ["Je voudrais perdre du ventre", "hmm", "d'accord je vois", "bon"]) {
      const turn = await say(center, conversation, text);
      conversation = turn.conversation;
      said.push(turn.said);
    }
    for (const text of said) {
      assert.doesNotMatch(text, /autre question/i, `${center.name}: ${text}`);
    }
    for (let index = 1; index < said.length; index += 1) {
      assert.notEqual(said[index], said[index - 1], `${center.name}: ${said[index]}`);
    }
  }
});

test("texte commun : la version précédente non modifiée est mise à jour, une version personnalisée est conservée", () => {
  const previous = COMMON_SEYA_GENERAL_BRIEF.replace(
    /Après l’accueil, intéresse-toi[^\n]+/,
    "Après l’accueil, intéresse-toi à la personne : reprends brièvement ce qu’elle vient de dire, sans phrase commerciale artificielle, puis pose une seule question utile. Minceur, laser ou visage : zone ou objectif, puis ce qu’elle a déjà essayé, puis les disponibilités. Demande la distance seulement si une règle du centre l’exige et que l’info manque. Ne redemande jamais une info déjà donnée. Si elle demande un rendez-vous ou donne une disponibilité, traite ça en priorité.",
  );
  assert.equal(resolveGeneralBrief(previous), COMMON_SEYA_GENERAL_BRIEF);
  const custom = `${previous}\n\nConsigne du centre : demander la distance.`;
  assert.equal(resolveGeneralBrief(custom), custom);
});
