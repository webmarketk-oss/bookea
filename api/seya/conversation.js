const { classifyPriceQuestion, isNearDuplicate, isPriceRepeatComplaint } = require("./price");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

function isRereadAsk(text) {
  const value = normalize(text);
  return /relis|re[- ]lis|regarde ce que je (te |vous )?demande|tu (n[' ]as |n[' ]a )?(rien |pas )?compris|essaie de comprendre|comprendre mes questions/.test(
    value,
  );
}

function isOffTopicComplaint(text) {
  const value = normalize(text);
  return (
    isRereadAsk(text) ||
    /c[' ]est quoi le rapport|hors sujet|rien a voir/.test(value)
  );
}

function isIdentityQuestion(text) {
  const value = normalize(text);
  return /tu es (une )?ia|t[' ]es une ia|vous etes (une )?ia|c[' ]est une ia|je parle (a|à) un robot|assistante virtuelle|chatbot|intelligence artificielle/.test(
    value,
  );
}

function compactText(text) {
  return normalize(text)
    .replace(/[.!,;:?…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClockMinutes(text) {
  const value = compactText(text);
  const times = [];
  const pattern = /\b(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\b/g;
  let match = pattern.exec(value);
  while (match) {
    const hour = Number(match[1]);
    const minutes = match[2] != null ? Number(match[2]) : 0;
    if (hour >= 7 && hour <= 20 && minutes >= 0 && minutes <= 59) {
      times.push(hour * 60 + minutes);
    }
    match = pattern.exec(value);
  }
  return times;
}

function isShortYes(text) {
  const value = compactText(text);
  if (!value || value.length > 72) {
    return false;
  }
  return /^(bonjour |hello |salut |coucou )?(oui|ouais|ouai|ok|okay|okey|d'accord|dac|volontiers|avec plaisir|je veux bien|ca me va|ca marche|pourquoi pas|vas y|vas-y|allez y|allez|go|nickel|parfait|super|yes|yep)( (oui|ok|merci|s'il (te|vous) plait|svp|je veux bien|volontiers|avec plaisir|toujours))*$/.test(
    value,
  );
}

function lastSeyaOfferedToBook(conversation) {
  const last = lastSeyaText(conversation);
  if (!last) {
    return false;
  }
  const value = normalize(last);
  return /propose(r)? (un )?(creneau|horaire|rdv)|souhaitez[- ]vous|je (peux |vais )?(vous )?(regarder|proposer)|quel jour|lequel vous (irait|conviendrait)|quand (etes|seriez)|debut de semaine|fin de semaine|je peux vous proposer|autre journee|autre jour|lundi suivant|(l['’])?horaire.*(convient|irait)|convient toujours|pas de disponibilite|je (vous )propose/.test(
    value,
  );
}

function offeredSlots(conversation, extraSlots) {
  const fromConversation = Array.isArray(conversation?.proposedSlots)
    ? conversation.proposedSlots
    : [];
  const fromState = Array.isArray(conversation?.bookingState?.lastOfferedSlots)
    ? conversation.bookingState.lastOfferedSlots
    : [];
  const fromExtra = Array.isArray(extraSlots) ? extraSlots : [];
  return fromConversation.length
    ? fromConversation
    : fromState.length
      ? fromState
      : fromExtra;
}

function isBookingThread(conversation) {
  const state = conversation?.bookingState || {};
  return Boolean(
    (state.lastOfferedSlots || []).length ||
      (conversation?.proposedSlots || []).length ||
      state.requestedDate ||
      state.requestedWeekday != null ||
      state.pendingQuestion === "offer_slots" ||
      conversation?.status === "RDV proposé" ||
      conversation?.status === "RDV pris",
  );
}

function checkingSlotReply() {
  return "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊";
}

function isConfirmingOfferedTime(text, conversation) {
  if (!conversation) {
    return false;
  }
  if (isHesitation(text) || refusesSlots(text) || classifyPriceQuestion(text)) {
    return false;
  }
  const hasOffered = offeredSlots(conversation).length > 0;
  const lastAsked =
    lastSeyaOfferedToBook(conversation) ||
    /convient toujours|horaire vu ensemble/i.test(lastSeyaText(conversation));
  if (!hasOffered && !lastAsked) {
    return false;
  }
  return (
    isShortYes(text) ||
    parseClockMinutes(text).length > 0 ||
    /toujours|ca me convient|ça me convient|c[' ]est bon/i.test(compactText(text))
  );
}

function acceptsBookingOffer(text, conversation) {
  if (!conversation || !isShortYes(text)) {
    return false;
  }
  if (
    isHesitation(text) ||
    refusesSlots(text) ||
    isIdentityQuestion(text) ||
    classifyPriceQuestion(text)
  ) {
    return false;
  }
  if (
    conversation.bookingState?.pendingQuestion === "no_slots" &&
    !lastSeyaOfferedToBook(conversation)
  ) {
    return false;
  }
  return (
    lastSeyaOfferedToBook(conversation) ||
    conversation.bookingState?.pendingQuestion === "offer_slots" ||
    offeredSlots(conversation).length > 0 ||
    conversation.status === "RDV proposé"
  );
}

function isThanks(text, conversation) {
  if (acceptsBookingOffer(text, conversation)) {
    return false;
  }
  const value = compactText(text);
  return /^(merci beaucoup d'avance|merci d'avance|merci beaucoup|super merci|ok merci|c'est gentil|je vous remercie|merci)$/.test(
    value,
  );
}

function isWillCallBack(text) {
  const value = normalize(text);
  return /je (prefere|vais|aimerais) (vous |te )?(re)?contacter|recontacter moi[- ]meme|c[' ]est moi qui (vous |te )?(re)?contacte|je (vous|te) (re)?contacterai|je (vous|te) rappellerai|je prefere (rappeler|vous rappeler)/.test(
    value,
  );
}

function isAwayForNow(text) {
  const value = normalize(text);
  return (
    isWillCallBack(text) ||
    /pas sur place|pour l[' ]instant pas|je (ne )?suis pas (la|sur place)/.test(value)
  );
}

function weekHalfFromText(text) {
  const value = normalize(text);
  if (/debut de semaine|en debut|plutot (le )?debut/.test(value)) {
    return "start";
  }
  if (/fin de semaine|en fin|plutot (la )?fin/.test(value)) {
    return "end";
  }
  return "";
}

function greetingForTime(now) {
  const date = now instanceof Date ? now : new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(date).find((part) => part.type === "hour")?.value || 0,
  );
  return hour >= 18 ? "une bonne soirée" : "une belle journée";
}

function willCallBackReply(now) {
  return `D’accord, aucun souci, je vous laisse revenir vers nous quand ça sera le moment pour vous. Je vous souhaite ${greetingForTime(now)} :)`;
}

function isHesitation(text) {
  const value = normalize(text);
  return (
    isAwayForNow(text) ||
    /je (reflechis|vais reflechir)|pas maintenant|on verra|je sais pas encore|je ne sais pas encore|pas sure|pas certain|plus tard|je vais voir|laisse[- ]moi|je (reviendrai|reviens) vers|je (te|vous) (recontacte|reviendrai)|on se reparle|je te (dis|tiens)/.test(
      value,
    )
  );
}

function refusesSlots(text) {
  const value = normalize(text);
  return /arr[eê]te.*(creneau|horaire|rdv)|pas (de |les )creneaux|plus de creneaux|on verra pour le rdv|pas de rdv pour l[' ]instant/.test(
    value,
  );
}

function wantsSlots(text, conversation) {
  if (acceptsBookingOffer(text, conversation)) {
    return true;
  }
  if (isRereadAsk(text) && isBookingThread(conversation)) {
    return true;
  }
  if (parseClockMinutes(text).length && offeredSlots(conversation).length) {
    return true;
  }
  const value = normalize(text);
  if (
    isIdentityQuestion(text) ||
    isThanks(text, conversation) ||
    isHesitation(text) ||
    refusesSlots(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    (isOffTopicComplaint(text) && !isBookingThread(conversation))
  ) {
    return false;
  }
  if (/prix|tarif|combien|adresse|ou (etes|se trouve)|situe/.test(value) && !/dispo|creneau|horaire|\brdv\b/.test(value)) {
    return false;
  }
  if (/ouvert|ouvrez|horaires d[' ]ouverture/.test(value) && !/creneau|\brdv\b|dispo pour/.test(value)) {
    return false;
  }
  if (/^non\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/.test(value)) {
    return true;
  }
  const namesDay =
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd[' ]?hui)\b/.test(
      value,
    );
  const refusedDay = /pas (dispo|disponible) le |pas le |je ne suis pas disponible/.test(value);
  if (weekHalfFromText(text)) {
    return true;
  }
  if (/change de jour|un autre jour|autres? horaires|pas ce jour|d[' ]autres creneaux/.test(value)) {
    return true;
  }
  const asksAgenda =
    /dispo|creneau|horaire|rendez-vous|\brdv\b|de la place|voir les (heures|horaires)|quand (puis-je|je peux) (venir|passer)|un creneau|(tu|vous) (me )?(proposes? quoi|proposes? comme)|propose quoi|t[' ]as (quoi|comme)/.test(
      value,
    );
  return asksAgenda || (namesDay && !refusedDay);
}

function identityReply() {
  return "Je suis SEYA, l’assistante virtuelle du centre. Je peux vous renseigner et organiser votre rendez-vous, et l’équipe peut reprendre la conversation si vous préférez.";
}

function lastSeyaText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function pickFresh(options, conversation) {
  const last = lastSeyaText(conversation);
  return options.find((item) => !isNearDuplicate(item, last)) || options[0];
}

function alreadyTold(conversation, needle) {
  const pattern = new RegExp(needle, "i");
  return (conversation?.messages || []).some(
    (item) => item.author === "seya" && pattern.test(normalize(item.text || "")),
  );
}

function conversationalReply(text, conversation, qualification, now) {
  if (isIdentityQuestion(text)) {
    return identityReply();
  }
  if (isThanks(text, conversation)) {
    return pickFresh(["Avec plaisir.", "Très bien.", "Avec plaisir, à bientôt."], conversation);
  }
  if (isAwayForNow(text) || isWillCallBack(text)) {
    return willCallBackReply(now);
  }
  if (isHesitation(text) || refusesSlots(text)) {
    return pickFresh(
      [
        "Très bien, prenez le temps.",
        "D’accord, on n’avance pas sur un rendez-vous pour l’instant.",
      ],
      conversation,
    );
  }
  const value = normalize(text);
  if (/carte (bleue|bancaire)|\bcb\b|paiement|payer|cheque|especes/.test(value)) {
    return "Oui, le règlement se fait au centre. L’équipe vous indiquera les moyens acceptés sur place.";
  }
  if (/parking|se garer|se garer|ou (je )?me gare/.test(value)) {
    return "Je n’ai pas le détail du parking. Je peux demander à l’équipe et vous le confirmer.";
  }
  if (/homme|pour un homme|les hommes/.test(value)) {
    return "Oui, le centre reçoit aussi les hommes, selon la prestation.";
  }
  if (/copine|amie|accompagn/.test(value)) {
    return "Vous pouvez venir accompagnée. Dites-le simplement à l’accueil le jour J.";
  }
  if (/ouvert/.test(value) && /samedi/.test(value)) {
    return "Oui, le samedi est en général ouvert. Je peux regarder un horaire précis si vous le souhaitez.";
  }
  if (/s[' ]epiler|epilation avant|raser/.test(value)) {
    return "Pour la cryo, on vous précise les consignes au bilan. Pas besoin de tout anticiper maintenant.";
  }
  if (/allaite|allaitement/.test(value)) {
    return "Pour l’allaitement, une personne du centre doit vérifier avant toute séance. Je peux lui transmettre.";
  }
  if (/je me suis trompe|je voulais (plutot |le )?(lundi|mardi|mercredi|jeudi|vendredi|samedi)/.test(value)) {
    return "";
  }
  if (
    /c[' ]est quoi le rapport|essaie de comprendre|tu (n[' ]as pas |n[' ]a pas )?compris|hors sujet|rien a voir/.test(
      value,
    )
  ) {
    return "";
  }
  if (wantsSlots(text, conversation) || isBookingThread(conversation)) {
    return "";
  }

  const zone = qualification?.zone;
  const need = qualification?.need;
  if (!need) {
    return "Vous cherchez plutôt un soin minceur, un soin visage ou une épilation ?";
  }
  if (zone && /cuisse|ventre|jambe|bras|dos|maillot|aisselle|hanche/.test(value)) {
    if (alreadyTold(conversation, "c['’]est note pour")) {
      return "";
    }
    const label = zone.startsWith("cuisse") ? "les cuisses" : `le ${zone}`;
    return `C’est noté pour ${label}. Vous voulez que je vous propose un créneau ?`;
  }
  if (!zone && /minceur|cryo|epilation|laser/i.test(need)) {
    return "C’est noté. Quelle zone souhaitez-vous travailler ?";
  }
  if (/bonjour|hello|salut/.test(value) && /ventre|poids|minceur|mincir/.test(value)) {
    return zone
      ? `C’est noté pour le ${zone}.`
      : "C’est noté pour le ventre.";
  }
  return "";
}

function composeReplies(parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

module.exports = {
  acceptsBookingOffer,
  alreadyTold,
  checkingSlotReply,
  isConfirmingOfferedTime,
  composeReplies,
  conversationalReply,
  identityReply,
  isAwayForNow,
  isBookingThread,
  isWillCallBack,
  isOffTopicComplaint,
  isRereadAsk,
  greetingForTime,
  weekHalfFromText,
  willCallBackReply,
  isHesitation,
  isIdentityQuestion,
  isShortYes,
  isThanks,
  lastSeyaOfferedToBook,
  offeredSlots,
  parseClockMinutes,
  refusesSlots,
  wantsSlots,
};
