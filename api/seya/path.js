const { canBookSeya, isQualifyCallback } = require("./mission");
const { resolvePricePolicy } = require("./price");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

/** Objectif configuré du centre : A réservation Bookea, B rappel expert, sinon accueil seul. */
function pathGoal(seya) {
  if (canBookSeya(seya)) {
    return "book";
  }
  if (isQualifyCallback(seya)) {
    return "callback";
  }
  return "none";
}

const FAMILY_WORDS = {
  minceur: { expert: "un expert ou une experte minceur", visit: "bilan", offer: "bilan minceur" },
  epilation: { expert: "un expert ou une experte en épilation", visit: "bilan", offer: "bilan pilaire" },
  visage: { expert: "un expert ou une experte en soins visage", visit: "diagnostic", offer: "diagnostic visage" },
};

function familyWords(family) {
  return FAMILY_WORDS[family] || { expert: "un expert ou une experte du centre", visit: "rendez-vous", offer: "" };
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

// Offre réelle du centre (fiche prestation / offre de campagne), jamais inventée.
function offerLine(seya, conversation, family) {
  const words = familyWords(family);
  if (!words.offer) {
    return "";
  }
  const bilan = String(resolvePricePolicy(seya, conversation)?.bilan || "").trim();
  if (/offert|gratuit|^0\s*€?$/i.test(bilan)) {
    return `Le ${words.offer} est offert.`;
  }
  if (/\d+\s*€/.test(bilan)) {
    return `Le ${words.offer} est à ${bilan.match(/\d+(?:[.,]\d+)?\s*€/)[0]}.`;
  }
  return "";
}

function bilanLine(family) {
  if (family === "visage") {
    return "Le diagnostic permettra d’évaluer les besoins de votre peau et de vous présenter les solutions adaptées.";
  }
  if (family === "epilation") {
    return "Le bilan permettra d’évaluer vos besoins et de vous présenter la solution adaptée.";
  }
  return "Le bilan permettra d’évaluer vos besoins et de vous présenter les solutions adaptées.";
}

function bookQuestion(family) {
  return `Quand seriez-vous disponible pour le ${familyWords(family).visit} ?`;
}

function callbackQuestion(family) {
  const words = familyWords(family);
  return `Souhaitez-vous qu’${words.expert} du centre vous rappelle pour échanger sur votre besoin et organiser votre ${words.visit} ?`;
}

/** Étape 2 + 3 : transition sur le besoin, explication du bilan, puis l’action de l’objectif. */
function pathStepReply({ goal, family, seya, conversation, withOffer = true }) {
  const offer = withOffer ? offerLine(seya, conversation, family) : "";
  if (goal === "book") {
    if (family === "minceur") {
      return [
        offer,
        "Nous pourrons faire le point sur votre objectif lors du bilan et vous présenter les solutions adaptées 😊 Quand seriez-vous disponible ?",
      ]
        .filter(Boolean)
        .join(" ");
    }
    return [offer, bilanLine(family), bookQuestion(family)].filter(Boolean).join(" ");
  }
  if (goal === "callback") {
    return [offer, bilanLine(family), callbackQuestion(family)].filter(Boolean).join(" ");
  }
  return [offer, bilanLine(family)].filter(Boolean).join(" ");
}

/** Reprise courte après une question du prospect, sans recommencer le parcours. */
function resumeQuestion(goal, family) {
  if (goal === "book") {
    return bookQuestion(family);
  }
  if (goal === "callback") {
    const words = familyWords(family);
    return `Souhaitez-vous qu’${words.expert} du centre vous rappelle pour organiser votre ${words.visit} ?`;
  }
  return "";
}

/** Rappel sans question, quand l’étape vient déjà d’être proposée. */
function softResumeLine(goal, family) {
  const words = familyWords(family);
  if (goal === "book") {
    return `Quand vous le souhaitez, indiquez-moi vos disponibilités pour le ${words.visit} et je regarde les créneaux.`;
  }
  if (goal === "callback") {
    return `Si vous le souhaitez, ${words.expert} du centre peut vous rappeler pour en parler.`;
  }
  return "";
}

function slotsReminder(count) {
  return count > 1
    ? "Dites-moi si l’un des créneaux proposés vous convient."
    : "Dites-moi si le créneau proposé vous convient.";
}

const SOFT_RESUME =
  /indiquez-moi vos disponibilites pour le|du centre peut vous rappeler pour en parler|creneaux? proposes? vous convient/;

function softResumed(text) {
  return SOFT_RESUME.test(normalize(text));
}

const STEP_ASKED =
  /quand seriez-vous disponible|du centre vous rappelle pour|(bilan|diagnostic) permettra d'evaluer/;
const CALLBACK_OFFERED = /du centre vous rappelle pour/;

function stepAsked(text) {
  return STEP_ASKED.test(normalize(text));
}

function offersCallback(text) {
  return CALLBACK_OFFERED.test(normalize(text));
}

function callbackTransmittedReply(family, preference, now) {
  const words = familyWords(family);
  const date = now instanceof Date ? now : new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false })
      .formatToParts(date)
      .find((part) => part.type === "hour")?.value || 0,
  );
  const withPreference = preference ? `, avec votre préférence (${preference})` : "";
  return `Avec plaisir 😊 Votre demande a été transmise à l’équipe${withPreference}. ${capitalize(words.expert)} du centre vous recontactera pour échanger avec vous et organiser votre ${words.visit}. ${hour >= 18 ? "Bonne soirée !" : "Bonne journée !"}`;
}

/** Objectif B seulement : le prospect demande un rendez-vous, l’équipe l’organise. */
function teamOrganisesReply(family, preference) {
  const words = familyWords(family);
  const noted = preference ? ` Je note votre préférence (${preference}).` : "";
  return `C’est l’équipe du centre qui organise le ${words.visit}.${noted} Souhaitez-vous qu’${words.expert} du centre vous rappelle pour le convenir avec vous ?`;
}

module.exports = {
  callbackQuestion,
  callbackTransmittedReply,
  familyWords,
  offerLine,
  offersCallback,
  pathGoal,
  pathStepReply,
  resumeQuestion,
  slotsReminder,
  softResumeLine,
  softResumed,
  stepAsked,
  teamOrganisesReply,
};
