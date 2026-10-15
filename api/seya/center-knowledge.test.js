const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply, pickSafeReply } = require("./ai");
const { startConversation } = require("./agent");
const { centerNotifyCopy } = require("./center-notify");
const {
  TEAM_QUESTION_FAILED_REPLY,
  TEAM_QUESTION_REPLY,
  checkAgainstCenter,
  technologyReply,
  withoutTeamQuestion,
} = require("./center-knowledge");

const NOW = new Date("2026-10-15T10:00:00");
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

const RICH_MINCEUR = `OFFRE : Bilan minceur complet offert (analyse corporelle + conseils personnalisés). Durée du bilan : environ 1 heure.
APPAREILS :
- Cryolipolyse : élimine les amas graisseux localisés par le froid (ventre, poignées d'amour, cuisses, bras).
- Radiofréquence : raffermit la peau et lisse la cellulite.
- Pressothérapie : draine et soulage les jambes lourdes.
- Cellu M6 (palper-rouler) : cellulite et peau d'orange, cuisses et fesses.
- EMS : renforcement musculaire du ventre et des fessiers.
CONSIGNES :
Ne parle jamais du prix des cures avant que la cliente le demande.`;

function center(name, mission, minceurBrief, pricing = { bilan: "offert" }) {
  return {
    name,
    seya: {
      seyaMission: mission,
      bookAppointment: mission === "book",
      handoffToHuman: true,
      treatmentBriefs: [
        { name: "Soin minceur", brief: minceurBrief, pricing },
        { name: "Épilation laser", brief: "Épilation au laser alexandrite.\nBilan pilaire offert.", pricing: { bilan: "offert" } },
      ],
    },
  };
}

const RICH_BOOK = center("Centre Annecy", "book", RICH_MINCEUR);
const RICH_CALLBACK = center("Centre Annecy Rappel", "qualify_callback", RICH_MINCEUR);
const OTHER = center("Centre Vichy", "book", "Bilan minceur offert, environ 30 minutes.\nAppareils : pressothérapie et cavitation.");
const CONFLICT = center(
  "Centre Nice",
  "qualify_callback",
  "Bilan minceur à 30 €.\nLe bilan dure environ 45 minutes.\nPremier rendez-vous d'environ 1h30 avec séance test.",
);

function lastSeya(conversation) {
  return [...(conversation.messages || [])].reverse().find((m) => m.author === "seya")?.text || "";
}

async function say(place, conversation, text) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya: place.seya,
    appointments: [],
    hours,
    centerName: place.name,
    centerAddress: "1 rue de la Paix, 74000 Annecy",
    centerId: place.name,
    now: NOW,
  });
  return { conversation: result.conversation, said: lastSeya(result.conversation) };
}

function open(place) {
  return startConversation(
    { leadId: `lead-${place.name}`, centerId: place.name, firstName: "Léa", phone: "0611223344", treatment: "Soin minceur" },
    place.name,
    place.seya,
  );
}

const DEVICES = /\bcryo\b|radiofréquence|pressothérapie|palper-rouler|électrostimulation|cavitation/g;
const STEP_QUESTION = /Quand seriez-vous disponible|vous rappelle pour organiser/;

