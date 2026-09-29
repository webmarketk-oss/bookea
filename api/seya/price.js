const SESSION_POLICIES = ["fixed", "from", "range", "after_bilan", "callback"];

function emptyPricePolicy() {
  return {
    bilan: "",
    discovery: "",
    session: "",
    package: "",
    sessionPolicy: "after_bilan",
  };
}

function normalizePricePolicy(value, fallbackPrice = "") {
  const current = value && typeof value === "object" ? value : {};
  const legacy = String(fallbackPrice || current.price || "").trim();
  const policy = {
    bilan: String(current.bilan || "").trim(),
    discovery: String(current.discovery || "").trim(),
    session: String(current.session || "").trim(),
    package: String(current.package || "").trim(),
    sessionPolicy: SESSION_POLICIES.includes(current.sessionPolicy)
      ? current.sessionPolicy
      : inferSessionPolicy(current, legacy),
  };
  if (!policy.bilan && /bilan/.test(legacy) && /gratuit|offert/i.test(legacy)) {
    policy.bilan = "offert";
  }
  if (!policy.discovery && /decouverte|découverte/.test(legacy) && /gratuit|offert/i.test(legacy)) {
    policy.discovery = "offerte";
  }
  if (!policy.package && /500/.test(legacy)) {
    policy.package = "à partir de 500€, payable jusqu’en 10 fois";
  }
  if (!policy.session && looksLikeSessionTariff(legacy)) {
    policy.session = legacy;
  }
  return policy;
}

function inferSessionPolicy(current, legacy) {
  const session = String(current?.session || "").trim();
  if (current?.sessionPolicy && SESSION_POLICIES.includes(current.sessionPolicy)) {
    return current.sessionPolicy;
  }
  if (/conseill|rappel/i.test(session || legacy)) return "callback";
  if (/entre |fourchette| et \d/i.test(session)) return "range";
  if (/à partir|a partir|dès /i.test(session)) return "from";
  if (/\d+\s*€/.test(session) && !/selon|depend|dépend|bilan/i.test(session)) {
    return "fixed";
  }
  return "after_bilan";
}

function looksLikeSessionTariff(value) {
  return (
    /\d+\s*€/.test(value) &&
    /seance|séance|seance suivante|à partir|fourchette/i.test(value) &&
    !/bilan et la séance découverte sont offerts/i.test(value)
  );
}

function classifyPriceQuestion(text) {
  const value = normalize(text);
  if (!value) {
    return "";
  }
  if (isPriceRepeatComplaint(text)) {
    return "repeat_complaint";
  }
  if (/combien de (temps|seance|seances|rdv|fois|jours)/.test(value)) {
    return "";
  }
  const asks =
    /prix|tarif|coute|cout|combien|gratuit|offert/.test(value);
  if (/forfait|cure|pack/.test(value) && asks) {
    return "package";
  }
  if (
    (/continuer|ensuite|apres|suivant|poursuiv/.test(value) ||
      /les seances|seances suivantes|autre seance/.test(value)) &&
    asks
  ) {
    return "next_session";
  }
  if (/decouverte/.test(value) && asks) {
    return "discovery";
  }
  if (/bilan/.test(value) && asks) {
    return "bilan";
  }
  if (asksPrice(text)) {
    return "generic";
  }
  return "";
}

function isPriceRepeatComplaint(text) {
  const value = normalize(text);
  return /pourquoi.*(repet|meme chose)|tu (repetes|rabaches)|deja (dit|repondu)|tu dis (toujours )?la meme/.test(
    value,
  );
}

function asksPrice(text) {
  const raw = String(text || "");
  if (/combien de (temps|seance|seances|rdv|fois|jours)/i.test(raw)) {
    return false;
  }
  return /prix|tarif|co[uû]te|\bcout\b|donne le prix|c['’ ]?est combien|combien (coute|le bilan|les seances)/i.test(
    raw,
  );
}

function resolvePricePolicy(seya, conversation) {
  const briefs = Array.isArray(seya?.treatmentBriefs) ? seya.treatmentBriefs : [];
  const needle = normalize(
    `${conversation?.qualification?.need || ""} ${conversation?.treatment || ""} ${conversation?.bookingState?.serviceIntent || ""}`,
  );
  const brief =
    briefs.find((item) => needle && normalize(item?.name).includes(needle)) ||
    briefs.find((item) => needle && needle.includes(normalize(item?.name))) ||
    briefs.find((item) =>
      /minceur|cryo|ventre|poids/.test(needle)
        ? /minceur|cryo/i.test(item?.name || "")
        : false,
    );
  const policy = overlayOfferPricing(
    normalizePricePolicy(brief?.pricing, brief?.price),
    seya,
    conversation,
  );
  if (shouldIgnoreLeakedOfferedDefault(seya, conversation, policy)) {
    return overlayOfferPricing(emptyPricePolicy(), seya, conversation);
  }
  return policy;
}

