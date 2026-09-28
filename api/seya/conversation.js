const { classifyPriceQuestion, isNearDuplicate, isPriceRepeatComplaint } = require("./price");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

function isOffTopicComplaint(text) {
  const value = normalize(text);
  return /c[' ]est quoi le rapport|essaie de comprendre|comprendre mes questions|tu (n[' ]as pas |n[' ]a pas )?compris|hors sujet|rien a voir/.test(
    value,
  );
}

function isIdentityQuestion(text) {
  const value = normalize(text);
  return /tu es (une )?ia|t[' ]es une ia|vous etes (une )?ia|c[' ]est une ia|je parle (a|à) un robot|assistante virtuelle|chatbot|intelligence artificielle/.test(
    value,
  );
}

function isThanks(text) {
  return /^(merci|merci beaucoup|super merci|ok merci|c[' ]est gentil)[\s!.]*$/i.test(
    String(text || "").trim(),
  );
}

function isHesitation(text) {
  const value = normalize(text);
  return /je (reflechis|vais reflechir)|pas maintenant|on verra|je sais pas encore|je ne sais pas encore|pas sure|pas certain|plus tard|je vais voir|laisse[- ]moi|je (reviendrai|reviens) vers|je (te|vous) (recontacte|reviendrai)|on se reparle|je te (dis|tiens)/.test(
    value,
  );
}

function refusesSlots(text) {
  const value = normalize(text);
  return /arr[eê]te.*(creneau|horaire|rdv)|pas (de |les )creneaux|plus de creneaux|on verra pour le rdv|pas de rdv pour l[' ]instant/.test(
    value,
  );
}

function wantsSlots(text) {
  const value = normalize(text);
  if (
    isIdentityQuestion(text) ||
    isThanks(text) ||
    isHesitation(text) ||
    refusesSlots(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    isOffTopicComplaint(text)
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
  const namesDay = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd)\b/.test(value);
  const refusedDay = /pas (dispo|disponible) le |pas le |je ne suis pas disponible/.test(value);
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

function conversationalReply(text, conversation, qualification) {
  if (isIdentityQuestion(text)) {
    return identityReply();
  }
  if (isThanks(text)) {
    return pickFresh(["Avec plaisir.", "Je reste disponible si besoin.", "Très bien."], conversation);
  }
  if (isHesitation(text) || refusesSlots(text)) {
    return pickFresh(
      [
        "Très bien, prenez le temps. Je reste là si une question vous vient.",
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
  if (wantsSlots(text)) {
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
  alreadyTold,
  composeReplies,
  conversationalReply,
  identityReply,
  isOffTopicComplaint,
  isHesitation,
  isIdentityQuestion,
  isThanks,
  refusesSlots,
  wantsSlots,
};