test("« Quels appareils pour le ventre ? » en prise de RDV : appareils du ventre, sobres, sans reposer la question qui vient d’être posée", async () => {
  let turn = await say(RICH_BOOK, open(RICH_BOOK), "Je voudrais perdre du ventre");
  assert.match(turn.said, /Quand seriez-vous disponible \?$/);
  turn = await say(RICH_BOOK, turn.conversation, "Quels appareils utilisez-vous pour le ventre ?");
  // « élimine les amas graisseux » (fiche) est une promesse : rôle sobre à la place.
  assert.match(turn.said, /^Pour le ventre, le centre utilise la cryo, qui utilise le froid pour cibler les graisses localisées/);
  assert.doesNotMatch(turn.said, /élimine|pressothérapie|palper|CONSIGNES|Ne parle jamais|APPAREILS|fiche/);
  assert.ok((turn.said.match(DEVICES) || []).length <= 3);
  assert.doesNotMatch(turn.said, STEP_QUESTION);
  assert.match(turn.said, /indiquez-moi vos disponibilités pour le bilan et je regarde les créneaux\.$/);
  assert.equal(turn.conversation.bookingState.pendingQuestion, "offer_slots");

  turn = await say(RICH_BOOK, turn.conversation, "Et pour la cellulite sur les cuisses ?");
  assert.match(turn.said, /^Pour la cellulite sur les cuisses, le centre utilise le palper-rouler mécanique.*radiofréquence/);
  assert.doesNotMatch(turn.said, /\bcryo\b|pressothérapie|je vous écoute|disponibilités/i);

  turn = await say(RICH_BOOK, turn.conversation, "C'est quoi la cryolipolyse ?");
  assert.equal(
    turn.said,
    "La cryo utilise le froid pour cibler les graisses localisées. Le bilan permet d’évaluer si cette technique est adaptée à votre besoin.",
  );

  turn = await say(RICH_BOOK, turn.conversation, "Vendredi matin");
  assert.match(turn.said, /ven\. 16\/10/);
});

test("même question en mission rappel : rappel sans question, et « oui » vaut accord", async () => {
  let turn = await say(RICH_CALLBACK, open(RICH_CALLBACK), "le ventre et les poignées d amour");
  turn = await say(RICH_CALLBACK, turn.conversation, "Quels appareils utilisez-vous pour le ventre ?");
  assert.match(turn.said, /^Pour le ventre, le centre utilise la cryo,/);
  assert.match(turn.said, /Si vous le souhaitez, un expert ou une experte minceur du centre peut vous rappeler pour en parler\.$/);
  assert.doesNotMatch(turn.said, /\?|quelle zone|objectif/i);
  turn = await say(RICH_CALLBACK, turn.conversation, "oui");
  assert.match(turn.said, /demande a été transmise/);
});

test("rappel déjà accepté : une question sur un appareil ne relance ni rappel ni rendez-vous", async () => {
  let turn = await say(RICH_CALLBACK, open(RICH_CALLBACK), "le ventre");
  turn = await say(RICH_CALLBACK, turn.conversation, "oui je veux bien être rappelée");
  assert.match(turn.said, /demande a été transmise/);
  turn = await say(RICH_CALLBACK, turn.conversation, "Vous utilisez quoi pour le ventre ?");
  assert.match(turn.said, /^Pour le ventre, le centre utilise la cryo,/);
  assert.doesNotMatch(turn.said, /rappeler|rappelle|disponibilités|créneau/);
  assert.equal(turn.conversation.bookingState.pendingQuestion, "callback");
});

test("créneaux déjà proposés : la reprise renvoie aux créneaux, sans redemander les disponibilités", async () => {
  let turn = await say(RICH_BOOK, open(RICH_BOOK), "le ventre");
  turn = await say(RICH_BOOK, turn.conversation, "vendredi matin");
  assert.match(turn.said, /ven\. 16\/10.*09h00/);
  turn = await say(RICH_BOOK, turn.conversation, "Et la cryo ça marche comment ?");
  assert.match(turn.said, /^La cryo utilise le froid/);
  assert.match(turn.said, /Dites-moi si l’un des créneaux proposés vous convient\.$/);
  assert.doesNotMatch(turn.said, /Quand seriez-vous disponible|indiquez-moi vos disponibilités/);
  assert.equal(turn.conversation.status, "RDV proposé");
  turn = await say(RICH_BOOK, turn.conversation, "le premier");
  assert.equal(turn.conversation.status, "RDV pris");
});

test("un prospect qui a décliné n’est pas relancé après une question sur un appareil", async () => {
  let turn = await say(RICH_BOOK, open(RICH_BOOK), "le ventre");
  turn = await say(RICH_BOOK, turn.conversation, "Non merci");
  assert.match(turn.said, /je n’insiste pas/);
  turn = await say(RICH_BOOK, turn.conversation, "Vous utilisez quels appareils pour le ventre ?");
  assert.doesNotMatch(turn.said, /disponib|créneau|\?/);
});

