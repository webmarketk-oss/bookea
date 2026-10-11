const { isLeadRefusal } = require("./conversation");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

const REFLECTION =
  /je reflechis|(souhaite|veux|voudrais|prefere|prefererais|vais|dois|aimerais|prefere encore|besoin de|prendre le temps de|prends le temps de) (encore )?(un peu )?(y )?reflechir|laisse[zr]?[- ]moi (le temps de )?(y )?reflechir|reflechir (de mon cote|un peu|encore)|temps de (la )?reflexion|je vais y penser/;
const COME_BACK =
  /je (vous |te )?(reviens|reviendrai|reviendrais) vers|je (vous |te )?recontacte(rai|rais)?\b|je (vous |te )?rappellerai|je reprendrai contact|je (vous |te )?tiens au courant|je (vous |te )?tiendrai au courant/;
const NOT_NOW =
  /pas pour (le moment|l'instant|maintenant|tout de suite)|pour (le moment|l'instant),? (non|pas|je ne)|pas maintenant|pas tout de suite|une autre fois|plus tard|je ne suis pas (encore )?prete?/;
const BOOKING_INTENT =
  /\brdv\b|rendez[- ]vous|creneau|dispo|reserv|j'ai reflechi|je suis (decidee?|partante?|prete?)|on (peut|pourrait) (fixer|caler|prendre)|lundi|mardi|mercredi|jeudi|vendredi|samedi|\d{1,2}\s*h\b|semaine prochaine|demain|apres[- ]?midi|matin|soir|\bheure/;
const RESUME_INTENT =
  /\brdv\b|rendez[- ]vous|creneau|reserv|j'ai reflechi|je suis (decidee?|partante?|prete?)|on (peut|pourrait) (fixer|caler|prendre)|(je peux|je pourrais|je voudrais|je souhaite|j'aimerais|je veux) venir|je suis dispo|(des|vos|une|de la) dispo/;
const OPEN_QUESTION =
  /\?|combien|prix|tarif|c'est quoi|comment (ca|se)|est-ce que|ou (se trouve|etes|est)/;

function isPauseRequest(text) {
  const value = normalize(text);
  if (!value || /j[' ]?ai reflechi/.test(value) || isLeadRefusal(text)) {
    return false;
  }
  if (!REFLECTION.test(value) && !COME_BACK.test(value) && !NOT_NOW.test(value)) {
    return false;
  }
  return !BOOKING_INTENT.test(value.replace(/pas (de )?(rdv|rendez[- ]vous)/g, ""));
}

function hasOpenQuestion(text) {
  return OPEN_QUESTION.test(normalize(text));
}

function resumesBooking(text) {
  return !isPauseRequest(text) && RESUME_INTENT.test(normalize(text));
}

function activeLeadPause(conversation) {
  if (conversation?.leadPause?.at) {
    return conversation.leadPause;
  }
  const leads = (conversation?.messages || []).filter((item) => item.author === "lead");
  for (let index = leads.length - 1; index >= 0; index -= 1) {
    const text = leads[index].text || "";
    if (resumesBooking(text)) {
      return null;
    }
    if (isPauseRequest(text)) {
      return { at: leads[index].at || null, reason: "reflexion", text };
    }
  }
  return null;
}

function pauseReply(conversation, text) {
  const name = displayName(conversation?.firstName);
  const value = normalize(text);
  const who = name ? ` ${name}` : "";
  const take = REFLECTION.test(value)
    ? "prenez le temps de réfléchir"
    : "prenez votre temps";
  return `Bien sûr${who}, ${take} 😊 Nous restons disponibles si vous avez des questions.`;
}

const BOOKING_PUSH =
  /disponibilit|vous etes disponible|vous seriez disponible|dites-moi (un|une|vos|quel|quand)|quel jour|quels jours|quand (seriez|etes|pourriez)|je (peux vous proposer|vous propose|regarde (le planning|un creneau|les creneaux|vos disponibilites))|lequel vous irait|debut ou (en )?fin de semaine|(un|des|vos|le) creneaux?|(prendre|reserver|fixer|caler) (un |le |votre )?(rendez-vous|rdv)|(souhaitez|voulez)[- ]vous (que je|venir|reserver|prendre)|vous voulez que je|on (se )?(cale|fixe)/;

function stripBookingPush(text) {
  const sentences = String(text || "")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const kept = sentences.filter((sentence) => !BOOKING_PUSH.test(normalize(sentence)));
  return kept.join(" ").trim();
}

function pushesBooking(text) {
  return BOOKING_PUSH.test(normalize(text));
}

function withLeadPause(conversation, pause) {
  return {
    ...conversation,
    leadPause: pause,
    welcomeSendAt: null,
    proposedSlots: [],
    bookingState: {
      ...(conversation.bookingState || {}),
      pendingQuestion: "no_slots",
      lastOfferedSlots: [],
    },
  };
}

function displayName(value) {
  const name = String(value || "").trim().split(/\s+/)[0] || "";
  if (!/^[A-Za-zÀ-ÿ'-]{2,}$/.test(name) || /^(bonjour|bonsoir|hello|madame|monsieur)$/i.test(name)) {
    return "";
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const LEAD_CITY =
  /^(?:(?:bonjour|bonsoir|salut|coucou|oui|non|alors|moi)[\s,!.]*)*(?:je\s+suis|j['’]\s?habite|je\s+vis|je\s+r[ée]side|on\s+est|nous\s+sommes|j['’]\s?suis)\s+(?:[àa]|sur|vers|pr[èe]s\s+de|du\s+c[ôo]t[ée]\s+de|dans\s+la\s+r[ée]gion\s+de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]{1,40}?)[\s.!😊🙂]*(?:merci)?[\s.!😊🙂]*$/i;

function leadCityMention(text) {
  const match = String(text || "").trim().match(LEAD_CITY);
  return match ? match[1].trim() : "";
}

function cityFromAddress(address) {
  const value = String(address || "").trim();
  const afterPostal = value.match(/\b\d{5}\s*,?\s*([^,\d][^,]*)$/);
  if (afterPostal) {
    return afterPostal[1].trim();
  }
  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return parts.length > 1 && !/\d/.test(last) ? last : "";
}

function sameCity(a, b) {
  const left = normalize(a).replace(/[-\s]+/g, " ");
  const right = normalize(b).replace(/[-\s]+/g, " ");
  return Boolean(left && right) && (left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `));
}

function locationCheckReply(centerCity, leadCity) {
  return `Notre centre est situé à ${centerCity} 😊 Est-ce que vous souhaitiez un centre à ${leadCity} ?`;
}

function confirmsOtherCity(text, leadCity) {
  const value = normalize(text);
  return (
    /^(oui|ouais|exact|exactement|voila|c'est ca|oui c'est ca|plutot oui|oui plutot|oui svp|oui s'il vous plait)\b/.test(value) ||
    (leadCity && value.includes(normalize(leadCity)) && !/^non\b/.test(value))
  );
}

function otherCityReply(centerCity) {
  return `D’accord, merci de me l’avoir précisé 😊 Notre centre se trouve à ${centerCity}. Si ${centerCity} vous convient, nous restons disponibles pour répondre à vos questions.`;
}

module.exports = {
  activeLeadPause,
  cityFromAddress,
  confirmsOtherCity,
  hasOpenQuestion,
  isPauseRequest,
  leadCityMention,
  locationCheckReply,
  otherCityReply,
  pauseReply,
  pushesBooking,
  resumesBooking,
  sameCity,
  stripBookingPush,
  withLeadPause,
};