function matchOfferMap(seya, conversation) {
  const maps = Array.isArray(seya?.offerMaps) ? seya.offerMaps : [];
  const hay = normalize(
    `${conversation?.campaign || ""} ${conversation?.treatment || ""} ${conversation?.offerLabel || ""}`,
  );
  if (!hay) {
    return null;
  }
  return (
    maps.find((item) => {
      const match = normalize(item?.match);
      return match.length > 1 && hay.includes(match);
    }) || null
  );
}

function priceFromOfferText(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  const euro = raw.match(/(\d+)\s*€/);
  if (euro) {
    return { amount: `${euro[1]}€`, free: false };
  }
  if (/offert|offerte|gratuit/i.test(raw)) {
    return { amount: "", free: true };
  }
  return null;
}

function overlayOfferPricing(policy, seya, conversation) {
  const matched = matchOfferMap(seya, conversation);
  const offer =
    priceFromOfferText(matched?.label) ||
    priceFromOfferText(conversation?.offerLabel) ||
    priceFromOfferText(conversation?.campaign);
  if (!offer) {
    return policy;
  }
  if (offer.free) {
    return {
      ...policy,
      bilan: policy.bilan || "offert",
      discovery: policy.discovery || "offerte",
    };
  }
  return {
    ...policy,
    bilan: offer.amount,
    discovery: offer.amount,
  };
}

function hasPaidOfferMaps(seya) {
  return (Array.isArray(seya?.offerMaps) ? seya.offerMaps : []).some(
    (item) => /\d+\s*€/.test(String(item?.label || "")) && !/offert|gratuit/i.test(String(item?.label || "")),
  );
}

function isDefaultOfferedPolicy(policy) {
  return (
    isFree(policy.bilan) &&
    (isFree(policy.discovery) || !policy.discovery) &&
    /500/.test(policy.package || "")
  );
}

function shouldIgnoreLeakedOfferedDefault(seya, conversation, policy) {
  if (!hasPaidOfferMaps(seya) || matchOfferMap(seya, conversation)) {
    return false;
  }
  return isFree(policy.bilan) || isDefaultOfferedPolicy(policy);
}

function unknownPriceReply() {
  return "Je n’ai pas ce tarif en fiche pour ce centre. Je peux demander à l’équipe.";
}

function priceReplyForIntent(intent, policy, options = {}) {
  const target = intent === "repeat_complaint" ? options.previousIntent || "next_session" : intent;
  if (target === "next_session") {
    return nextSessionReply(policy);
  }
  if (target === "package") {
    return packageReply(policy);
  }
  if (target === "discovery") {
    return discoveryReply(policy);
  }
  if (target === "bilan") {
    return bilanReply(policy);
  }
  return genericPriceReply(policy);
}

function bilanReply(policy) {
  if (!policy.bilan) {
    return unknownPriceReply();
  }
  if (isFree(policy.bilan)) {
    return "Le bilan est offert. On y fait une analyse corporelle pour établir le protocole.";
  }
  return `Le bilan est à ${policy.bilan}.`;
}

function discoveryReply(policy) {
  if (!policy.discovery) {
    return unknownPriceReply();
  }
  if (isFree(policy.discovery)) {
    return "La séance découverte est offerte.";
  }
  return `La séance découverte est à ${policy.discovery}.`;
}

function nextSessionReply(policy) {
  if (policy.session && ["fixed", "from", "range"].includes(policy.sessionPolicy)) {
    return `${announceSession(policy)} Le protocole exact se précise après l’analyse corporelle.`;
  }
  if (policy.sessionPolicy === "callback") {
    return "Je comprends, vous souhaitez connaître le prix des séances si vous poursuivez après la découverte. Je n’ai pas de tarif à annoncer ici : une conseillère du centre peut vous donner une fourchette. Je peux lui demander de vous rappeler.";
  }
  if (policy.package) {
    return `Je n’ai pas de tarif fixe à la séance. ${packageSentence(policy.package)} Le détail dépend du protocole proposé après l’analyse corporelle.`;
  }
  return "Vous parlez du tarif des séances après la découverte, c’est bien ça. Il dépend du protocole conseillé après l’analyse corporelle. Je n’ai pas de prix fiable à vous donner avant ce bilan, mais je peux demander au centre s’il peut vous communiquer une fourchette.";
}

function packageReply(policy) {
  if (policy.package) {
    return `${packageSentence(policy.package)} Le devis précis se fait après le bilan.`;
  }
  return "Je n’ai pas de tarif de cure renseigné. Je peux demander au centre de vous donner une fourchette.";
}

