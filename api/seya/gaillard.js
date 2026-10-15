const { findFacts } = require("./brief-facts");

const GAILLARD_NAME = "JFG Clinic Gaillard";
const GAILLARD_VISIT_MINUTES = { minceur: 90 };

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

function isGaillardCenter(centerName) {
  return /\bgaillard\b/.test(normalize(centerName));
}

function specialtyLabel(family) {
  if (family === "minceur") return "minceur";
  if (family === "epilation") return "en épilation";
  if (family === "visage") return "en soins visage";
  return "";
}

function expertLabel(family) {
  const specialty = specialtyLabel(family);
  return specialty
    ? `un expert ou une experte ${specialty} du centre`
    : "un expert ou une experte du centre";
}

function closingReply(family) {
  const specialty = specialtyLabel(family);
  const who = specialty
    ? `Un expert ou une experte ${specialty} du centre`
    : "Un expert ou une experte du centre";
  return `Merci pour ces précisions 😊 ${who} vous rappellera pour échanger sur votre besoin et convenir de votre rendez-vous.`;
}

function preferenceReply() {
  return "Merci, je transmets votre préférence à l’équipe 😊 Un expert ou une experte du centre vous rappellera pour organiser votre rendez-vous.";
}

function preferenceNotedPrefix() {
  return "Merci, je note votre préférence pour l’équipe 😊";
}

function afterHandoffReply() {
  return "C’est bien noté, je le transmets à l’équipe 😊 Un expert ou une experte du centre vous rappellera.";
}

/** Après transmission : on garde le fil ouvert, sans refermer la conversation. */
function keepConversationReply(family) {
  if (family === "minceur") {
    return "Avec plaisir 😊 Avez-vous une autre question sur le parcours minceur, les appareils, l’alimentation ou le bilan ?";
  }
  return "Avec plaisir 😊 Avez-vous une autre question sur le soin ? Je reste disponible pour vous préciser ce qui est en fiche.";
}

function acceptsContinue(text) {
  const value = normalize(text);
  if (!value || value.length > 120) {
    return false;
  }
  return (
    /^(oui|ok|okay|d'accord|dac|volontiers|avec plaisir|je veux|je suis interes|pourquoi pas)\b/.test(
      value,
    ) ||
    /\b(continuer|la suite|le bilan|ca m'interesse|ça m'intéresse|je continue|go)\b/.test(value)
  );
}

function lastSeyaAskedPath(conversation) {
  return /bilan (minceur )?offert|souhaitez-vous que je (fasse remonter|transmette)|ca vous parle|ça vous parle|organiser un bilan/i.test(
    lastSeyaQuestion(conversation),
  );
}

function pathQuestion() {
  return "Souhaitez-vous que je fasse remonter votre demande pour un bilan minceur offert avec un expert du centre ?";
}

const SUPPORT_TOPICS = [
  /appli|application/,
  /complement|physio/,
  /reequilibrage|aliment|nutrition|regime|coaching/,
];

/** Accompagnement minceur de la fiche (rééquilibrage, application, compléments), sans question. */
function minceurPathFacts(sources = [], pricing = {}) {
  const support = findFacts(
    sources,
    /reequilibrage|aliment|nutrition|application|appli|complement|physio|suivi/,
    3,
  );
  if (!support.length && /offert|gratuit/i.test(String(pricing?.bilan || ""))) {
    return "Le bilan minceur est offert.";
  }
  return support.join(" ");
}

/** Faits de la fiche sur le sujet précis de la question (application, compléments, alimentation). */
function supportTopicFacts(text, sources = []) {
  const value = normalize(text);
  const topic = SUPPORT_TOPICS.find((pattern) => pattern.test(value));
  return topic ? findFacts(sources, topic, 2).join(" ") : "";
}

/** Après la question régimes : faits de la fiche minceur puis proposition du bilan, sans clôturer. */
function minceurPathReply(sources = [], pricing = {}) {
  const facts = minceurPathFacts(sources, pricing);
  return [facts, pathQuestion()].filter(Boolean).join(" ");
}

/** Refus explicite de poursuivre l’échange, quelle que soit la question posée. */
function refusesToContinue(text) {
  const value = normalize(text);
  return (
    value.length <= 140 &&
    /je ne (veux|souhaite) pas (continuer|aller plus loin|repondre|de bilan|le bilan|etre rappelee?)|pas envie de (continuer|repondre)|je ne suis pas interess|je prefere (en rester la|arreter)/.test(
      value,
    )
  );
}

