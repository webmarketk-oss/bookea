const { findFacts } = require("./brief-facts");
const knowledge = require("./center-knowledge");

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
    return "Avec plaisir 😊 Je reste disponible si vous souhaitez une précision sur le parcours minceur, les appareils, l’alimentation ou le bilan.";
  }
  return "Avec plaisir 😊 Je reste disponible si vous souhaitez une précision sur le soin.";
}

/** Acceptation explicite du bilan / rappel — pas un simple intérêt (« ça peut faire du bien »). */
function acceptsContinue(text) {
  const value = normalize(text);
  if (!value || value.length > 180) {
    return false;
  }
  return (
    /^(oui|ok|okay|d'accord|dac|volontiers|avec plaisir|je veux|je suis interes|pourquoi pas)\b/.test(
      value,
    ) ||
    /\b(continuer|la suite|le bilan|ca m'interesse|ça m'intéresse|je continue|go)\b/.test(value) ||
    /je (vais|veux) (bien )?(faire |venir )?(pour )?(le |la |l')?(bilan|seance|decouverte)/.test(
      value,
    ) ||
    /(seance|bilan) (gratuit|offert)/.test(value)
  );
}

/** Intérêt soft, sans accord de rappel. */
function expressesInterest(text) {
  const value = normalize(text);
  return (
    /ca (peut|pourrait) (me )?faire du bien|faire du bien (autre chose|aussi)|peut[- ]etre que ca (peut|pourrait)|pourquoi pas (essayer|venir)/.test(
      value,
    ) && !acceptsContinue(text)
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

const SAFE_MINCEUR_PATH = "Le bilan et la séance découverte sont offerts.";
const PATH_FLUFF = /approche globale|technologies avancees|selon vos besoins/;

/** Accompagnement minceur de la fiche (rééquilibrage, application), une phrase, sans consigne. */
function minceurPathFacts(sources = [], pricing = {}) {
  const support = findFacts(
    sources,
    /reequilibrage|application|appli/,
    1,
  ).filter((fact) => !leaksInternalBrief(fact) && !PATH_FLUFF.test(normalize(fact)));
  if (support.length) {
    return support[0];
  }
  if (/offert|gratuit/i.test(`${pricing?.bilan || ""} ${pricing?.discovery || ""}`)) {
    return SAFE_MINCEUR_PATH;
  }
  return SAFE_MINCEUR_PATH;
}

/** Faits de la fiche sur le sujet précis de la question (application, compléments, alimentation). */
function supportTopicFacts(text, sources = []) {
  const value = normalize(text);
  const topic = SUPPORT_TOPICS.find((pattern) => pattern.test(value));
  return topic
    ? findFacts(sources, topic, 2)
        .filter((fact) => !leaksInternalBrief(fact))
        .join(" ")
    : "";
}

/** Après la question régimes : une phrase courte, jamais la fiche ni les consignes. */
function minceurPathReply(sources = [], pricing = {}) {
  return [SAFE_MINCEUR_PATH, pathQuestion()].filter(Boolean).join(" ");
}

/** Refus explicite de poursuivre l’échange, quelle que soit la question posée. */
function refusesToContinue(text) {
  const value = normalize(text);
  return (
    value.length <= 140 &&
    /je ne (veux|souhaite) pas (continuer|aller plus loin|repondre|de bilan|le bilan|etre rappelee?|etre appelee?)|pas envie de (continuer|repondre)|je ne suis pas interess|je prefere (en rester la|arreter)|ne (me )?(rappelez|appelez) pas|ne pas (me )?(rappeler|appeler)|pas (de|d') ?(rappel|appel)/.test(
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
  return knowledge.TEAM_QUESTION_REPLY;
}

function identityReply() {
  return `Je suis Seya, l’assistante virtuelle du centre ${GAILLARD_NAME} 😊 Je recueille les informations sur votre demande, puis un expert ou une experte du centre vous rappelle pour vous accompagner.`;
}

function promoSentence() {
  return "Des promotions sont régulièrement proposées : les offres et conditions applicables sont à voir au centre.";
}

function missingPriceReply() {
  return "Je n’ai pas encore le tarif de cette zone : l’équipe pourra vous le confirmer.";
}

function asksSessionCount(text) {
  return /combien de seances|nombre de seances|nb de seances|faut[- ]il .{0,20}seances|ca (prend|fait) combien de seances/.test(
    normalize(text),
  );
}

function asksPermanence(text) {
  const value = normalize(text);
  return (
    /a vie|c[' ]est (pour )?(la vie|toujours)|les poils (reviennent|repartent)|resultat (permanent|definitif)|c[' ]est definitif/.test(
      value,
    )
  );
}

function sessionCountReply(family, sources = []) {
  const hay = normalize(sources.filter(Boolean).join(" "));
  if (family === "epilation" && /8 seances/.test(hay)) {
    return "Le forfait comprend 8 séances : 6 séances + 2 séances d’entretien.";
  }
  if (family === "epilation") {
    return "Le nombre de séances se précise au bilan pilaire, selon la zone et la pilosité.";
  }
  return "";
}

function permanenceReply(family) {
  if (family === "epilation") {
    return "C’est une épilation définitive : le protocole se précise au bilan pilaire, offert avec le test laser.";
  }
  return "";
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
  // « maintenant » seul (ex. « maintenant j'aimerais bien ») n'est pas une demande de créneau.
  return (
    /prendre (un )?rdv|prendre (un )?rendez|reserver|je (peux|puis) (pas )?(prendre|venir)|tout de suite|bloquer (un )?(creneau|rdv)/.test(
      value,
    ) &&
    (/rdv|rendez|creneau|venir|reserver|bloquer/.test(value) || /\?/.test(String(text || "")))
  );
}

function asksDiscoveryFree(text) {
  const value = normalize(text);
  if (/ensuite|apres|suivant|forfait|cure|pack/.test(value)) {
    return false;
  }
  return (
    /(1[eè]?re|premiere|1ere|1iere) seance/.test(value) ||
    ((/seance|essai|decouverte|bilan/.test(value)) && /gratuit|offert/.test(value))
  );
}

function asksTrialWhen(text) {
  const value = normalize(text);
  return (
    /(essai|essaie|essayer|decouverte).{0,28}(\bquand\b|\bqd\b|dispo|disponible)/.test(value) ||
    /(\bquand\b|\bqd\b).{0,28}(essai|essayer|decouverte|venir|seance)/.test(value)
  );
}

function discoveryOfferedReply(pricing = {}, offer = "") {
  const hay = `${pricing?.bilan || ""} ${pricing?.discovery || ""} ${offer}`;
  if (!/offert|gratuit|d[ée]couverte/i.test(hay)) {
    return "";
  }
  return "Oui, le bilan et la séance découverte d’environ 20 minutes sont offerts.";
}

function trialWhenReply(pricing = {}, offer = "") {
  const known =
    discoveryOfferedReply(pricing, offer) ||
    "Le bilan et la séance découverte d’environ 20 minutes sont offerts.";
  return `${known} Je ne fixe pas les horaires : un expert ou une experte du centre vous rappelle pour organiser l’essai.`;
}

function asksWhiteHairLaser(text) {
  const value = normalize(text);
  return (
    /(cheveux|poils?) (blancs?|gris|blonds?|roux)/.test(value) ||
    /(blancs?|gris|blonds?|roux).{0,40}(cheveux|poils?|laser)/.test(value)
  );
}

/** Si la cliente dit « cheveux » : clarifier avant d’expliquer (souvent des poils de la zone). */
function whiteHairLaserReply(text = "", zone = "") {
  const value = normalize(text);
  if (/\bcheveux\b/.test(value) && !/\bpoils?\b/.test(value)) {
    const where = String(zone || "").trim();
    return where
      ? `Vous parlez des poils blancs sur la zone ${where} que vous souhaitez traiter ?`
      : "Vous parlez des poils blancs sur la zone que vous souhaitez traiter ?";
  }
  return "Le laser agit sur la mélanine du poil : il est peu ou pas efficace sur les poils blancs, gris, blonds très clairs ou roux. L’équipe pourra vous confirmer la meilleure option lors du bilan.";
}

function asksLanguageHelp(text) {
  const value = normalize(text);
  return (
    /ne (comprends?|parle) pas (beaucoup |tres |très |bien )?(le )?francais/.test(value) ||
    /i (don't|do not) (speak|understand) (much |good )?french/.test(value) ||
    /speak (in )?english|parler (en )?anglais/.test(value)
  );
}

function languageBarrierReply() {
  return "D’accord 😊 Quelle langue préférez-vous ?";
}

function isIndecisive(text) {
  const value = normalize(text);
  return (
    /me decider|m'en decider|j'hesite|je (suis|reste) (encore )?hesitan|pas (trop |vraiment )?(decide|sure|certain)|n'arrive pas (trop )?a (me )?decid/.test(
      value,
    )
  );
}

function noteAfterHandoffReply(text = "", conversation = {}) {
  const value = normalize(text);
  const known = normalize(
    `${conversation?.teamNotes?.need || ""} ${conversation?.qualification?.detail || ""} ${conversation?.qualification?.zone || ""}`,
  );
  if (/ferme|fermete|rafferm/.test(value) && /ovale/.test(known)) {
    return "C’est noté 😊 Vous souhaitez surtout raffermir l’ovale de votre visage. Je complète les informations pour l’équipe.";
  }
  if (/ferme|fermete|rafferm/.test(value)) {
    return "C’est noté 😊 Je note la fermeté pour l’équipe.";
  }
  return "C’est noté pour l’équipe 😊 Elle en tiendra compte lors de votre échange.";
}

/** Hésitation : clarifier, sans pousser au rappel ni inventer « sans engagement ». */
function hesitationClarifyReply() {
  return "Qu’est-ce qui vous fait hésiter le plus : le choix du soin, les résultats attendus ou le budget ?";
}

/** RDV dans une autre clinique pour comparer — pas une demande Gaillard. */
function mentionsOtherClinicVisit(text) {
  const value = normalize(text);
  return (
    /rendez[- ]?vous dans (un[e]? )*(autre )?(clinique|centre|institut)/.test(value) ||
    /j['’ ]ai rendez[- ]?vous (dans|chez|a) (un[e]? )*(clinique|centre|institut)/.test(value) ||
    /(clinique|institut).{0,60}(soins? esthetiques?|voir ce que|comparer)/.test(value)
  );
}

function otherClinicCompareReply() {
  return "Je comprends, vous souhaitez comparer les possibilités avant de choisir.";
}

function describesBloating(text) {
  return /gonfl|ballonn/.test(normalize(text));
}

function bloatingNotedReply() {
  return "Vous décrivez surtout un ventre gonflé. Les soins minceur ne permettent pas de déterminer la cause de ce gonflement ; il faudra le signaler lors du bilan.";
}

function asksDeviceCompare(text) {
  const value = normalize(text).replace(/\blgp\b/g, "lpg");
  return (
    /difference.*(lpg|cryo|cryolipolyse|cryotherap|radiofrequ)/.test(value) ||
    /(lpg|cryo|cryolipolyse|cryotherap).{0,50}(lpg|cryo|cryolipolyse|cryotherap|radiofrequ)/.test(value) ||
    /je regarde la difference|comparer (le |la |l')?(lpg|cryo)/.test(value)
  );
}

function deviceCompareReply(text, sources = []) {
  const value = normalize(text).replace(/\blgp\b/g, "lpg");
  const hay = normalize(sources.filter(Boolean).join(" "));
  const hasCryo = /cryo|cryolipolyse|cryotherap/.test(hay);
  const hasLpg = /\blpg\b|endermolog/.test(hay);
  if (/lpg/.test(value) && /cryo|cryolipolyse|cryotherap/.test(value)) {
    const cryoBit =
      "La cryo, c’est une bio-destruction des graisses locales par le froid.";
    if (hasCryo && !hasLpg) {
      return `${cryoBit} Au centre, la cryo figure parmi les technologies proposées ; le LPG n’est pas renseigné dans la fiche. Le bilan permet de voir ce qui convient à votre cas. Vous souhaitez surtout comparer pour le ventre, c’est bien cela ?`;
    }
    if (hasCryo && hasLpg) {
      return `${cryoBit} Les deux figurent parmi les approches du centre ; le bilan précise ce qui convient à votre objectif. Vous souhaitez surtout comparer pour le ventre, c’est bien cela ?`;
    }
    return `${cryoBit} Vous souhaitez comparer le LPG et la cryo pour le ventre, c’est bien cela ?`;
  }
  return "";
}

function cryoPriceUnknownReply() {
  return "Je n’ai pas le tarif précis d’une séance de cryolipolyse dans les informations du centre. Le bilan et la séance découverte sont offerts ; le prix du protocole est précisé après le bilan.";
}

function triedObjectifAckReply(family) {
  if (family === "minceur") {
    return "Oui, vous souhaitez réduire la graisse sur ces zones 😊 Avez-vous déjà essayé des soins pour cela ?";
  }
  if (family === "visage") {
    return "D’accord, je note cet objectif 😊 Avez-vous déjà testé des soins pour votre peau ?";
  }
  return "D’accord, je note 😊 Avez-vous déjà testé une solution d’épilation définitive, comme le laser ou la lumière pulsée ?";
}

function noteTriedMethodsReply(text) {
  const value = normalize(text);
  const bits = [];
  if (/reequilibrage|aliment|nutrition|regime/.test(value)) {
    bits.push("le rééquilibrage alimentaire");
  }
  if (/drainage/.test(value)) {
    const sessions = value.match(/(\d+)\s*seances?/);
    bits.push(
      sessions ? `les ${sessions[1]} séances de drainage` : "le drainage lymphatique",
    );
  }
  if (!bits.length) {
    return "";
  }
  return `D’accord, je note ${bits.join(" et ")}.`;
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
  return knowledge.TEAM_QUESTION_REPLY;
}

function technologyReply(text, sources = [], { family, zone } = {}) {
  if (/lumiere pulsee|\bipl\b/.test(normalize(text))) {
    const pulsed = findFacts(sources, /lumiere pulsee|\bipl\b/, 1)[0];
    if (pulsed) {
      return pulsed;
    }
    const lasers =
      knowledge.technologyNames(sources, "epilation") ||
      (findFacts(sources, /epilation[^.]*\blaser\b|\blaser\b[^.]*epilation/, 1).length ? "le laser" : "");
    return lasers
      ? `Non, le centre n’utilise pas la lumière pulsée : l’épilation se fait avec ${lasers}.`
      : knowledge.TEAM_QUESTION_REPLY;
  }
  return knowledge.technologyReply({ text, family, zone, sources }) || knowledge.TEAM_QUESTION_REPLY;
}

function childCompanionReply(sources = []) {
  return findFacts(sources, /enfant|bebe/, 1)[0] || knowledge.TEAM_QUESTION_REPLY;
}

function serviceOfferedReply(offered, askedLabel) {
  const label = String(askedLabel || "cette prestation").trim();
  if (offered) {
    return `Oui, nous proposons ${label}.`;
  }
  return `Non, nous ne faisons pas ${label}.`;
}

function missingPracticalReply() {
  return knowledge.TEAM_QUESTION_REPLY;
}

function needQuestion(family, missing = "", zoneLabel = "") {
  if (family === "minceur") {
    if (missing === "objectif") {
      return zoneLabel
        ? `Pour ${zoneLabel}, quel est votre objectif : perdre du poids, des centimètres, affiner ou raffermir ?`
        : "Quel est votre objectif pour ce soin minceur ?";
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
    if (missing === "ovale") {
      return "Que souhaitez-vous surtout pour l’ovale : le raffermir, le redessiner ?";
    }
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
  "Que souhaitez-vous surtout pour l’ovale : le raffermir, le redessiner ?":
    "Pour l’ovale, vous cherchez plutôt à raffermir ou à redessiner ?",
};

/** Si la question objectif (avec zones) se répète, reformuler sans coller au même texte. */
function rephraseObjectifQuestion(question) {
  const asked = String(question || "").trim();
  if (QUESTION_REPHRASED[asked]) {
    return QUESTION_REPHRASED[asked];
  }
  if (/quel est votre objectif\s*:/i.test(asked)) {
    return asked
      .replace(/quel est votre objectif\s*:/i, "que recherchez-vous surtout :")
      .replace(/^Pour /, "Et pour ");
  }
  return asked;
}

/** Évite d’envoyer deux fois de suite exactement la même question. */
function varyQuestion(question, previousSeyaText) {
  const asked = String(question || "").trim();
  if (normalize(asked) !== normalize(previousSeyaText)) {
    return asked;
  }
  return rephraseObjectifQuestion(asked);
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
  return /quel est votre objectif|que recherchez-vous|quelles? zones?|qu['’]est-ce qui vous pr[ée]occupe|aimeriez-vous am[eé]liorer au niveau de votre peau|souhaitez-vous surtout pour l['’ ]ovale|raffermir, le redessiner/i.test(
    lastSeyaQuestion(conversation),
  );
}

/** Question objectif seule (pas la question combinée objectif + zones). */
function lastSeyaAskedObjectif(conversation) {
  const question = lastSeyaQuestion(conversation);
  return (
    /quel est votre objectif|que recherchez-vous/i.test(question) &&
    !/quelles zones|sur quelles zones/i.test(question)
  );
}

function lastSeyaAskedTried(conversation) {
  return /d[ée]j[àa] (test[ée]|essay[ée])/i.test(lastSeyaQuestion(conversation));
}

const STEP_QUESTIONS = [
  /quel est votre objectif|quelles? zones?|qu['’]est-ce qui vous pr[ée]occupe|souhaitez-vous surtout pour l['’ ]ovale|raffermir, le redessiner/i,
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
  if (
    /^(merci( beaucoup)?[, ]*)?(et )?(passez une )?(tres )?(bonne|bon) apres[- ]?midi( a vous| a toute)?[.! ]*$/.test(
      value,
    )
  ) {
    return false;
  }
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

function withPreference(conversation, text, at, context) {
  const notes = conversation?.teamNotes || {};
  const preferences = Array.isArray(notes.preferences) ? notes.preferences : [];
  const spoken = availabilityContext(text);
  const entry = {
    text: String(text || "").trim().slice(0, 200),
    context: spoken === "contexte non précisé" && context ? context : spoken,
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

const BRIEF_LEAK =
  /ne prescris|prescris pas|explique[rz]? que|interdit de|objectif calorique|restriction alimentaire|\bconsignes?\b|(^|[.!?]\s)(tu |toi )|ne (lui|leur) (applique|donne|propose|change|conserve)|applique pas l['']offre|conserve son besoin|besoin minceur initial/;

const GLUED_FRENCH =
  /quelest|votreobjectif|pource |leparcours|comprendun|accompagnementau|alimentaireavec|unsuivi|surune|expliquieque|neprescris/i;

function leaksInternalBrief(text) {
  return BRIEF_LEAK.test(normalize(text));
}

function looksGarbledFrench(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) {
    return false;
  }
  if (GLUED_FRENCH.test(value)) {
    return true;
  }
  const letters = (value.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const spaces = (value.match(/ /g) || []).length;
  return letters > 80 && spaces < letters / 14;
}

function breaksGaillardRules(text) {
  return RULE_BREAK.test(normalize(text)) || leaksInternalBrief(text) || looksGarbledFrench(text);
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
      ? "Parcours minceur : 1) accueil, 2) besoin (objectif + zones ; kilos si perte de poids sans montant), 3) question régimes / solutions déjà testées, 4) proposer le bilan et la séance découverte offerts en une phrase, 5) question ouverte. Interdit de recopier la fiche, les compléments, les appareils ou une consigne interne. Une seule question à la fois. Interdit de clôturer juste après les zones ou juste après « déjà testé »."
      : "Parcours : 1) comprendre le besoin (épilation : zones ; visage : préoccupations), 2) demander s’il a déjà testé une solution, 3) conclure. Une seule question à la fois.",
    `Conclusion, seulement quand le prospect confirme qu’il veut être rappelé / le bilan : « ${closingReply(family)} » Interdit d’annoncer cette conclusion tant que la qualification minceur n’est pas allée jusqu’à la proposition de bilan.`,
    "Tu restes chaleureuse et tu laisses toujours une porte ouverte (question utile). Interdit de fermer le fil avec un simple « je transmets » si le prospect pose encore une question ou dit seulement « oui ».",
    "Si le prospect donne spontanément un jour ou une heure, tu dis seulement que tu transmets sa préférence à l’équipe. Tu ne promets aucun rappel à cette heure, tu ne confirmes aucun rendez-vous, tu ne transformes pas une disponibilité pour venir en disponibilité pour un appel.",
    "Tu dis « un expert ou une experte du centre », jamais « une opératrice ».",
    "Interdit de demander où habite le prospect ou à quelle distance il se trouve, et interdit de proposer un autre centre (Annemasse ou autre). Si on te demande où est le centre, tu donnes uniquement l’adresse fournie plus bas.",
    "Modalités pratiques (tenue, rasage, préparation…) : seulement ce qui est écrit dans la fiche du soin. Sinon, tu dis simplement que tu n’as pas cette précision. Interdit d’inventer, par exemple, qu’on peut garder son pantalon.",
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
  asksDeviceCompare,
  asksDiscoveryFree,
  asksIfAi,
  asksLanguageHelp,
  asksPermanence,
  asksProcess,
  asksSessionCount,
  asksTechnology,
  asksTrialWhen,
  asksWhiteHairLaser,
  availabilityContext,
  availabilityMention,
  bloatingNotedReply,
  bookingCapabilityReply,
  breaksGaillardRules,
  changesStep,
  childCompanionReply,
  closingReply,
  countryReply,
  cryoPriceUnknownReply,
  declinedReply,
  declinesOffer,
  discoveryOfferedReply,
  describesBloating,
  deviceCompareReply,
  durationReply,
  expertLabel,
  expressesInterest,
  healthNotedReply,
  hesitationClarifyReply,
  identityReply,
  isAnswerLike,
  isGaillardCenter,
  isIndecisive,
  keepConversationReply,
  kilosQuestion,
  languageBarrierReply,
  lastSeyaAskedKilos,
  lastSeyaAskedNeed,
  lastSeyaAskedObjectif,
  lastSeyaAskedPath,
  lastSeyaAskedTried,
  leaksInternalBrief,
  looksGarbledFrench,
  looksLikeHandoffClose,
  mentionsOtherClinicVisit,
  minceurPathFacts,
  minceurPathReply,
  missingPracticalReply,
  missingPriceReply,
  modalityReply,
  modalityTopic,
  needQuestion,
  noteAfterHandoffReply,
  noteTriedMethodsReply,
  otherClinicCompareReply,
  pathQuestion,
  permanenceReply,
  preferenceNotedPrefix,
  preferenceReply,
  processReply,
  promoSentence,
  promptRules,
  refusesToContinue,
  relanceText,
  safeGaillardText,
  serviceOfferedReply,
  sessionCountReply,
  supportTopicFacts,
  technologyReply,
  trialWhenReply,
  triedObjectifAckReply,
  triedQuestion,
  validatedModality,
  varyQuestion,
  whiteHairLaserReply,
  withPreference,
};
