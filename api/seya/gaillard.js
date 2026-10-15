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

function modalityReply() {
  return "Les modalités du soin vous seront expliquées au centre. Un expert ou une experte pourra également répondre à cette question lors de votre échange.";
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

function bookingCapabilityReply() {
  return "Je ne peux pas bloquer un créneau moi-même : la réservation se fait avec l’équipe. Un expert ou une experte du centre vous rappellera pour convenir de votre rendez-vous.";
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
    /technologie|machines?|appareils?|materiel|lumiere pulsee|c[' ]est (du |de la )?laser/.test(
      value,
    ) &&
    (/\?|quoi|quelles|avez|utilisez|presentes|faisiez|faites/.test(value) ||
      /lumiere pulsee/.test(value))
  );
}

function asksChildCompanion(text) {
  const value = normalize(text);
  return /enfant|bebe|nourrisson|avec mon fils|avec ma fille/.test(value);
}

function processReply(family, sources = []) {
  const blob = sources.map((item) => String(item || "").trim()).filter(Boolean).join(" ");
  const sentences = blob
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((sentence) =>
      /deroule|consiste|bilan|analyse|decouverte|protocole|etape/.test(normalize(sentence)),
    );
  if (sentences[0]) {
    return sentences[0];
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
  return "Le déroulement exact dépend de la prestation : l’équipe vous l’explique lors de votre échange.";
}

function technologyReply(text, sources = []) {
  const value = normalize(text);
  const blob = sources.map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  const sentences = blob
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (/lumiere pulsee/.test(value)) {
    const found = sentences.find((sentence) =>
      /lumiere pulsee|ipl|laser/.test(normalize(sentence)),
    );
    if (found) {
      return found;
    }
    return "Je n’ai pas en fiche si l’épilation du centre est en lumière pulsée ou en laser. L’équipe pourra vous le confirmer.";
  }
  const tech = sentences.find((sentence) =>
    /technologie|machine|appareil|laser|cryo|radiofrequ|ultrasons|ipl|lumiere pulsee/.test(
      normalize(sentence),
    ),
  );
  if (tech) {
    return tech;
  }
  return "Je n’ai pas la liste des machines renseignée pour ce centre. L’équipe pourra vous préciser les technologies utilisées.";
}

function childCompanionReply(sources = []) {
  const blob = sources.map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  const found = blob
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .find((sentence) => /enfant|accompagn|bebe/.test(normalize(sentence)));
  if (found) {
    return found;
  }
  return "Je n’ai pas cette consigne en fiche. L’équipe pourra vous confirmer si vous pouvez venir avec votre enfant.";
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
  return `Je n’ai pas ${label} en fiche pour le centre. L’équipe pourra vous le confirmer lors de votre échange.`;
}

function needQuestion(family) {
  if (family === "minceur") {
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
];

function changesStep(draft, polished) {
  const asked = String(polished || "");
  if (!asked.includes("?")) {
    return false;
  }
  return STEP_QUESTIONS.some(
    (pattern) => pattern.test(asked) && !pattern.test(String(draft || "")),
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
  for (const source of sources) {
    const sentences = String(source || "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const found = sentences.find((sentence) => pattern.test(normalize(sentence)));
    if (found) {
      return found;
    }
  }
  return "";
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
    `Mission de ${GAILLARD_NAME} : recueillir les informations puis transmettre à l’équipe. Un expert ou une experte du centre rappelle ensuite le prospect.`,
    "Interdit de demander des disponibilités (ni pour venir au centre, ni pour un rappel), de proposer un créneau, de prendre ou confirmer un rendez-vous.",
    "Parcours : 1) comprendre le besoin (minceur : objectif et zones, et si la personne veut perdre du poids sans avoir précisé combien, « Combien de kilos aimeriez-vous perdre ? » ; épilation : zones à traiter ; visage : préoccupations et attentes), 2) demander s’il a déjà testé une solution, 3) conclure. Une seule question à la fois, jamais une question à laquelle il a déjà répondu.",
    `Conclusion, une fois les informations recueillies : « ${closingReply(family)} »`,
    "Si le prospect donne spontanément un jour ou une heure, tu dis seulement que tu transmets sa préférence à l’équipe. Tu ne promets aucun rappel à cette heure, tu ne confirmes aucun rendez-vous, tu ne transformes pas une disponibilité pour venir en disponibilité pour un appel.",
    "Tu dis « un expert ou une experte du centre », jamais « une opératrice ».",
    "Interdit de demander où habite le prospect ou à quelle distance il se trouve, et interdit de proposer un autre centre (Annemasse ou autre). Si on te demande où est le centre, tu donnes uniquement l’adresse fournie plus bas.",
    `Modalités pratiques (tenue, rasage, préparation…) : seulement ce qui est écrit dans la fiche du soin. Sinon : « ${modalityReply()} » Interdit d’inventer, par exemple, qu’on peut garder son pantalon.`,
    "Tarifs : seulement si le prospect les demande, avec les tarifs de la fiche. Jamais de remise précise sans offre active renseignée.",
    "Après la transmission à l’équipe, tu ne poses plus aucune question de planning.",
  ].join("\n");
}

module.exports = {
  GAILLARD_VISIT_MINUTES,
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
  durationReply,
  expertLabel,
  healthNotedReply,
  identityReply,
  isAnswerLike,
  isGaillardCenter,
  lastSeyaAskedNeed,
  kilosQuestion,
  lastSeyaAskedKilos,
  lastSeyaAskedTried,
  missingPracticalReply,
  missingPriceReply,
  modalityReply,
  modalityTopic,
  needQuestion,
  preferenceNotedPrefix,
  preferenceReply,
  processReply,
  promoSentence,
  promptRules,
  relanceText,
  safeGaillardText,
  serviceOfferedReply,
  technologyReply,
  triedQuestion,
  validatedModality,
  withPreference,
};