/** Réponse négative à la proposition de bilan. */
function declinesOffer(text) {
  const value = normalize(text);
  return (
    refusesToContinue(text) ||
    (value.length <= 140 &&
      /^(non|nan|bof|pas (pour )?(le moment|maintenant|tout de suite|besoin|interess)|ca ira|je prefere (pas|ne pas)|plus tard)\b/.test(
        value,
      ))
  );
}

function declinedReply(family) {
  return family === "minceur"
    ? "Très bien, je n’insiste pas 😊 Si vous avez une question sur le parcours minceur, ou si vous changez d’avis pour le bilan offert, je suis là."
    : "Très bien, je n’insiste pas 😊 Si vous avez une question sur le soin, je suis là.";
}

function modalityReply() {
  return "Je n’ai pas cette précision dans la fiche du soin. Je peux la vérifier auprès de l’équipe si vous le souhaitez.";
}

function identityReply() {
  return `Je suis Seya, l’assistante virtuelle du centre ${GAILLARD_NAME} 😊 Je recueille les informations sur votre demande, puis un expert ou une experte du centre vous rappelle pour vous accompagner.`;
}

function promoSentence() {
  return "Des promotions sont régulièrement proposées : les offres et conditions applicables sont à voir au centre.";
}

function missingPriceReply() {
  return "Je n’ai pas encore le tarif de cette zone dans la fiche du centre : l’équipe pourra vous le confirmer.";
}

function healthNotedReply() {
  return "Je note cette information pour l’équipe. Une validation médicale est nécessaire avant toute séance : l’équipe vérifiera si le soin est adapté à votre situation.";
}

function durationReply(family, text = "") {
  const minutes = GAILLARD_VISIT_MINUTES[family];
  if (!minutes) {
    return "";
  }
  const value = normalize(text);
  if (/decouverte|seance decouverte|test/.test(value) && !/bilan/.test(value)) {
    return "La séance découverte dure environ 20 minutes.";
  }
  if (/bilan/.test(value) && !/decouverte|ensemble|total/.test(value)) {
    return "Le bilan et la séance découverte durent environ 1 h 30 au total. La séance découverte seule dure environ 20 minutes.";
  }
  return "Le bilan et la séance découverte durent environ 1 h 30 au total. La séance découverte seule dure environ 20 minutes.";
}

function bookingCapabilityReply(handedOff = false) {
  return handedOff
    ? "Je ne peux pas bloquer un créneau moi-même : votre demande est déjà chez l’équipe, un expert ou une experte du centre vous rappellera pour convenir de votre rendez-vous."
    : "Je ne peux pas bloquer un créneau moi-même : c’est l’équipe qui organise le rendez-vous, après un court échange avec vous.";
}

function countryReply(address, centerName) {
  const raw = String(address || "").trim();
  const hay = normalize(`${raw} ${centerName || ""}`);
  if (!hay) {
    return "";
  }
  if (/\bsuisse\b|\bswitzerland\b|\bch-\d{4}\b/.test(hay)) {
    return "Nous sommes en Suisse.";
  }
  if (/\bfrance\b/.test(hay) || /\b\d{5}\b/.test(raw) || /\bgaillard\b/.test(hay)) {
    if (/\bgaillard\b/.test(hay)) {
      return "Nous sommes en France, à Gaillard (Haute-Savoie), près de la frontière suisse.";
    }
    return "Nous sommes en France.";
  }
  return "";
}