test("un autre centre garde ses propres appareils, sans répéter le bilan offert", async () => {
  let turn = await say(OTHER, open(OTHER), "Je veux perdre du ventre");
  assert.match(turn.said, /Le bilan minceur est offert/);
  turn = await say(OTHER, turn.conversation, "Quels appareils utilisez-vous pour le ventre ?");
  assert.match(turn.said, /^Pour le ventre, le centre utilise la cavitation/);
  assert.doesNotMatch(turn.said, /\bcryo\b|radiofréquence|pressothérapie/);
  turn = await say(OTHER, turn.conversation, "Vous faites la cryolipolyse ?");
  assert.equal(turn.said, "Non, le centre n’utilise pas la cryo : il travaille avec la pressothérapie et la cavitation.");
  turn = await say(OTHER, turn.conversation, "Combien de temps dure le bilan ?");
  assert.match(turn.said, /^Le bilan dure environ 30 minutes\./);
});

test("fiche contradictoire : ni tarif ni durée choisis au hasard, la question part à l’équipe", async () => {
  let turn = await say(CONFLICT, open(CONFLICT), "le ventre");
  turn = await say(CONFLICT, turn.conversation, "C'est combien le bilan ?");
  assert.match(turn.said, /^Je préfère ne pas vous donner une information inexacte\. Je transmets votre question/);
  assert.doesNotMatch(turn.said, /30 €|offert/);
  assert.equal(turn.conversation.teamNotes.question.status, "pending");
  assert.equal(turn.conversation.teamNotes.question.text, "C'est combien le bilan ?");
  turn = await say(CONFLICT, turn.conversation, "Et ça dure combien de temps ?");
  assert.doesNotMatch(turn.said, /45 minutes|1h30|1 h 30/);
  assert.match(turn.said, /Je transmets votre question/);
});

test("vérification avant envoi : consignes internes et autre soin retirés", () => {
  const checked = checkAgainstCenter(
    "Le bilan minceur est offert. Consigne : ne parle jamais du prix. Le bilan pilaire est offert.",
    { allowedFamilies: ["minceur"] },
  );
  assert.equal(checked.text, "Le bilan minceur est offert.");
  assert.deepEqual(checked.removed, ["internal", "family:epilation"]);
});

test("une rédaction IA qui récite la fiche ou mélange les soins est refusée", () => {
  const draft = "Pour le ventre, le centre utilise la cryo, qui utilise le froid pour cibler les graisses localisées.";
  const conversation = { treatment: "Soin minceur", qualification: { need: "Soin minceur" }, messages: [{ author: "lead", text: "Quels appareils pour le ventre ?" }] };
  const recited = "Nous avons la cryo, la radiofréquence, la pressothérapie, le Cellu M6 et l’EMS pour tout le corps.";
  assert.equal(pickSafeReply(draft, recited, {}, conversation), draft);
  const mixed = "Pour le ventre, on utilise la cryo. Le bilan pilaire est offert aussi.";
  assert.equal(pickSafeReply(draft, mixed, {}, conversation), draft);
  const fullTerm = "Pour le ventre, nous utilisons la Cryolipolyse, par le froid.";
  assert.equal(pickSafeReply(draft, fullTerm, {}, conversation), "Pour le ventre, nous utilisons la Cryo, par le froid.");
});

test("question transmise : mail centre, et texte retiré si le mail n’est pas parti", () => {
  const copy = centerNotifyCopy({
    kind: "question",
    centerName: "Centre Nice",
    conversation: { firstName: "Léa", phone: "0611223344", treatment: "Soin minceur", teamNotes: { question: { text: "Je peux venir avec ma fille ?" } } },
  });
  assert.match(copy.subject, /question à laquelle répondre/);
  assert.match(copy.text, /Question : « Je peux venir avec ma fille \? »/);
  assert.equal(withoutTeamQuestion(`${TEAM_QUESTION_REPLY} Souhaitez-vous un rappel ?`), `${TEAM_QUESTION_FAILED_REPLY} Souhaitez-vous un rappel ?`);
});

test("sélection pure : sans appareil dans la fiche, rien n’est inventé", () => {
  assert.equal(technologyReply({ text: "Quels appareils pour le ventre ?", family: "minceur", sources: ["Bilan minceur offert."] }), "");
});