function genericPriceReply(policy) {
  const parts = [];
  if (isFree(policy.bilan) || isFree(policy.discovery)) {
    parts.push("Le bilan et la séance découverte sont offerts, c’est gratuit.");
  } else if (policy.bilan || policy.discovery) {
    if (policy.bilan) parts.push(`Le bilan : ${policy.bilan}.`);
    if (policy.discovery) parts.push(`La séance découverte : ${policy.discovery}.`);
  } else if (!policy.session && !policy.package) {
    return unknownPriceReply();
  }
  if (policy.session && ["fixed", "from", "range"].includes(policy.sessionPolicy)) {
    parts.push(announceSession(policy));
  } else {
    parts.push(
      "Le bilan permet de réaliser une analyse corporelle et de vous établir un devis personnalisé en fonction de vos objectifs.",
    );
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function announceSession(policy) {
  const value = policy.session;
  if (policy.sessionPolicy === "from" || /à partir|a partir/i.test(value)) {
    return `Les séances suivantes sont ${/à partir|a partir/i.test(value) ? value : `à partir de ${value}`}.`;
  }
  if (policy.sessionPolicy === "range") {
    return `Les séances suivantes sont ${value}.`;
  }
  return `Les séances suivantes sont à ${value}.`;
}

function packageSentence(value) {
  const text = String(value || "").trim();
  if (/^nos cures|^les cures|^cures/i.test(text)) {
    return text.endsWith(".") ? text : `${text}.`;
  }
  return `Nos cures commencent ${/à partir|a partir/i.test(text) ? text : `à partir de ${text}`}.`.replace(
    /à partir de à partir/i,
    "à partir",
  );
}

function isFree(value) {
  return /offert|gratuit|^0\s*€?$/i.test(String(value || "").trim());
}

function lastSeyaText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function normalizeForCompare(value) {
  return normalize(value)
    .replace(/[«»"'’.,;:!?()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNearDuplicate(draft, previous) {
  const a = normalizeForCompare(draft);
  const b = normalizeForCompare(previous);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (a.includes(b) || b.includes(a)) {
    return a.length > 40 && b.length > 40;
  }
  const wordsA = new Set(a.split(" ").filter((word) => word.length > 3));
  const wordsB = b.split(" ").filter((word) => word.length > 3);
  if (wordsB.length < 6) {
    return false;
  }
  const overlap = wordsB.filter((word) => wordsA.has(word)).length;
  return overlap / wordsB.length >= 0.78;
}

function draftMissesCurrentQuestion(draft, text, conversation) {
  const intent = classifyPriceQuestion(text) || "";
  const previous = lastSeyaText(conversation);
  if (isNearDuplicate(draft, previous)) {
    return true;
  }
  if (intent === "repeat_complaint" && !/vous avez raison|j['’]ai (répondu|repondu|répété|repete)/.test(normalize(draft))) {
    return true;
  }
  if (intent === "next_session" || intent === "repeat_complaint") {
    const repeatsBilan =
      /bilan et la seance decouverte sont offerts|bilan et la séance découverte sont offerts/.test(
        normalize(draft),
      );
    const answersSessions =
      /seances suivantes|apres la decouverte|tarif fixe|prix fiable|fourchette|a partir|à partir|rappeler/.test(
        normalize(draft),
      );
    if (repeatsBilan && !answersSessions) {
      return true;
    }
    if (!answersSessions && !/protocole/.test(normalize(draft))) {
      return true;
    }
  }
  if (intent === "package" && !/cure|forfait|500|fourchette/.test(normalize(draft))) {
    return true;
  }
  return false;
}

function apologyForRepeat(previousIntent) {
  if (previousIntent === "next_session" || !previousIntent) {
    return "Vous avez raison, j’ai répondu à côté. Vous demandiez le prix des séances suivantes, pas celui du bilan. Je vais vérifier si le centre peut vous donner une fourchette avant que vous preniez rendez-vous.";
  }
  if (previousIntent === "package") {
    return "Vous avez raison, je n’avais pas répondu sur le prix de la cure.";
  }
  return "Vous avez raison, j’ai répété une ancienne réponse au lieu de traiter votre question.";
}

function buildPriceReply(text, seya, conversation) {
  const intent = classifyPriceQuestion(text);
  const previousIntent =
    conversation?.bookingState?.unansweredPriceIntent ||
    conversation?.bookingState?.lastPriceIntent ||
    "next_session";
  const policy = resolvePricePolicy(seya, conversation);
  if (intent === "repeat_complaint") {
    if (previousIntent === "next_session" || !previousIntent) {
      return apologyForRepeat(previousIntent);
    }
    return `${apologyForRepeat(previousIntent)} ${priceReplyForIntent(previousIntent, policy)}`;
  }
  if (!intent) {
    return "";
  }
  return priceReplyForIntent(intent, policy, { previousIntent });
}

function enforcePriceReply(draft, text, seya, conversation) {
  const intent = classifyPriceQuestion(text);
  if (!intent && !isPriceRepeatComplaint(text)) {
    return { text: draft, replaced: false };
  }
  if (!draftMissesCurrentQuestion(draft, text, conversation)) {
    return { text: draft, replaced: false };
  }
  const rebuilt = buildPriceReply(text, seya, conversation);
  return { text: rebuilt || draft, replaced: Boolean(rebuilt) };
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

module.exports = {
  SESSION_POLICIES,
  asksPrice,
  buildPriceReply,
  classifyPriceQuestion,
  draftMissesCurrentQuestion,
  emptyPricePolicy,
  enforcePriceReply,
  genericPriceReply,
  isNearDuplicate,
  isPriceRepeatComplaint,
  normalizePricePolicy,
  priceReplyForIntent,
  overlayOfferPricing,
  resolvePricePolicy,
  unknownPriceReply,
};