function asksCountry(text) {
  const value = normalize(text);
  return (
    /\b(france|suisse|switzerland|pays)\b/.test(value) &&
    (/\?|ou |etes|êtes|c[' ]est/.test(value) || /france.*suisse|suisse.*france/.test(value))
  );
}

function asksBookingNow(text) {
  const value = normalize(text);
  return (
    /prendre (un )?rdv|prendre (un )?rendez|reserver|je (peux|puis) (pas )?(prendre|venir)|tout de suite|maintenant/.test(
      value,
    ) &&
    (/rdv|rendez|creneau|venir|reserver/.test(value) || /\?/.test(String(text || "")))
  );
}

function asksProcess(text) {
  const value = normalize(text);
  return /comment (se )?deroule|c[' ]est quoi (un |le )?bilan|en quoi consiste|deroulement|comment ca se passe/.test(
    value,
  );
}

function asksTechnology(text) {
  const value = normalize(text);
  return (
    /technologie|machines?|appareils?|equipements?|materiel|cryolipolyse|cryo|radiofrequ|ultrasons?|lumiere pulsee|c[' ]est (du |de la )?laser/.test(
      value,
    ) &&
    (/\?|quoi|quelles|avez|utilisez|utilises|presentes|faisiez|faites|pour (la |le )?minceur|pour (l[' ]|la )?epilation/.test(
      value,
    ) ||
      /lumiere pulsee|cryolipolyse|radiofrequ/.test(value))
  );
}

function asksChildCompanion(text) {
  const value = normalize(text);
  return /enfant|bebe|nourrisson|avec mon fils|avec ma fille/.test(value);
}

function processReply(family, sources = []) {
  const found = findFacts(sources, /deroule|consiste|bilan|analyse|decouverte|protocole|etape/, 2);
  if (found.length) {
    return found.join(" ");
  }
  if (family === "minceur") {
    return "Le bilan commence par une analyse corporelle, puis une séance découverte. On vous explique ensuite le protocole adapté à vos objectifs et un devis personnalisé.";
  }
  if (family === "epilation") {
    return "Le bilan pilaire permet d’analyser la pilosité et la peau, puis de vous proposer un protocole et un devis pour la zone.";
  }
  if (family === "visage") {
    return "Le diagnostic visage permet de faire le point sur la peau, puis de vous proposer un protocole adapté.";
  }
  return "Je n’ai pas le déroulement détaillé dans la fiche du soin. Je peux le vérifier auprès de l’équipe si vous le souhaitez.";
}

function technologyReply(text, sources = []) {
  if (/lumiere pulsee/.test(normalize(text))) {
    const found = findFacts(sources, /lumiere pulsee|ipl|laser/, 1)[0];
    return (
      found ||
      "Je n’ai pas dans la fiche si l’épilation du centre est en lumière pulsée ou en laser. Je peux le vérifier auprès de l’équipe si vous le souhaitez."
    );
  }
  const found = findFacts(
    sources,
    /technologie|machine|appareil|equipement|laser|cryo|radiofrequ|ultrasons|ipl|lumiere pulsee/,
    2,
  );
  return found.length
    ? found.join(" ")
    : "Je n’ai pas la liste des appareils dans la fiche du centre. Je peux la vérifier auprès de l’équipe si vous le souhaitez.";
}

function childCompanionReply(sources = []) {
  return (
    findFacts(sources, /enfant|bebe/, 1)[0] ||
    "Je n’ai pas cette information dans la fiche du centre. Je peux vérifier auprès de l’équipe si vous pouvez venir avec votre enfant."
  );
}

function serviceOfferedReply(offered, askedLabel) {
  const label = String(askedLabel || "cette prestation").trim();
  if (offered) {
    return `Oui, nous proposons ${label}.`;
  }
  return `Non, nous ne faisons pas ${label}.`;
}

function missingPracticalReply(topic) {
  const label = String(topic || "cette information").trim();
  return `Je n’ai pas ${label} dans la fiche du centre. Je peux la vérifier auprès de l’équipe si vous le souhaitez.`;
}

function needQuestion(family, missing = "") {
  if (family === "minceur") {
    if (missing === "objectif") {
      return "Quel est votre objectif pour ce soin minceur ?";
    }
    if (missing === "zones") {
      return "Quelles zones aimeriez-vous travailler ?";
    }
    return "Quel est votre objectif, et quelles zones aimeriez-vous travailler ?";
  }
  if (family === "epilation") {
    return "Quelles zones souhaitez-vous traiter ?";
  }
  if (family === "visage") {
    return "Qu’est-ce qui vous préoccupe au niveau de votre peau, et qu’attendez-vous du soin ?";
  }
  return "Vous cherchez plutôt un soin minceur, un soin visage ou une épilation ?";
}

const QUESTION_REPHRASED = {
  "Quel est votre objectif pour ce soin minceur ?":
    "Et pour ces zones, que recherchez-vous surtout : perdre du poids, affiner, raffermir ?",
  "Quelles zones aimeriez-vous travailler ?": "Sur quelles zones aimeriez-vous agir en priorité ?",
  "Quel est votre objectif, et quelles zones aimeriez-vous travailler ?":
    "Que recherchez-vous surtout, et sur quelles zones ?",
  "Quelles zones souhaitez-vous traiter ?": "Quelles autres zones aimeriez-vous traiter, le cas échéant ?",
};

/** Évite d’envoyer deux fois de suite exactement la même question. */
function varyQuestion(question, previousSeyaText) {
  const asked = String(question || "").trim();
  if (normalize(asked) !== normalize(previousSeyaText)) {
    return asked;
  }
  return QUESTION_REPHRASED[asked] || asked;
}

function triedQuestion(family) {
  if (family === "epilation") {
    return "Avez-vous déjà testé une solution d’épilation définitive, comme le laser ou la lumière pulsée ?";
  }
  if (family === "visage") {
    return "Avez-vous déjà testé des soins pour votre peau ?";
  }
  return "Avez-vous déjà testé une solution pour cela (rééquilibrage, soins, appareils…) ?";
}

function lastSeyaQuestion(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya" && String(item.text || "").includes("?"))?.text || ""
  );
}

function lastSeyaAskedNeed(conversation) {
  return /quel est votre objectif|quelles? zones?|qu['’]est-ce qui vous pr[ée]occupe/i.test(
    lastSeyaQuestion(conversation),
  );
}

function lastSeyaAskedTried(conversation) {
  return /d[ée]j[àa] (test[ée]|essay[ée])/i.test(lastSeyaQuestion(conversation));
}

const STEP_QUESTIONS = [
  /quel est votre objectif|quelles? zones?|qu['’]est-ce qui vous pr[ée]occupe/i,
  /d[ée]j[àa] (test|essay)/i,
  /combien de kilos/i,
  /bilan (minceur )?offert|souhaitez-vous que je (fasse remonter|transmette)/i,
];

function looksLikeHandoffClose(text) {
  return /rappellera|transmets (votre |sa )?preference|transmets (votre demande )?a l['’ ]equipe|c['’ ]est bien note, je le transmets/i.test(
    normalize(text),
  );
}

function changesStep(draft, polished) {
  const asked = String(polished || "");
  const previous = String(draft || "");
  // Une conclusion « expert rappellera » ne doit jamais remplacer une question encore ouverte.
  if (previous.includes("?") && looksLikeHandoffClose(asked) && !asked.includes("?")) {
    return true;
  }
  if (!asked.includes("?")) {
    return false;
  }
  return STEP_QUESTIONS.some(
    (pattern) => pattern.test(asked) && !pattern.test(previous),
  );
}

function kilosQuestion() {
  return "Combien de kilos aimeriez-vous perdre ?";
}

function lastSeyaAskedKilos(conversation) {
  return /combien de kilos/i.test(lastSeyaQuestion(conversation));
}

function isAnswerLike(text) {
  const value = normalize(text)
    .replace(/[!.,;:?…)(-]+/g, " ")
    .replace(/\b(bonjour|bonsoir|salut|hello|coucou|oui|ok|okay|d'accord|daccord|merci|super|parfait|tres bien|bien sur)\b/g, " ")
    .trim();
  if (!value) {
    return false;
  }
  return !/\?|j'habite|je suis (a|de|sur|pres)|je viens de|domicili|loin|distance/.test(normalize(text));
}

const QUESTION_CUE =
  /\?|est[- ]ce que|faut[- ]il|dois[- ]je|je dois|doit[- ]on|peut[- ]on|on peut|je peux|puis[- ]je|il faut|comment/;

const MODALITY_TOPICS = [
  ["tenue", /pantalon|jupe|robe|\bshort\b|legging|jogging|tenue|vetement|habill|sous[- ]vetement|culotte|slip|string|soutien[- ]gorge|brassiere|maillot de bain|deshabill/],
  ["rasage", /\brase|raser|rasage|rasoir|tondeuse|poils? (long|pousse)|epiler avant|cire avant/],
  ["jeun", /a jeun|manger avant|repas avant|boire avant/],
  ["peau", /douche|creme|maquillage|deodorant|parfum|autobronz/],
  ["soleil", /bronz|soleil|\buv\b|exposition/],
  ["apres", /sport apres|apres la seance|apres le soin|apres une seance/],
  ["apporter", /apporter|prevoir|ramener/],
];

function modalityTopic(text) {
  const value = normalize(text);
  if (!QUESTION_CUE.test(value)) {
    return "";
  }
  const hit = MODALITY_TOPICS.find(([, pattern]) => pattern.test(value));
  return hit ? hit[0] : "";
}

function validatedModality(text, sources) {
  const topic = modalityTopic(text);
  if (!topic) {
    return "";
  }
  const pattern = MODALITY_TOPICS.find(([name]) => name === topic)[1];
  return findFacts(sources, pattern, 1)[0] || "";
}

function asksIfAi(text, isIdentityQuestion) {
  const value = normalize(text);
  if (isIdentityQuestion(text)) {
    return true;
  }
  return (
    /\?|est[- ]ce|c[' ]est|vous etes|tu es|etes[- ]vous|es[- ]tu/.test(value) &&
    /\brobot\b|\bbot\b|\bia\b|vraie personne|un humain|une humaine|personne reelle|reponse automatique|message automatique/.test(value)
  );
}

function availabilityMention(text) {
  const value = normalize(text);
  return /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres[- ]demain|aujourd'hui|ce soir|matin|matinee|apres[- ]midi|soir|soiree|fin de journee|debut de semaine|fin de semaine|week[- ]?end|midi|dispo|disponible|disponibilites?)\b|\b\d{1,2}\s*h\b|\b\d{1,2}\s*h\s*\d{2}\b|\b\d{1,2}\/\d{1,2}\b/.test(
    value,
  );
}

function availabilityContext(text) {
  const value = normalize(text);
  if (/appel|rappel|joindre|joignable|telephon|\btel\b/.test(value)) {
    return "pour être rappelé(e)";
  }
  if (/venir|passer|rdv|rendez|seance|bilan|centre|sur place/.test(value)) {
    return "pour venir au centre";
  }
  return "contexte non précisé";
}

function withPreference(conversation, text, at) {
  const notes = conversation?.teamNotes || {};
  const preferences = Array.isArray(notes.preferences) ? notes.preferences : [];
  const entry = {
    text: String(text || "").trim().slice(0, 200),
    context: availabilityContext(text),
    at,
  };
  if (preferences.some((item) => item.text === entry.text)) {
    return conversation;
  }
  return {
    ...conversation,
    teamNotes: { ...notes, preferences: [...preferences, entry] },
  };
}

const RULE_BREAK =
  /disponibilit|quand seriez|quand etes|quel jour|quels jours|quelle heure|a quelle heure|dites-moi un (ou deux )?jours?|debut de semaine|fin de semaine|un creneau|des creneaux|ce creneau|je regarde (le planning|un creneau|les creneaux)|je (peux )?vous propose|lequel vous irait|quelle distance|habitez|loin de|pres de chez|annemasse|operatrice/;

function breaksGaillardRules(text) {
  return RULE_BREAK.test(normalize(text));
}

function safeGaillardText(text, family) {
  const replaced = String(text || "")
    .replace(/\bune op[ée]ratrice\b/gi, expertLabel(family))
    .replace(/\bUne op[ée]ratrice\b/g, () => {
      const label = expertLabel(family);
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  const sentences = replaced
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return sentences
    .filter((sentence) => !breaksGaillardRules(sentence))
    .join(" ")
    .trim();
}

function relanceText(round, firstName, care, custom) {
  if (custom && !breaksGaillardRules(custom)) {
    return custom;
  }
  const about = care ? `votre demande pour ${care}` : "votre demande";
  if (Number(round) >= 3) {
    const hello = firstName ? `Bonjour ${firstName} 😊` : "Bonjour 😊";
    return `${hello} Je reviens une dernière fois vers vous au sujet de ${about}. Si vous le souhaitez, un expert ou une experte du centre peut vous rappeler pour en parler.`;
  }
  if (Number(round) === 2) {
    const who = firstName ? `${firstName}, je` : "Je";
    return `${who} ne veux pas vous relancer inutilement. Si ${about} est toujours d’actualité, répondez simplement à ce message : un expert ou une experte du centre vous rappellera.`;
  }
  const hello = firstName ? `Bonjour ${firstName}` : "Bonjour";
  return `${hello}, je reviens vers vous au sujet de ${about}. Dites-moi en quelques mots ce que vous recherchez, un expert ou une experte du centre vous rappellera ensuite 😊`;
}

function promptRules(family) {
  return [
    `Mission de ${GAILLARD_NAME} : accueillir chaleureusement, comprendre le besoin, s’appuyer sur la fiche du soin, puis transmettre à l’équipe quand le prospect est prêt. Un expert ou une experte du centre rappelle ensuite.`,
    "Interdit de demander des disponibilités (ni pour venir au centre, ni pour un rappel), de proposer un créneau, de prendre ou confirmer un rendez-vous.",
    family === "minceur"
      ? "Parcours minceur : 1) accueil, 2) besoin (objectif + zones ; kilos si perte de poids sans montant), 3) question régimes / solutions déjà testées, 4) à ce moment expliquer ce qui est dans la fiche (rééquilibrage alimentaire, suivi sur application, compléments éventuels non obligatoires, appareils), 5) proposer le bilan offert avec une question ouverte. Une seule question à la fois. Interdit de clôturer juste après les zones ou juste après « déjà testé »."
      : "Parcours : 1) comprendre le besoin (épilation : zones ; visage : préoccupations), 2) demander s’il a déjà testé une solution, 3) conclure. Une seule question à la fois.",
    `Conclusion, seulement quand le prospect confirme qu’il veut être rappelé / le bilan : « ${closingReply(family)} » Interdit d’annoncer cette conclusion tant que la qualification minceur n’est pas allée jusqu’à la proposition de bilan.`,
    "Tu restes chaleureuse et tu laisses toujours une porte ouverte (question utile). Interdit de fermer le fil avec un simple « je transmets » si le prospect pose encore une question ou dit seulement « oui ».",
    "Si le prospect donne spontanément un jour ou une heure, tu dis seulement que tu transmets sa préférence à l’équipe. Tu ne promets aucun rappel à cette heure, tu ne confirmes aucun rendez-vous, tu ne transformes pas une disponibilité pour venir en disponibilité pour un appel.",
    "Tu dis « un expert ou une experte du centre », jamais « une opératrice ».",
    "Interdit de demander où habite le prospect ou à quelle distance il se trouve, et interdit de proposer un autre centre (Annemasse ou autre). Si on te demande où est le centre, tu donnes uniquement l’adresse fournie plus bas.",
    `Modalités pratiques (tenue, rasage, préparation…) : seulement ce qui est écrit dans la fiche du soin. Sinon : « ${modalityReply()} » Interdit d’inventer, par exemple, qu’on peut garder son pantalon.`,
    "Tarifs : seulement si le prospect les demande, avec les tarifs de la fiche. Jamais de remise précise sans offre active renseignée.",
    "Après la transmission à l’équipe, tu réponds encore aux questions documentées dans la fiche. Tu ne poses plus aucune question de planning.",
  ].join("\n");
}

module.exports = {
  GAILLARD_VISIT_MINUTES,
  acceptsContinue,
  afterHandoffReply,
  asksBookingNow,
  asksChildCompanion,
  asksCountry,
  asksIfAi,
  asksProcess,
  asksTechnology,
  availabilityContext,
  availabilityMention,
  bookingCapabilityReply,
  breaksGaillardRules,
  changesStep,
  childCompanionReply,
  closingReply,
  countryReply,
  declinedReply,
  declinesOffer,
  durationReply,
  expertLabel,
  healthNotedReply,
  identityReply,
  isAnswerLike,
  isGaillardCenter,
  keepConversationReply,
  kilosQuestion,
  lastSeyaAskedKilos,
  lastSeyaAskedNeed,
  lastSeyaAskedPath,
  lastSeyaAskedTried,
  looksLikeHandoffClose,
  minceurPathFacts,
  minceurPathReply,
  missingPracticalReply,
  missingPriceReply,
  modalityReply,
  modalityTopic,
  needQuestion,
  pathQuestion,
  preferenceNotedPrefix,
  preferenceReply,
  processReply,
  promoSentence,
  promptRules,
  refusesToContinue,
  relanceText,
  safeGaillardText,
  serviceOfferedReply,
  supportTopicFacts,
  technologyReply,
  triedQuestion,
  validatedModality,
  varyQuestion,
  withPreference,
};
