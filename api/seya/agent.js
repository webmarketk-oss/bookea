const {
  persistableConversation,
  persistableConversations,
} = require("./conversation-key");
const {
  applyBookingMessage,
  emptyBookingState,
  emptySlotFallback,
  enforceOutgoingText,
  guardSlots,
  markPriceAnswered,
  shouldSearchSlots,
  slotAllowed,
} = require("./booking-state");
const {
  buildPriceReply,
  classifyPriceQuestion,
  enforcePriceReply,
  isNearDuplicate,
  isPriceRepeatComplaint,
  resolvePricePolicy,
  unknownPriceReply,
  asksPrice,
} = require("./price");
const {
  awaitingHealthReply,
  classifyHealthMessage,
  generalHealthReply,
  isAwaitingHealthReview,
  markHealthReviewed,
  personalHealthReply,
  resolveHealthSheet,
  startHealthReview,
  stripBookingCta,
} = require("./health");
const {
  alreadyBookedReply,
  alreadyTold,
  conversationalReply,
  firstNeedReply,
  extractConsultativeFields,
  spokenVisitDuration,
  isAlreadyBookedElsewhere,
  isBookingThread,
  isHesitation,
  isIdentityQuestion,
  isWrongCenter,
  wrongCenterReply,
  crmUpdateFromLeadMessage,
  isLeadRefusal,
  isOffTopicComplaint,
  isCenterAffirmation,
  isRereadAsk,
  isAppointmentConfirmed,
  isConfirmingOfferedTime,
  isShortYes,
  isCourtesyClose,
  isThanks,
  checkingSlotReply,
  lastSeyaOfferedToBook,
  lastSeyaAskedToSearch,
  offeredSlots,
  parseClockMinutes,
  refusesSlots,
  wantsSlots,
  asksOtherDay,
  isWillComeBack,
  isThreadComplaint,
  isServiceAsk,
  askedServiceName,
  asksOpenQuestion,
  isWaitUntilLater,
  isRescheduleAsk,
  wantsNoon,
  threadWantsNoon,
  threadIsPaused,
  withStaffOfferedSlots,
  willCallBackReply,
  slotsFromStaffThread,
  hasDayOfMonthRequest,
  isOutOfZone,
  isWillCallBack,
  asksForCallback,
  closingKind,
  dayPartFromText,
  lastSeyaText,
} = require("./conversation");
const gaillard = require("./gaillard");
const { findFacts } = require("./brief-facts");
const { prospectText } = require("./vocabulary");
const {
  TEAM_QUESTION_MARK,
  TEAM_QUESTION_REPLY,
  TEAM_QUESTION_UNSURE_REPLY,
  asksTechnology,
  bilanPriceConflict,
  checkAgainstCenter,
  isTechnologyFollowUp,
  technologyReply,
  visitDurationsInFacts,
} = require("./center-knowledge");
const {
  callbackTransmittedReply,
  familyWords,
  offersCallback,
  pathGoal,
  resumeQuestion,
  slotsReminder,
  softResumeLine,
  softResumed,
  stepAsked,
  teamOrganisesReply,
} = require("./path");
const {
  axisClarifyQuestion,
  briefsForFamily,
  careLabelForFamily,
  findOfferMap,
  inferCareFamily,
  resolveActiveFamily,
  understandThread,
  naturalOfferPhrase,
  phraseAskedService,
  phraseConfiguredOffer,
  phraseFromCareTitle,
  serviceIsOffered,
  serviceOfferReply,
} = require("./care-family");
const { pickBookingResources, pickCatalogService } = require("./axis-resources");
const { isCenterResidueName, sanitizePersonName } = require("../../lib/seya-person-name");
const { resolveGeneralBrief } = require("./general-brief");
const {
  applySeyaMissionFlags,
  canBookSeya,
  fillRelanceTemplate,
  isQualifyCallback,
  isWelcomeRelanceOnly,
  operatorCallbackReply,
  resolveSeyaMission,
  welcomeRelanceHandoffReply,
} = require("./mission");

const BILAN_DURATION_MINUTES = 75;
const FAMILY_VISIT_MINUTES = {
  minceur: 60,
  epilation: 45,
  visage: 60,
};

function visitDurationMinutes(seya, conversation, extraText) {
  const family = resolveActiveFamily(seya, conversation, extraText);
  const brief =
    findTreatmentBrief(
      seya,
      `${conversation?.qualification?.need || ""} ${conversation?.treatment || ""}`,
      family,
    ) || findTreatmentBrief(seya, conversation?.treatment, family);
  const fromBrief = Number(
    brief?.durationMinutes ?? brief?.duration ?? brief?.duration_minutes,
  );
  if (Number.isFinite(fromBrief) && fromBrief > 0) {
    return fromBrief;
  }
  const fromCatalog = Number(pickCatalogService(seya, family)?.duration);
  if (Number.isFinite(fromCatalog) && fromCatalog > 0) {
    return fromCatalog;
  }
  return FAMILY_VISIT_MINUTES[family] || BILAN_DURATION_MINUTES;
}

function conversationCabinId(seya, conversation, extraText) {
  const family = resolveActiveFamily(seya, conversation, extraText);
  return pickBookingResources({
    rooms: seya?.agendaRooms,
    seya,
    family,
  }).cabinId;
}

const weekdayNames = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];
const weekdayShort = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const defaultBriefs = [
  {
    name: "Épilation définitive",
    price: "",
    brief:
      "Tu accueilles pour l’épilation, comme au standard. Prix seulement si on te le demande. Pacemaker, grossesse en cours ou doute santé : tu transmets à l’équipe, tu ne poses pas de rendez-vous.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Je peux regarder un créneau avec vous, si vous le souhaitez.",
  },
  {
    name: "Soin minceur",
    pricing: {
      bilan: "",
      discovery: "",
      session: "",
      package: "",
      sessionPolicy: "after_bilan",
    },
    price: "",
    brief:
      "Tu commences par la zone, comme tu le ferais au téléphone. Prix seulement si on te le demande. Si on te demande le tarif, tu le dis en une ou deux phrases, tu n’enchaînes pas avec des créneaux.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Sur quelle zone souhaitez-vous que l’on regarde ?",
  },
  {
    name: "Soin visage",
    price: "",
    brief:
      "Tu t’intéresses à l’objectif pour la peau. Prix seulement si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?",
  },
  {
    name: "Cryolipolyse",
    pricing: {
      bilan: "",
      discovery: "",
      session: "",
      package: "",
      sessionPolicy: "after_bilan",
    },
    price: "",
    brief:
      "Tu demandes la zone, simplement. Prix seulement si on te le demande. Doute santé : tu transmets à l’équipe.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quelle zone souhaitez-vous traiter ?",
  },
  {
    name: "Hydrafacial",
    price: "",
    brief:
      "Tu t’intéresses à l’objectif pour la peau. Prix seulement si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?",
  },
];

const aliases = [
  {
    keys: ["epilation", "laser", "definitive", "epil"],
    name: "Épilation définitive",
  },
  {
    keys: [
      "minceur",
      "cryo",
      "cryolipolyse",
      "cellulite",
      "ventre",
      "poids",
      "graisse",
    ],
    name: "Soin minceur",
  },
  { keys: ["visage", "hydrafacial", "peau", "glow", "acne"], name: "Soin visage" },
];

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isJunkTreatment(value) {
  const needle = normalize(value);
  return (
    !needle ||
    /lead meta|meta lead|webhook|soin a preciser|a preciser/.test(needle) ||
    /^offre\s*\d+$/.test(needle)
  );
}

function isOptOut(text, conversation) {
  return isLeadRefusal(text, conversation);
}

function faqReply(text, extras = {}) {
  const value = normalize(text);
  if (/^\?+$/.test(String(text || "").trim())) {
    return "Dites-moi ce que vous voulez savoir : le prix, un créneau, ou autre chose ?";
  }
  if (/gratuit|offert/.test(value) && /bilan|decouverte|seance/.test(value)) {
    return "";
  }
  if (
    (/resultat/.test(value) &&
      (/\?/.test(String(text || "")) ||
        /combien de temps|quand|au bout|en combien|ca marche/.test(value))) ||
    /combien de temps.*result/.test(value)
  ) {
    return "Les résultats dépendent de la zone et du protocole. On vous les explique au bilan.";
  }
  if (/combien de temps|ca dure|duree|dure (le )?(rdv|bilan|rendez-vous)/.test(value)) {
    const family =
      resolveActiveFamily(extras.seya, extras.conversation, text) ||
      inferCareFamily(`${extras.conversation?.treatment || ""} ${text || ""}`);
    if (family && visitDurationsInFacts(briefsForFamily(extras.seya, family).map((item) => item?.brief)).length > 1) {
      return TEAM_QUESTION_UNSURE_REPLY;
    }
    const briefDuration = family
      ? findFacts(
          briefsForFamily(extras.seya, family).map((item) => item?.brief),
          /(bilan|diagnostic|rendez-vous|seance).*\b\d+\s*(min|minutes|h|heures?)\b/,
          1,
        )[0] || ""
      : "";
    const spokenBrief = briefDuration.match(/(?:environ\s+)?\d+\s*(?:min(?:utes)?|h(?:eures?)?)(?:\s*\d+)?/i)?.[0];
    if (spokenBrief) {
      const visit = /diagnostic/i.test(briefDuration) ? "Le diagnostic" : "Le bilan";
      return `${visit} dure ${/^environ/i.test(spokenBrief) ? spokenBrief : `environ ${spokenBrief}`}.`;
    }
    const minutes = visitDurationMinutes(extras.seya, extras.conversation, text);
    const spoken = spokenVisitDuration(minutes);
    return spoken
      ? `Le rendez-vous dure environ ${spoken}.`
      : "Le bilan dure environ 30 à 45 minutes.";
  }
  if (/fait mal|douloureux|douleur/.test(value)) {
    return "Le bilan est indolore. Pour une séance, ça dépend de la zone, on vous l’explique sur place.";
  }
  if (/enfant|bebe|nourrisson|avec mon fils|avec ma fille/.test(value)) {
    const extrasText = normalizeCenterProfile(
      extras?.centerProfile || agentSettings(extras.seya).centerProfile,
    ).extras;
    return findFacts([extrasText], /enfant|bebe/, 1)[0] || TEAM_QUESTION_REPLY;
  }
  if (
    /comment (se )?deroule|c['’ ]?est quoi (un |le |votre )?(bilan|diagnostic)|en quoi consiste|comment ca se passe|(bilan|diagnostic),? (ca|cela) consiste/.test(
      value,
    )
  ) {
    const family =
      resolveActiveFamily(extras.seya, extras.conversation, text) ||
      inferCareFamily(`${extras.conversation?.treatment || ""} ${text || ""}`);
    const briefFacts = family
      ? findFacts(
          briefsForFamily(extras.seya, family).map((item) => item?.brief),
          /(bilan|diagnostic).*(permet|consiste|comprend|analyse)|analyse corporelle|devis personnalise/,
          2,
        )
      : [];
    if (briefFacts.length) {
      return briefFacts.join(" ");
    }
    if (family === "minceur") {
      return "Le bilan permet de faire le point sur votre objectif et les zones à travailler, puis de vous présenter les solutions adaptées avec un devis personnalisé.";
    }
    if (family === "epilation") {
      return "Le bilan pilaire permet d’analyser la pilosité et la peau, puis de vous proposer un protocole et un devis pour la zone.";
    }
    if (family === "visage") {
      return "Le diagnostic visage permet de faire le point sur la peau, puis de vous proposer un protocole adapté.";
    }
    return "Le déroulement exact dépend de la prestation : l’équipe vous l’explique lors de votre échange.";
  }
  const previousSeya = [...(extras.conversation?.messages || [])].reverse().find((item) => item.author === "seya")?.text;
  const asksAboutNamedTechnology =
    /cryo|radio ?frequence|presso|cellu ?m ?6|\blpg\b|palper|\bems\b|cavitation|ultra ?sons|lipo ?laser|hydra ?facial|microneedling|laser (a )?diode/.test(value) &&
    (/c'?est quoi|comment (ca|ça) marche|a quoi sert|ca sert|en quoi/.test(value) || String(text || "").trim().endsWith("?"));
  const namesTechnology = asksAboutNamedTechnology || isTechnologyFollowUp(text, previousSeya);
  if (asksTechnology(text) || namesTechnology) {
    const profile = normalizeCenterProfile(
      extras?.centerProfile || agentSettings(extras.seya).centerProfile,
    );
    const family =
      resolveActiveFamily(extras.seya, extras.conversation, text) ||
      inferCareFamily(`${extras.conversation?.treatment || ""} ${text || ""}`);
    const sources = [
      ...briefsForFamily(extras.seya, family).map((item) => item?.brief),
      profile.activity,
      profile.extras,
      extras.seya?.brief,
    ];
    const reply = technologyReply({
      text,
      family,
      zone: extras.conversation?.qualification?.zone,
      sources,
    });
    if (reply) {
      return reply;
    }
    return namesTechnology && !asksTechnology(text) ? "" : TEAM_QUESTION_REPLY;
  }
  return "";
}

function emptyCenterProfile() {
  return {
    activity: "",
    extras: "",
    audience: "",
    problem: "",
    differentiation: "",
    promise: "",
    positioning: "",
    supportPhone: "",
    supportEmail: "",
  };
}

function normalizeCenterProfile(value) {
  const current = value && typeof value === "object" ? value : {};
  const next = emptyCenterProfile();
  for (const key of Object.keys(next)) {
    next[key] = String(current[key] || "").trim();
  }
  return next;
}

function formatCenterProfilePrompt(profile) {
  const current = normalizeCenterProfile(profile);
  const rows = [
    ["Activité", current.activity],
    ["Accès et infos pratiques", current.extras],
    ["Cibles", current.audience],
    ["Problème résolu", current.problem],
    ["Différenciation", current.differentiation],
    ["Promesse", current.promise],
    ["Positionnement", current.positioning],
    ["Téléphone", current.supportPhone],
    ["Email", current.supportEmail],
  ].filter(([, value]) => value);
  if (!rows.length) {
    return "";
  }
  return rows.map(([label, value]) => `${label} : ${value}`).join("\n");
}

function asksLocation(text) {
  return (
    /\bou (etes|etes[- ]vous|se trouve)\b|situ[eé]|adresse|\bc['’]est ou\b|vous etes ou\b|tu es (ou\b|situ)/i.test(
      normalize(text),
    ) || gaillard.asksCountry(text)
  );
}

function asksAccess(text) {
  return /parking|stationn|acces|accès|ascenseur|borne|comment venir|s['’]y rendre|ou (se )?garer/i.test(
    String(text || ""),
  );
}

function locationReply(address, centerName) {
  if (address) {
    return `Nous sommes au ${address}.`;
  }
  return `Je vérifie l’adresse exacte avec l’équipe${centerName ? ` du ${centerName}` : ""}. Je vous la confirme dès que je l’ai.`.replace(
    /\s+/g,
    " ",
  );
}

function centerPlaceReply(text, extras, seya) {
  const profile = normalizeCenterProfile(
    extras?.centerProfile || agentSettings(seya).centerProfile,
  );
  const address = String(extras?.centerAddress || "").trim();
  const centerName = String(extras?.centerName || "").trim();
  if (gaillard.asksCountry(text)) {
    return (
      gaillard.countryReply(address, centerName) ||
      (address
        ? `Nous sommes au ${address}. L’équipe pourra vous confirmer le pays si besoin.`
        : "Je vérifie le pays exact avec l’équipe et je vous le confirme.")
    );
  }
  if (asksAccess(text) && profile.extras) {
    if (asksLocation(text) && address) {
      return `Nous sommes au ${address}. ${profile.extras}`;
    }
    return profile.extras;
  }
  return locationReply(address, centerName);
}

function hasMedicalFlag(text) {
  return classifyHealthMessage(text).personal;
}

function threadHasMedical(conversation, text) {
  return (
    classifyHealthMessage(text).personal || isAwaitingHealthReview(conversation)
  );
}

function formatHumanSlots(slots) {
  const labels = (slots || []).slice(0, 2).map((slot) => slot.label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} ou ${labels[1]}`;
}

function alternativeSlotPrefix(slots, state) {
  if (!state?.requestedDate || !(slots || []).length) {
    return "";
  }
  if (slots.every((slot) => slot.date === state.requestedDate)) {
    return "";
  }
  const date = new Date(`${state.requestedDate}T12:00:00`);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hour = state.preferredTime
    ? ` à ${String(state.preferredTime).replace(":", "h")}`
    : state.dayPart === "morning"
      ? " le matin"
      : state.dayPart === "evening"
        ? " en fin de journée"
        : "";
  return `Je n’ai pas de disponibilité le ${dd}/${mm}${hour}. `;
}

function humanSlotReply(slots, state) {
  const list = (slots || []).slice(0, 2);
  if (!list.length) {
    return emptySlotFallback(state || {});
  }
  const prefix = alternativeSlotPrefix(list, state);
  const sameDay = list.every((slot) => slot.date === list[0].date);
  if (sameDay) {
    const day = list[0].label.replace(/\s+à\s+.*/, "");
    const times = list.map((slot) => String(slot.time || "").replace(":", "h"));
    if (times.length === 1) {
      return `${prefix}Le ${day} à ${times[0]} est disponible. Je vous le réserve ?`;
    }
    return `${prefix}Le ${day} je peux vous proposer ${times[0]} ou ${times[1]} — lequel vous irait le mieux ?`;
  }
  return `${prefix}Je peux vous proposer ${formatHumanSlots(list)} — lequel vous irait le mieux ?`;
}

function greetingName(value) {
  const name = String(value || "").trim();
  if (!name || /^(bonjour|hello|hi|bonsoir)$/i.test(name)) {
    return "";
  }
  if (isCenterResidueName(name)) {
    return "";
  }
  const needle = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/^(reseau|institut|spa|beaute|exclusive|depil)$/.test(needle)) {
    return "";
  }
  return name;
}

function looksRoboticOpening(value) {
  const text = String(value || "");
  return (
    /bonjour,?\s+je suis seya/i.test(text) ||
    /votre demande\s*\(/i.test(text) ||
    /le minceur/i.test(text)
  );
}

function resolveTreatmentPrice(seya, treatment, conversation) {
  const policy = resolvePricePolicy(seya, {
    ...(conversation || {}),
    treatment: conversation?.treatment || treatment,
    qualification: conversation?.qualification || { need: treatment },
  });
  if (policy.bilan) {
    return /offert|gratuit/i.test(policy.bilan)
      ? "Le bilan est offert."
      : `Le bilan est à ${policy.bilan}.`;
  }
  const raw = String(findTreatmentBrief(seya, treatment)?.price || "").trim();
  if (/séance découverte sont offerts/i.test(raw)) {
    return "";
  }
  return raw;
}

function displayCareLabel(qualification, conversation) {
  const zone = String(qualification?.zone || "").trim();
  const need = String(qualification?.need || "").trim();
  if (need && !isJunkTreatment(need) && zone) {
    return `${need} (${zone})`;
  }
  if (zone) {
    return zone;
  }
  if (need && !isJunkTreatment(need)) {
    return need;
  }
  const family = familyFromTreatment(
    `${conversation?.treatment || ""} ${conversation?.campaign || ""} ${zone}`,
  );
  if (family === "minceur") return "un soin minceur";
  if (family === "visage") return "un soin visage";
  if (family === "epilation") return "une épilation définitive";
  return "votre soin";
}

function priceReply(seya, qualification, conversation, text) {
  const reply = priceReplyCore(seya, qualification, conversation, text);
  if (!/\b(bilan|diagnostic)\b/i.test(reply)) {
    return reply;
  }
  const family =
    inferCareFamily(text || "") ||
    resolveActiveFamily(seya, { ...(conversation || {}), qualification }, text) ||
    inferCareFamily(`${qualification?.need || ""} ${conversation?.treatment || ""}`);
  if (!family) {
    return reply;
  }
  const policy = resolvePricePolicy(seya, {
    ...(conversation || {}),
    treatment: careLabelForFamily(family),
    qualification: { ...(qualification || {}), need: careLabelForFamily(family) },
  });
  if (!bilanPriceConflict(policy.bilan, briefsForFamily(seya, family).map((item) => item?.brief))) {
    return reply;
  }
  console.warn("[seya/knowledge] tarif du bilan contradictoire", { family });
  return TEAM_QUESTION_UNSURE_REPLY;
}

function priceReplyCore(seya, qualification, conversation, text) {
  const intentText =
    text || conversation?.bookingState?.lastLeadPriceText || "c’est combien";
  const spokenFamily = inferCareFamily(intentText);
  const switched = applyCareSwitch(conversation, qualification);
  const pricedConversation = spokenFamily
    ? {
        ...switched,
        treatment: careLabelForFamily(spokenFamily),
        campaign: "",
        offerLabel: "",
        _seya: seya || conversation?._seya,
      }
    : { ...switched, _seya: seya || conversation?._seya };
  const pricedQualification = spokenFamily
    ? { ...qualification, need: careLabelForFamily(spokenFamily) }
    : qualification;
  const built = buildPriceReply(intentText, seya, {
    ...pricedConversation,
    qualification: pricedQualification,
  });
  if (built) {
    return built;
  }
  const price = resolveTreatmentPrice(
    seya,
    `${pricedQualification?.need || ""} ${pricedQualification?.zone || ""} ${pricedConversation?.treatment || ""}`,
    pricedConversation,
  );
  if (
    price &&
    /analyse corporelle|devis personnalise|devis personnalisé/i.test(price) &&
    (spokenFamily ||
      inferCareFamily(
        `${qualification?.need || ""} ${conversation?.treatment || ""} ${intentText}`,
      )) === "minceur"
  ) {
    return price;
  }
  return unknownPriceReply();
}

function todayIso(now) {
  const date = now instanceof Date ? now : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function currentMinutes(now) {
  const date = now instanceof Date ? now : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function daysBetweenIso(fromIso, toIso) {
  const start = new Date(`${fromIso}T12:00:00`).getTime();
  const end = new Date(`${toIso}T12:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeToMinutes(value) {
  const raw = String(value || "00:00");
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function appointmentDurationMinutes(appointment) {
  const raw = Number(appointment?.duration ?? appointment?.duration_minutes);
  return Number.isFinite(raw) && raw > 0 ? raw : BILAN_DURATION_MINUTES;
}

function isBlockingAppointment(appointment, date) {
  if (!appointment) {
    return false;
  }
  const appointmentDate = String(
    appointment.date || appointment.appointment_date || "",
  ).slice(0, 10);
  if (appointmentDate && appointmentDate !== String(date || "").slice(0, 10)) {
    return false;
  }
  if (/annul|cancel/i.test(String(appointment.status || ""))) {
    return false;
  }
  return true;
}

function isSlotBusy(appointments, date, time, duration = BILAN_DURATION_MINUTES, cabinId = "") {
  const start = timeToMinutes(time);
  const end = start + (Number(duration) > 0 ? Number(duration) : BILAN_DURATION_MINUTES);
  const targetCabin = String(cabinId || "").trim();
  return (appointments || []).some((appointment) => {
    if (!isBlockingAppointment(appointment, date)) {
      return false;
    }
    const otherCabin = String(appointment.cabinId || appointment.room_id || "").trim();
    if (targetCabin && otherCabin && otherCabin !== targetCabin) {
      return false;
    }
    const otherStart = timeToMinutes(appointment.start || appointment.starts_at);
    const otherEnd = otherStart + appointmentDurationMinutes(appointment);
    return rangesOverlap(start, end, otherStart, otherEnd);
  });
}

function formatSlotLabel(date, time) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const [, month, day] = date.split("-");
  return `${weekdayShort[weekday]} ${day}/${month} à ${time.replace(":", "h")}`;
}

function formatConfirmedSlot(slot) {
  const date = String(slot?.date || "");
  const time = String(slot?.time || "").replace(":", "h");
  const weekday = date ? new Date(`${date}T12:00:00`).getDay() : 0;
  const [, month, day] = date.split("-");
  const rawDay = weekdayNames[weekday] || "";
  return {
    day: rawDay ? rawDay.charAt(0).toUpperCase() + rawDay.slice(1) : "",
    date: day && month ? `${day}/${month}` : "",
    time: time || "",
  };
}

function confirmedAppointmentReply({
  slot,
  centerName,
  centerAddress,
  brief,
} = {}) {
  const parts = formatConfirmedSlot(slot);
  const name = String(centerName || "").trim();
  const address = String(centerAddress || "").trim();
  const where = formatConfirmationPlace(name, address);
  const fromBrief = fillConfirmationTemplate(brief, {
    ...parts,
    centerName: name,
    address,
    place: where,
  });
  if (fromBrief) {
    return applyCenterPlace(fromBrief, where, Boolean(address));
  }
  return [
    "Parfait, votre rendez-vous est confirmé ✅",
    `📅 ${parts.day} ${parts.date} à ${parts.time}`.replace(/\s+/g, " ").trim(),
    `📍 ${where}`,
    "Vous recevrez un SMS 48 h avant avec un lien pour confirmer ou modifier votre rendez-vous. En cas d’empêchement, merci de nous prévenir.",
    "À très bientôt,",
    "Seya",
  ].join("\n");
}

function formatConfirmationPlace(centerName, centerAddress) {
  const name = String(centerName || "").trim();
  const address = String(centerAddress || "").trim();
  if (name && address) {
    if (address.toLowerCase().includes(name.toLowerCase())) {
      return address;
    }
    return `${name}, ${address}`;
  }
  return address || name || "le centre";
}

function applyCenterPlace(text, where, hasAddress) {
  if (!hasAddress || !where || !/📍/.test(text)) {
    return text;
  }
  return String(text).replace(/📍[^\n]*/g, `📍 ${where}`);
}

function fillConfirmationTemplate(brief, parts) {
  const raw = String(brief || "");
  const quoted = raw.match(
    /[«"“]\s*(Parfait, votre rendez-vous est confirmé[\s\S]+?Seya)\s*[»"”]/i,
  );
  const block =
    quoted?.[1] ||
    raw.match(/(Parfait, votre rendez-vous est confirmé[\s\S]+?Seya)/i)?.[1];
  if (!block) {
    return "";
  }
  return block
    .replace(/\[Jour\]/gi, parts.day || "")
    .replace(/\[date\]/gi, parts.date || "")
    .replace(/\[heure\]/gi, parts.time || "")
    .replace(/\[nom du centre\]/gi, parts.centerName || parts.place || "")
    .replace(/\[centre\]/gi, parts.centerName || parts.place || "")
    .replace(/\[adresse\]/gi, parts.address || parts.place || "")
    .replace(/\[lieu\]/gi, parts.place || "")
    .trim();
}

function agentSettings(seya) {
  const record = asRecord(seya);
  const briefs = Array.isArray(record.treatmentBriefs)
    ? record.treatmentBriefs
    : defaultBriefs;
  const offers = Array.isArray(record.offerMaps) ? record.offerMaps : [];
  const flags = applySeyaMissionFlags(record);
  return {
    whatsappAgentEnabled: record.whatsappAgentEnabled !== false,
    autoMessageOnNewLead: flags.autoMessageOnNewLead,
    seyaMission: flags.seyaMission,
    qualifyOnSignup: flags.qualifyOnSignup,
    askForAppointment: flags.askForAppointment,
    bookAppointment: flags.bookAppointment,
    handoffToHuman: record.handoffToHuman !== false,
    treatmentBriefs: briefs,
    offerMaps: offers,
    centerProfile: normalizeCenterProfile(record.centerProfile),
    brief: resolveGeneralBrief(record.brief),
    relanceEnabled: flags.relanceEnabled,
    relanceDays: flags.relanceDays,
    relances: flags.relances,
  };
}

function resolveOfferLabel(seya, campaign, treatment) {
  const found = findOfferMap(agentSettings(seya), campaign, treatment);
  return String(found?.label || "").trim();
}

function resolveTreatmentBrief(seya, treatment) {
  const family = inferCareFamily(treatment);
  return String(findTreatmentBrief(seya, treatment, family)?.brief || "").trim();
}

function closingFromBrief(text) {
  const match = String(text || "").match(
    /\b(?:termine[rsz]?|finis|finir|conclus|conclure)\s+(?:toujours\s+|la conversation\s+|chaque conversation\s+)?(?:par|avec)\s*:?\s*(?:«\s*([\s\S]+?)\s*»|"([^"]+)"|“([^”]+)”)/i,
  );
  return String(match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function briefClosing(seya, conversation, extraText = "") {
  const family = resolveActiveFamily(seya, conversation, extraText);
  const brief =
    findTreatmentBrief(
      seya,
      `${conversation?.qualification?.need || ""} ${conversation?.treatment || ""}`,
      family,
    ) || findTreatmentBrief(seya, conversation?.treatment, family);
  const briefFamily = brief ? inferCareFamily(brief.name) : "";
  const sameFamily = !family || !briefFamily || briefFamily === family;
  return (
    (sameFamily ? closingFromBrief(brief?.brief) : "") ||
    closingFromBrief(agentSettings(seya).brief)
  );
}

function inferFamily(seya, campaign, treatment) {
  const fromCampaign = familyFromTreatment(campaign);
  if (fromCampaign) {
    return fromCampaign;
  }
  const offer = findOfferMap(agentSettings(seya), campaign, treatment);
  const fromOffer = familyFromTreatment(
    offer ? `${offer.label || ""} ${offer.match || ""}` : "",
  );
  if (fromOffer) {
    return fromOffer;
  }
  return familyFromTreatment(treatment);
}

function resolveOpeningOffer(seya, campaign, treatment) {
  const family = inferFamily(seya, campaign, treatment);
  const mapped = resolveOfferLabel(seya, campaign, treatment);
  if (mapped) {
    return phraseConfiguredOffer(mapped);
  }
  const brief =
    findTreatmentBrief(seya, `${campaign || ""} ${treatment || ""}`, family) ||
    findTreatmentBrief(
      seya,
      family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : "",
      family,
    );
  const fromTitle = phraseFromCareTitle(brief?.title);
  if (fromTitle) {
    return fromTitle;
  }
  return naturalOfferPhrase(family, campaign || treatment);
}

function resolveTreatmentUrl(seya, campaign, treatment) {
  const family = inferFamily(seya, campaign, treatment);
  const brief =
    findTreatmentBrief(seya, `${campaign || ""} ${treatment || ""}`, family) ||
    findTreatmentBrief(seya, treatment, family);
  return String(brief?.url || "").trim();
}

function familyFromTreatment(treatment) {
  return inferCareFamily(treatment);
}

function defaultOfferForFamily(family, rawOffer) {
  return naturalOfferPhrase(family, rawOffer) || "";
}

function defaultOpeningForFamily(family, mission) {
  if (mission === "welcome_relance") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Je suis là si vous avez une question.";
  }
  if (family === "minceur") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Sur quelle zone souhaitez-vous que l’on regarde ?";
  }
  if (family === "visage") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?";
  }
  if (family === "epilation") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Je peux regarder un créneau avec vous, si vous le souhaitez.";
  }
  return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande. Je peux regarder un créneau avec vous, si vous le souhaitez.";
}

function fillOpening(template, vars) {
  const repaired = String(template || "")
    .replace(/notre offre\s+\{centre\}/gi, "notre offre {offre}")
    .replace(/votre demande pour\s+\{centre\}/gi, "votre demande pour {offre}")
    .replace(/pour (?:notre |l['’])?offre\s+\{centre\}/gi, "pour notre offre {offre}");
  return repaired
    .replace(/\{prenom\}|\[pr[ée]nom\]/gi, vars.prenom)
    .replace(/\{firstName\}/gi, vars.prenom)
    .replace(/\{centre\}|\[centre\]/gi, vars.centre)
    .replace(/\{center\}/gi, vars.centre)
    .replace(/\{offre\}|\[offre\]/gi, vars.offre || "")
    .replace(/\{offer\}/gi, vars.offre || "")
    .replace(/Bonjour\s+,/g, "Bonjour,")
    .replace(/Bonjour\s+😊/g, "Bonjour 😊")
    .replace(/\(\s*\)/g, "")
    .replace(/ pour \./g, ".")
    .replace(/demande pour\s+\./gi, "demande.")
    .replace(/  +/g, " ")
    .trim();
}

function findTreatmentBrief(seya, treatment, family) {
  const settings = agentSettings(seya);
  const needle = normalize(treatment);
  const briefs = family
    ? briefsForFamily(seya, family)
    : settings.treatmentBriefs;
  const pool = briefs.length ? briefs : settings.treatmentBriefs;
  if (!needle && family) {
    return (
      pool.find((item) => inferCareFamily(item?.name) === family) || pool[0] || null
    );
  }
  if (!needle) {
    return null;
  }
  const exact = pool.find((item) => normalize(item?.name) === needle);
  if (exact) return exact;
  const partial = pool.find((item) => {
    const name = normalize(item?.name);
    return name && (needle.includes(name) || name.includes(needle));
  });
  if (partial) return partial;
  const alias = aliases.find((item) => {
    if (family && inferCareFamily(item.name) !== family) {
      return false;
    }
    return item.keys.some((key) => needle.includes(normalize(key)));
  });
  if (!alias) {
    return family
      ? pool.find((item) => inferCareFamily(item?.name) === family) || null
      : null;
  }
  return (
    pool.find((item) => normalize(item?.name) === normalize(alias.name)) ||
    null
  );
}

function buildOpeningMessage(context, centerName, seya) {
  const hay = `${context.campaign || ""} ${context.treatment || ""}`;
  const family = inferFamily(seya, context.campaign, context.treatment);
  const offer = resolveOpeningOffer(seya, context.campaign, context.treatment);
  const brief =
    findTreatmentBrief(seya, hay, family) ||
    findTreatmentBrief(
      seya,
      family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : "",
      family,
    );
  const stored = String(brief?.opening || "").trim();
  const mission = resolveSeyaMission(seya);
  const template =
    mission === "welcome_relance"
      ? defaultOpeningForFamily(family, mission)
      : looksRoboticOpening(stored)
        ? defaultOpeningForFamily(family, mission)
        : stored || defaultOpeningForFamily(family, mission);
  return fillOpening(template, {
    prenom: greetingName(context.firstName),
    centre: String(centerName || "").trim() || "le centre",
    offre: offer,
  });
}

function extractNeed(text) {
  const value = normalize(text);
  const family = inferCareFamily(text);
  if (family === "visage" && value.includes("hydrafacial")) {
    return "Hydrafacial";
  }
  if (family === "minceur" && /cryo/.test(value)) {
    return "Cryolipolyse";
  }
  if (family === "epilation") {
    return "Épilation laser";
  }
  if (family) {
    return careLabelForFamily(family);
  }
  if (/\bbilan\b/.test(value) && !/laser|epil|visage|peau|hydra/.test(value)) {
    return "Bilan";
  }
  return "";
}

function extractZone(text) {
  const value = normalize(text);
  const careNeed = extractNeed(text);
  const zones = [
    "jambes",
    "maillot",
    "aisselles",
    "bras",
    "visage",
    "ventre",
    "fesses",
    "dos",
    "cuisse",
    "hanche",
    "poignees",
    "menton",
    "levre",
  ];
  if (/jambe/.test(value) && /complet|entier/.test(value)) {
    return "jambes complètes";
  }
  return zones
    .filter((zone) => {
      if (
        zone === "visage" &&
        (careNeed === "Soin visage" ||
          /pour le visage|soin (du )?visage|\bdu visage\b/.test(value))
      ) {
        return false;
      }
      return value.includes(zone);
    })
    .map((zone) => (zone === "poignees" ? "poignées d’amour" : zone))
    .join(", ");
}

function extractConcern(text) {
  const value = normalize(text);
  const concerns = [
    ["fermete", "fermeté"],
    ["rides", "rides"],
    ["acne", "acné"],
    ["taches", "taches"],
    ["cernes", "cernes"],
    ["pores", "pores"],
    ["eclat", "éclat"],
    ["hydrat", "hydratation"],
    ["relachement", "relâchement"],
  ];
  for (const [needle, label] of concerns) {
    if (value.includes(needle)) {
      return label;
    }
  }
  return "";
}

function applyCareSwitch(conversation, qualification) {
  const nextFamily = inferCareFamily(qualification?.need || "");
  const prevFamily = inferCareFamily(
    `${conversation?.treatment || ""} ${conversation?.offerLabel || ""} ${conversation?.campaign || ""}`,
  );
  if (!nextFamily || nextFamily === prevFamily) {
    return conversation;
  }
  const nextState = conversation?.bookingState
    ? {
        ...conversation.bookingState,
        lastOfferedSlots: [],
        visitDuration: undefined,
      }
    : conversation?.bookingState;
  return {
    ...conversation,
    treatment: qualification.need || careLabelForFamily(nextFamily),
    campaign: "",
    offerLabel: "",
    proposedSlots: [],
    bookingState: nextState,
  };
}

function extractDelay(text) {
  const value = normalize(text);
  if (/urgent|asap|tout de suite|cette semaine/.test(value)) return "cette semaine";
  if (/semaine prochaine|prochaine semaine/.test(value)) return "semaine prochaine";
  if (/ce mois|dans le mois/.test(value)) return "ce mois";
  return "";
}

function extractAvailability(text) {
  if (isWillComeBack(text) || isThreadComplaint(text)) {
    return "";
  }
  const value = normalize(text);
  const days = weekdayNames.filter((day) => value.includes(day));
  const time = String(text || "").toLowerCase().match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  return [
    ...days,
    time ? `${time[1]}h${time[2] ?? ""}`.replace(/h$/, "h") : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function mergeQualification(current, text, fallbackTreatment, conversation) {
  const currentNeed = isJunkTreatment(current?.need) ? "" : current?.need || "";
  const fallback = isJunkTreatment(fallbackTreatment) ? "" : fallbackTreatment || "";
  const consultative = extractConsultativeFields(current, text, conversation);
  const next = {
    need: currentNeed || fallback,
    zone: current?.zone || "",
    delay: current?.delay || "",
    availability: current?.availability || "",
    distance: consultative.distance || current?.distance || "",
    tried: consultative.tried || current?.tried || "",
  };
  const need = extractNeed(text);
  const zone = extractZone(text) || extractConcern(text);
  const delay = extractDelay(text);
  const availability = extractAvailability(text);
  const otherCareQuestion =
    Boolean(need && currentNeed) &&
    inferCareFamily(need) !== inferCareFamily(currentNeed) &&
    (isServiceAsk(text) || /\?\s*$/.test(String(text || "")));
  if (otherCareQuestion) {
    return next;
  }
  if (need) next.need = need;
  if (zone) next.zone = zone;
  if (delay) next.delay = delay;
  if (availability) next.availability = availability;
  return next;
}

function matchProposedSlot(text, slots, options = {}) {
  const value = String(text || "").toLowerCase().trim();
  if (!value || !Array.isArray(slots) || slots.length === 0) {
    return null;
  }
  const clocks = parseClockMinutes(text);
  if (
    /1er|octobre|novembre|decembre|janvier|fevrier|mars|avril|juin|juillet|aout|septembre|mai\b/i.test(
      value,
    ) &&
    !clocks.length
  ) {
    return null;
  }
  if (/^([123])$/.test(value)) {
    return slots[Number(value) - 1] || null;
  }
  if (clocks.length) {
    const dated = options.date
      ? slots.filter((slot) => slot.date === options.date)
      : slots;
    const pool = dated.length ? dated : slots;
    if (clocks.length >= 2 && !options.date && !options.confirmYes) {
      return null;
    }
    const lastMatch = [...clocks]
      .reverse()
      .map((clock) => pool.find((slot) => timeToMinutes(slot.time) === clock))
      .find(Boolean);
    if (lastMatch) {
      return lastMatch;
    }
    const exact = pool.find((slot) => clocks.includes(timeToMinutes(slot.time)));
    if (exact) {
      return exact;
    }
    const hourOnly = clocks.find((item) => item % 60 === 0);
    if (hourOnly != null) {
      const sameHour = slots.find(
        (slot) => Math.floor(timeToMinutes(slot.time) / 60) === hourOnly / 60,
      );
      if (sameHour) {
        return sameHour;
      }
    }
  }
  const ordinal = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+(svp|s'il vous plait|merci|stp)$/g, "")
    .trim();
  if (
    /^(le |la )?premi?(er|ere)( creneau| horaire| option)?$/.test(ordinal) ||
    (options.confirmYes && isShortYes(text))
  ) {
    return slots[0];
  }
  if (/^(le |la )?(deuxieme|second|seconde)( creneau| horaire| option)?$/.test(ordinal)) {
    return slots[1] || null;
  }
  if (/^(le |la )?dernier(e)?( creneau| horaire| option)?$/.test(ordinal)) {
    return slots[slots.length - 1] || null;
  }
  return (
    slots.find((slot) => {
      const label = String(slot.label || "").toLowerCase();
      return (
        value.includes(String(slot.time || "").replace(":", "h")) ||
        value.includes(String(slot.time || "")) ||
        value.includes(label)
      );
    }) || null
  );
}

function nextQualificationQuestion(qualification, seya, fallbackTreatment, conversation, text, now, extras = {}) {
  return conversationalReply(
    text,
    conversation,
    {
      ...qualification,
      need: qualification.need || fallbackTreatment,
    },
    now,
    {
      durationMinutes: visitDurationMinutes(seya, conversation, text),
      skipBookingCta: isWelcomeRelanceOnly(seya),
      seyaMission: resolveSeyaMission(seya),
      seya,
      centerName: extras.centerName,
    },
  );
}

function message(author, text) {
  const clean = String(text || "").trim();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text: author === "seya" ? prospectText(clean) : clean,
    at: new Date().toISOString(),
  };
}

function startConversation(context, centerName, seya) {
  const treatment =
    isJunkTreatment(context.treatment) ? "" : context.treatment || "";
  const family = inferFamily(seya, context.campaign, treatment || context.treatment);
  const treatmentFamily = familyFromTreatment(treatment);
  const alignedTreatment =
    family && treatmentFamily && family !== treatmentFamily
      ? careLabelForFamily(family)
      : treatment ||
        (family === "minceur"
          ? "Soin minceur"
          : family === "visage"
            ? "Soin visage"
            : family === "epilation"
              ? "Épilation définitive"
              : "");
  const mappedOffer = resolveOfferLabel(
    seya,
    context.campaign,
    alignedTreatment || context.treatment,
  );
  const offer = mappedOffer
    ? phraseConfiguredOffer(mappedOffer)
    : naturalOfferPhrase(family, context.campaign || treatment);
  const opening = buildOpeningMessage(
    { ...context, treatment: alignedTreatment },
    centerName,
    seya,
  );
  const person = sanitizePersonName(context.firstName, context.lastName);

  return {
    id: context.leadId,
    leadId: context.leadId,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: context.phone,
    treatment: alignedTreatment,
    campaign: context.campaign || "",
    offerLabel: offer === "un soin" ? "" : offer,
    status: "À envoyer",
    qualification: {
      need: alignedTreatment,
      zone: "",
      delay: "",
      availability: "",
    },
    centerId: context.centerId || null,
    proposedSlots: [],
    bookingState: emptyBookingState(context.centerId),
    messages: [message("seya", opening)],
    updatedAt: new Date().toISOString(),
    lastRelanceAt: null,
    relanceCount: 0,
  };
}

function upcomingDatesForWeekday(weekday, days = 45) {
  const dates = [];
  const today = todayIso();
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDaysIso(today, offset);
    if (new Date(`${date}T12:00:00`).getDay() === weekday) {
      dates.push(date);
    }
  }
  return dates;
}

function parseFrenchDate(text) {
  const value = normalize(text);
  const months = {
    janvier: 0,
    fevrier: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
  };
  const named = value.match(
    /(\d{1,2})(?:er|e)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/,
  );
  if (named) {
    const now = new Date();
    const date = new Date(now.getFullYear(), months[named[2]], Number(named[1]));
    if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      date.setFullYear(date.getFullYear() + 1);
    }
    return addDaysIso(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      0,
    );
  }
  const slash = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : new Date().getFullYear();
    return `${year}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
  }
  return "";
}

function parseDayRequest(text, conversation) {
  const value = normalize(text);
  const proposed = conversation?.proposedSlots || [];
  const proposedDates = proposed.map((slot) => slot.date);
  const proposedWeekdays = [
    ...new Set(
      proposed.map((slot) => new Date(`${slot.date}T12:00:00`).getDay()),
    ),
  ];
  const weekdays = weekdayNames
    .map((day, index) => (value.includes(day) ? index : -1))
    .filter((index) => index >= 0);
  const excludeWeekdays = [];
  const excludeDates = [];
  const wantsAnother =
    /suivant|prochain|un autre (lundi|mardi|mercredi|jeudi|vendredi|samedi)|autre lundi|lundi suivant/.test(
      value,
    );

  for (const [index, day] of weekdayNames.entries()) {
    const numbered = value.match(
      new RegExp(`(?:pas (?:dispo|disponible) )?le ${day}\\s*(\\d{1,2})`),
    );
    if (numbered) {
      const dayNum = Number(numbered[1]);
      excludeDates.push(
        ...upcomingDatesForWeekday(index, 45).filter(
          (date) => Number(date.slice(-2)) === dayNum,
        ),
      );
      continue;
    }
    if (
      !wantsAnother &&
      new RegExp(`pas (dispo|disponible).*${day}(?!\\s*\\d)|pas le ${day}(?!\\s*\\d)`).test(
        value,
      )
    ) {
      excludeWeekdays.push(index);
    }
  }

  if (wantsAnother) {
    excludeDates.push(...proposedDates);
    for (const weekday of weekdays.length ? weekdays : proposedWeekdays) {
      const first = upcomingDatesForWeekday(weekday, 14)[0];
      if (first) {
        excludeDates.push(first);
      }
    }
  }

  if (
    asksOtherDay(text) ||
    /d['’]autres creneaux/.test(value)
  ) {
    excludeDates.push(...proposedDates);
    if (!wantsAnother) {
      excludeWeekdays.push(...proposedWeekdays);
    }
  }

  const stored = weekdayNames
    .map((day, index) =>
      normalize(conversation?.qualification?.availability || "").includes(day)
        ? index
        : -1,
    )
    .filter((index) => index >= 0);

  return {
    weekdays: weekdays.length ? weekdays : stored,
    date: parseFrenchDate(text),
    excludeWeekdays: [...new Set(excludeWeekdays)],
    excludeDates: [...new Set(excludeDates)],
  };
}

function weekdayFilters(state) {
  if (state.strictWeekday || state.weekdayFromName) {
    return state.requestedWeekday != null ? [state.requestedWeekday] : [];
  }
  if (state.requestedDate) {
    return [];
  }
  if (state.weekHalf === "start") {
    return [1, 2, 3];
  }
  if (state.weekHalf === "end") {
    return [4, 5, 6];
  }
  return [];
}

function pickSlotsForState(appointments, hours, state, now, duration) {
  const preferredTimes = Array.isArray(state.preferredTimes)
    ? state.preferredTimes.filter(Boolean)
    : state.preferredTime
      ? [state.preferredTime]
      : [];
  const slotDuration =
    Number(duration) > 0
      ? Number(duration)
      : Number(state.visitDuration) > 0
        ? Number(state.visitDuration)
        : BILAN_DURATION_MINUTES;
  const base = {
    count: 2,
    excludeWeekdays: state.rejectedWeekdays,
    excludeDates: state.rejectedDates,
    excludeSlots: state.rejectedSlots,
    duration: slotDuration,
    dayPart: state.dayPart,
    preferredTime: preferredTimes[0] || "",
    preferredTimes,
    cabinId: state.cabinId || "",
    now,
  };
  const search = (overrides) =>
    suggestAvailableSlots(appointments, hours, { ...base, ...overrides });
  const expand = (overrides) => {
    for (const days of [7, 15, 30, 60]) {
      const found = search({ ...overrides, days });
      if (found.length) {
        return found;
      }
    }
    return [];
  };
  const namedWeekdays = weekdayFilters(state);

  if (state.requestedDate) {
    const exact = search({
      date: state.requestedDate,
      fromDate: state.requestedDate,
      days: 60,
      weekdays: [],
    });
    if (exact.length) {
      return exact;
    }
    const after = addDaysIso(state.requestedDate, 1);
    if (preferredTimes.length) {
      const laterSameTime = expand({
        date: "",
        fromDate: after,
        weekdays: namedWeekdays,
        preferredTimes,
      });
      if (laterSameTime.length) {
        return laterSameTime;
      }
    }
    if (namedWeekdays.length) {
      const nextWeekday = expand({
        date: "",
        fromDate: after,
        weekdays: namedWeekdays,
        preferredTimes,
      });
      if (nextWeekday.length) {
        return nextWeekday;
      }
    }
    return [];
  }

  return expand({
    date: "",
    fromDate: state.searchFrom || "",
    weekdays: namedWeekdays,
    preferredTimes,
  });
}

function pickSlotsForMessage(appointments, hours, conversation, text, now, seya) {
  const state = applyBookingMessage(conversation.bookingState, text, {
    centerId: conversation.centerId,
    now,
    conversation,
  });
  return pickSlotsForState(
    appointments,
    hours,
    {
      ...state,
      cabinId: conversationCabinId(seya, conversation, text),
    },
    now,
    visitDurationMinutes(seya, conversation, text),
  );
}

function suggestAvailableSlots(appointments, hours, countOrOptions = 2, duration = BILAN_DURATION_MINUTES) {
  const options =
    countOrOptions && typeof countOrOptions === "object"
      ? countOrOptions
      : { count: countOrOptions, duration };
  const count = options.count || 2;
  const slotDuration = options.duration || duration || BILAN_DURATION_MINUTES;
  const maxSpan = Math.min(Math.max(Number(options.days) || 30, 1), 60);
  const onlyWeekdays = Array.isArray(options.weekdays) ? options.weekdays : [];
  const onlyDate = String(options.date || "");
  const excludeWeekdays = Array.isArray(options.excludeWeekdays)
    ? options.excludeWeekdays
    : [];
  const excludeDates = Array.isArray(options.excludeDates) ? options.excludeDates : [];
  const excludeSlots = new Set(
    (Array.isArray(options.excludeSlots) ? options.excludeSlots : [])
      .map((slot) => `${slot.date}|${String(slot.time || "").slice(0, 5)}`)
      .filter(Boolean),
  );
  const slots = [];
  const clock = options.now instanceof Date ? options.now : new Date();
  const today = todayIso(clock);
  const nowMinutes = currentMinutes(clock);
  const week = Array.isArray(hours) && hours.length ? hours : defaultHours();
  const preferredList = (
    Array.isArray(options.preferredTimes) && options.preferredTimes.length
      ? options.preferredTimes
      : options.preferredTime
        ? [options.preferredTime]
        : []
  )
    .map((item) => timeToMinutes(item))
    .filter((item) => Number.isFinite(item));
  const fromDate = String(options.fromDate || "");
  let origin = today;
  if (fromDate && fromDate > origin) {
    origin = fromDate;
  }
  if (onlyDate) {
    origin = onlyDate;
  }
  const startOffset = Math.max(0, daysBetweenIso(today, origin));
  const endOffset = onlyDate ? startOffset + 1 : startOffset + maxSpan;
  const collectAll = preferredList.length > 0 || Boolean(onlyDate);

  for (
    let offset = startOffset;
    offset < endOffset && offset < startOffset + 60 && (collectAll || slots.length < count);
    offset += 1
  ) {
    const date = addDaysIso(today, offset);
    if (fromDate && date < fromDate) {
      continue;
    }
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (onlyDate && date !== onlyDate) {
      continue;
    }
    if (onlyWeekdays.length && !onlyWeekdays.includes(weekday)) {
      continue;
    }
    if (excludeWeekdays.includes(weekday) || excludeDates.includes(date)) {
      continue;
    }
    const dayHours = week.find((item) => Number(item.weekday) === weekday);
    if (!dayHours || dayHours.closed) {
      continue;
    }
    const start = timeToMinutes(dayHours.startTime || "09:00");
    const end = timeToMinutes(dayHours.endTime || "19:00");
    const afternoonStart = 14 * 60;
    const eveningStart = 16 * 60;
    let from = start;
    let to = end;
    if (options.dayPart === "evening") {
      from = Math.max(start, eveningStart);
    } else if (options.dayPart === "afternoon") {
      from = Math.max(start, afternoonStart);
    } else if (options.dayPart === "morning") {
      to = Math.min(end, 12 * 60);
    }
    for (let minutes = from; minutes + slotDuration <= to; minutes += 30) {
      if (date === today && minutes < nowMinutes + 60) {
        continue;
      }
      const time = minutesToTime(minutes);
      if (excludeSlots.has(`${date}|${time}`)) {
        continue;
      }
      if (isSlotBusy(appointments, date, time, slotDuration, options.cabinId)) {
        continue;
      }
      slots.push({ date, time, label: formatSlotLabel(date, time) });
      if (!collectAll && slots.length >= count) {
        break;
      }
    }
  }
  let result = slots;
  if (preferredList.length) {
    result = slots.filter((slot) =>
      preferredList.some((preferred) => timeToMinutes(slot.time) === preferred),
    );
  }
  return result.slice(0, count);
}

function defaultHours() {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    startTime: weekday === 0 ? "10:00" : "09:00",
    endTime: weekday === 0 ? "17:00" : "19:00",
    closed: weekday === 0,
  }));
}

function applyLeadReply(conversation, text, seya, slots, extras = {}) {
  if (gaillard.isGaillardCenter(extras.centerName) && !extras.gaillardInner) {
    return gaillardLeadReply(conversation, text, seya, slots, extras);
  }
  const previousSeya = [...(conversation?.messages || [])].reverse().find((item) => item.author === "seya")?.text;
  const followUp = isTechnologyFollowUp(text, previousSeya) ? faqReply(text, { seya, conversation }) : "";
  const result = keepHandoffStatus(
    followUp
      ? finishLeadReply(
          conversation,
          conversation.qualification || {},
          conversation.status || "En cours",
          text,
          followUp,
          conversation.bookingState || {},
          { seya },
        )
      : leadReplyCore(conversation, text, seya, slots, extras),
    conversation,
  );
  if (extras.gaillardInner) {
    return result;
  }
  return withPathResume(result, conversation, text, seya);
}

/** Une demande déjà transmise reste « À recontacter » tant qu’un autre statut métier ne la remplace pas. */
function keepHandoffStatus(result, conversation) {
  const next = result?.conversation;
  const handedOff =
    conversation?.status === "À recontacter" &&
    (conversation.bookingState?.pendingQuestion === "callback" ||
      Boolean(conversation.teamNotes?.handedOffAt));
  if (!next || !handedOff) {
    return result;
  }
  const keepsStatus = /^(Nouveau|En cours|Qualifié)$/.test(String(next.status || ""));
  const status = keepsStatus ? "À recontacter" : next.status;
  const nextState = next.bookingState || {};
  const offersSlots =
    nextState.pendingQuestion === "offer_slots" ||
    (Array.isArray(nextState.lastOfferedSlots) && nextState.lastOfferedSlots.length > 0);
  const pendingQuestion =
    status === "À recontacter" && !offersSlots && !next.bookedSlot
      ? "callback"
      : nextState.pendingQuestion;
  if (status === next.status && pendingQuestion === next.bookingState?.pendingQuestion) {
    return result;
  }
  return {
    ...result,
    conversation: {
      ...next,
      status,
      bookingState: { ...(next.bookingState || {}), pendingQuestion },
    },
  };
}

const CLOSED_STATUSES = /^(À recontacter|RDV confirmé|Perdu|Pas intéressé|Annulation)$/;

/** Après une réponse à une question, Seya reprend l’étape en cours sans recommencer le parcours. */
function withPathResume(result, conversation, text, seya) {
  const next = result?.conversation;
  const messages = next?.messages || [];
  const last = messages.at(-1);
  const reply = last?.author === "seya" ? String(last.text || "").trim() : "";
  const goal = pathGoal(seya);
  const state = next?.bookingState || {};
  if (
    !reply ||
    reply.includes("?") ||
    softResumed(reply) ||
    goal === "none" ||
    CLOSED_STATUSES.test(String(next.status || "")) ||
    state.pendingQuestion === "callback" ||
    /^(booked|confirmed)$/.test(String(state.appointmentStatus || "")) ||
    next.bookedSlot ||
    isAppointmentConfirmed(conversation) ||
    result.shouldBook ||
    next.teamNotes?.handedOffAt ||
    conversation?.teamNotes?.handedOffAt ||
    conversation?.leadPause ||
    threadIsPaused(conversation) ||
    /je peux demander|je (le )?v[ée]rifie|je me renseigne|je reviens vers vous|je (le )?transmets|transmettre|vous faire rappeler/i.test(
      reply.replace(TEAM_QUESTION_MARK, ""),
    )
  ) {
    return result;
  }
  const leadAsks =
    /\?/.test(String(text || "")) ||
    asksPrice(text) ||
    Boolean(classifyPriceQuestion(text)) ||
    asksLocation(text) ||
    asksAccess(text) ||
    isServiceAsk(text) ||
    asksOpenQuestion(text);
  const leadStops =
    isHesitation(text) ||
    refusesSlots(text) ||
    isLeadRefusal(text, conversation) ||
    Boolean(closingKind(text, conversation)) ||
    isWillCallBack(text) ||
    isWillComeBack(text) ||
    isWaitUntilLater(text) ||
    asksForCallback(text);
  const seyaTexts = (conversation?.messages || [])
    .filter((item) => item.author === "seya")
    .map((item) => String(item.text || ""));
  const lastStepIndex = seyaTexts.map((item) => stepAsked(item)).lastIndexOf(true);
  if (!leadAsks || leadStops || lastStepIndex < 0) {
    return result;
  }
  // Le prospect a déjà décliné ou demandé du temps depuis la dernière proposition : on n’insiste pas.
  if (seyaTexts.slice(lastStepIndex + 1).some((item) => /je n’insiste pas|prenez le temps/i.test(item))) {
    return result;
  }
  const recentSeya = seyaTexts.slice(-2);
  const withLine = (line, pendingQuestion) => ({
    ...result,
    conversation: {
      ...next,
      bookingState: { ...state, pendingQuestion },
      messages: [...messages.slice(0, -1), { ...last, text: `${reply} ${line}` }],
    },
    locked: true,
  });
  const slotsPending = Math.max((state.lastOfferedSlots || []).length, (next.proposedSlots || []).length);
  if (slotsPending) {
    const justOffered = /\d{1,2}h\d{2}/.test(recentSeya.at(-1) || "") && !/\d{1,2}h\d{2}/.test(reply);
    return goal === "book" && justOffered && !recentSeya.some(softResumed)
      ? withLine(slotsReminder(slotsPending), state.pendingQuestion)
      : result;
  }
  if (recentSeya.some(softResumed)) {
    return result;
  }
  const family =
    resolveActiveFamily(seya, next, text) ||
    inferCareFamily(`${next.qualification?.need || ""} ${next.treatment || ""}`) ||
    "";
  // Étape posée juste avant : un rappel sans question plutôt que la même question.
  const line = recentSeya.some((item) => stepAsked(item))
    ? softResumeLine(goal, family)
    : resumeQuestion(goal, family);
  if (!line) {
    return result;
  }
  return withLine(line, goal === "callback" ? "offer_callback" : "offer_slots");
}

function leadReplyCore(conversation, text, seya, slots, extras = {}) {
  const settings = agentSettings(seya);
  conversation = withStaffOfferedSlots(conversation, extras.now);
  const previousLead = lastSubstantiveLeadText(conversation, text);
  const reread =
    isRereadAsk(text) ||
    isCenterAffirmation(text) ||
    (isOffTopicComplaint(text) &&
      (isBookingThread(conversation) ||
        classifyPriceQuestion(previousLead) ||
        asksPrice(previousLead)));
  const intentText = reread && previousLead ? previousLead : text;
  let bookingState =
    extras.bookingState && !reread
      ? extras.bookingState
      : applyBookingMessage(conversation.bookingState, intentText, {
          centerId: extras.centerId || conversation.centerId,
          now: extras.now,
          conversation,
        });
  const staffSlots = slotsFromStaffThread(conversation, extras.now);
  if (staffSlots.length) {
    const dated = bookingState.requestedDate
      ? staffSlots.filter((slot) => slot.date === bookingState.requestedDate)
      : staffSlots;
    bookingState = {
      ...bookingState,
      lastOfferedSlots: dated.length ? dated : staffSlots,
    };
  }
  conversation = {
    ...conversation,
    centerId: extras.centerId || conversation.centerId || bookingState.centerId,
    bookingState,
    proposedSlots: staffSlots.length ? staffSlots : conversation.proposedSlots,
    _seya: seya,
  };
  const allowRepeat =
    asksOtherDay(intentText) ||
    hasDayOfMonthRequest(intentText) ||
    /lundi|mardi|mercredi|jeudi|vendredi|samedi|debut de semaine|fin de semaine|fin de journee|soir|apres.?midi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
      String(intentText || ""),
    );
  const allowDateFallback = (slots || []).some(
    (slot) => bookingState.requestedDate && slot.date !== bookingState.requestedDate,
  );
  const guarded = extras.guarded && !reread
    ? extras.guarded
    : guardSlots(slots, bookingState, {
        centerId: conversation.centerId,
        allowRepeat,
        allowDateFallback,
      });
  const safeSlots = shouldSearchSlots(bookingState, intentText, conversation)
    ? guarded.slots
    : [];
  const thread = understandThread(conversation, intentText);
  const qualification = mergeQualification(
    {
      ...(conversation.qualification || {}),
      ...(thread.need ? { need: thread.need } : {}),
    },
    intentText,
    conversation.treatment,
    conversation,
  );
  const pool = offeredSlots(conversation, slots);
  const durationMinutes = visitDurationMinutes(
    seya,
    { ...conversation, qualification },
    intentText,
  );
  if (isAlreadyBookedElsewhere(intentText) || isAlreadyBookedElsewhere(text)) {
    // Déclaré par le prospect, pas une réservation vérifiée dans l’agenda Bookea.
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : conversation.status || "En cours",
      text,
      alreadyBookedReply(intentText || text),
      {
        ...bookingState,
        pendingQuestion: "no_slots",
        lastOfferedSlots: [],
        appointmentStatus: "declared_elsewhere",
      },
      {
        proposedSlots: [],
        bookedElsewhere: {
          text: String(intentText || text || "").trim().slice(0, 200),
          at: (extras.now instanceof Date ? extras.now : new Date()).toISOString(),
        },
      },
    );
  }
  const confirmYes = isConfirmingOfferedTime(intentText, conversation);
  const reschedule =
    isRescheduleAsk(intentText) ||
    wantsNoon(intentText) ||
    (isAppointmentConfirmed(conversation) &&
      threadWantsNoon(conversation, intentText) &&
      (isRescheduleAsk(text) || wantsNoon(text)));
  let chosenSlot =
    (isAppointmentConfirmed(conversation) && !confirmYes && !reschedule) ||
    (lastSeyaAskedToSearch(conversation) && isShortYes(intentText) && !reschedule) ||
    (bookingState.pendingQuestion === "no_slots" &&
      !lastSeyaOfferedToBook(conversation) &&
      !reschedule)
      ? null
      : matchProposedSlot(intentText, conversation.proposedSlots, {
          confirmYes,
          date: bookingState.requestedDate,
        }) ||
        matchProposedSlot(intentText, conversation.bookingState?.lastOfferedSlots, {
          confirmYes,
          date: bookingState.requestedDate,
        }) ||
        matchProposedSlot(intentText, offeredSlots(conversation), {
          date: bookingState.requestedDate,
        });
  if (reschedule && (wantsNoon(intentText) || threadWantsNoon(conversation, intentText))) {
    const date =
      conversation.bookedSlot?.date ||
      bookingState.requestedDate ||
      (pool[0] && pool[0].date);
    if (date) {
      chosenSlot = {
        date,
        time: "12:00",
        label: formatSlotLabel(date, "12:00"),
      };
    }
  }
  const refuses = isOptOut(text, conversation);

  if (isWrongCenter(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      "Pas intéressé",
      text,
      wrongCenterReply(extras.now),
      bookingState,
    );
  }

  const crmIntent = crmUpdateFromLeadMessage(text, extras.now, { ...extras, conversation });
  const alreadyBooked =
    isAppointmentConfirmed(conversation) ||
    /rdv pris|rdv confirm/i.test(String(conversation.status || ""));
  if (refuses && !alreadyBooked) {
    return finishLeadReply(
      conversation,
      qualification,
      "Pas intéressé",
      text,
      "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous.",
      { ...bookingState, pendingQuestion: "no_slots", lastOfferedSlots: [] },
      { proposedSlots: [] },
    );
  }
  if (crmIntent && crmIntent.conversationStatus && !alreadyBooked) {
    return finishLeadReply(
      conversation,
      qualification,
      crmIntent.conversationStatus,
      text,
      conversationalReply(text, conversation, qualification, extras.now, {
        durationMinutes,
      }),
      {
        ...bookingState,
        pendingQuestion: "no_slots",
        lastOfferedSlots: [],
      },
      { proposedSlots: [] },
    );
  }

  if (
    isThreadComplaint(text) &&
    !wantsSlots(intentText, conversation) &&
    !asksPrice(text) &&
    !classifyPriceQuestion(text) &&
    !asksLocation(text)
  ) {
    return finishLeadReply(
      conversation,
      qualification,
      "Terminé",
      text,
      "Vous avez raison, c’était bien noté. On vous laisse revenir quand ça vous arrange, je ne vous relance pas.",
      {
        ...bookingState,
        pendingQuestion: "no_slots",
        lastOfferedSlots: [],
      },
      { proposedSlots: [] },
    );
  }

  if (refuses) {
    return finishLeadReply(conversation, qualification, "Pas intéressé", text, "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous.", bookingState);
  }

  const pendingCallback =
    !alreadyBooked &&
    (conversation.bookingState?.pendingQuestion === "callback" ||
      Boolean(conversation.teamNotes?.handedOffAt));
  const goal = pathGoal(seya);
  const pathFamily =
    resolveActiveFamily(seya, { ...conversation, qualification }, intentText) ||
    inferCareFamily(`${qualification.need || ""} ${conversation.treatment || ""}`) ||
    "";
  const at = (extras.now instanceof Date ? extras.now : new Date()).toISOString();
  const givesAvailability =
    !isCourtesyClose(intentText) &&
    (hasDayOfMonthRequest(intentText) ||
      Boolean(parseClockMinutes(intentText).length) ||
      /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|matin|apres-midi|apm|soir|fin de journee|debut de semaine|fin de semaine)\b|\b\d{1,2}\/\d{1,2}\b/.test(
        normalize(intentText),
      ));
  const preference = givesAvailability ? spokenPreference(conversation, intentText, bookingState) : "";
  const withLeadPreference = (next) =>
    givesAvailability
      ? gaillard.withPreference(next, text, at, pendingCallback || goal === "callback" ? "pour être rappelé(e)" : "")
      : next;

  // Rappel déjà enregistré : une disponibilité complète la demande, sans relancer la prise de RDV.
  if (pendingCallback && bookingState.pendingQuestion === "callback" && preference) {
    return {
      ...finishLeadReply(
        withLeadPreference(conversation),
        qualification,
        conversation.status || "À recontacter",
        text,
        `C’est noté : ${preference}. J’ajoute cette préférence à votre demande de rappel.`,
        {
          ...bookingState,
          pendingQuestion: "callback",
          appointmentStatus: "none",
          lastOfferedSlots: [],
        },
        { proposedSlots: [] },
      ),
      locked: true,
    };
  }

  // Accord pour un rappel : enregistrement + transmission (envoi réel côté WhatsApp, annonce corrigée si échec).
  const transmitCallback = (prefix = "") => {
    const next = {
      ...withLeadPreference(conversation),
      teamNotes: {
        ...(withLeadPreference(conversation).teamNotes || {}),
        family: pathFamily,
        need: [qualification.zone, qualification.detail, qualification.need].filter(Boolean).join(" · "),
        handedOffAt: at,
      },
    };
    const transmitted =
      briefClosing(seya, conversation, intentText) ||
      callbackTransmittedReply(pathFamily, preference, extras.now);
    const done = finishLeadReply(
      next,
      qualification,
      "À recontacter",
      text,
      [prefix, transmitted].filter(Boolean).join(" "),
      {
        ...bookingState,
        pendingQuestion: "callback",
        appointmentStatus: "none",
        callbackSlot: callbackSlotFromThread(conversation, intentText, bookingState, null),
        lastOfferedSlots: [],
      },
      { proposedSlots: [] },
    );
    // La réponse prix éventuelle ne doit jamais masquer l’annonce de transmission.
    const messages = done.conversation.messages;
    const shown = String(messages.at(-1)?.text || "");
    const finalText = shown.includes(transmitted) ? shown : `${shown} ${transmitted}`.trim();
    return {
      ...done,
      conversation: {
        ...done.conversation,
        messages: [...messages.slice(0, -1), { ...messages.at(-1), text: finalText }],
      },
      locked: true,
    };
  };

  // Rappel déjà transmis (objectif B) : un rendez-vous demandé sera fixé par l’expert lors du rappel.
  if (
    pendingCallback &&
    goal !== "book" &&
    !alreadyBooked &&
    (wantsSlots(intentText, conversation) ||
      /rendez-vous|\brdv\b|r[ée]serv|cr[ée]neau/i.test(String(intentText || "")))
  ) {
    const words = familyWords(pathFamily);
    return {
      ...finishLeadReply(
        conversation,
        qualification,
        conversation.status || "À recontacter",
        text,
        `Votre demande est déjà transmise : c’est ${words.expert} du centre qui vous rappellera pour fixer votre ${words.visit} avec vous.`,
        { ...bookingState, pendingQuestion: "callback", lastOfferedSlots: [] },
        { proposedSlots: [] },
      ),
      locked: true,
    };
  }

  if (asksForCallback(text) && !alreadyBooked && !isWillCallBack(text) && pendingCallback) {
    return {
      ...finishLeadReply(
        conversation,
        qualification,
        conversation.status || "À recontacter",
        text,
        "Votre demande de rappel est bien enregistrée 😊",
        bookingState,
      ),
      locked: true,
    };
  }

  if (!alreadyBooked && !pendingCallback && !isWillCallBack(text)) {
    const callbackOffered =
      offersCallback(lastSeyaText(conversation)) ||
      conversation.bookingState?.pendingQuestion === "offer_callback";
    const accepts =
      callbackOffered &&
      !isHesitation(text) &&
      !refusesSlots(text) &&
      (isShortYes(text) ||
        /^(oui|ok|d'accord|volontiers|avec plaisir|je veux bien|tres bien|parfait|go)\b/.test(normalize(text)) ||
        asksForCallback(text) ||
        givesAvailability);
    const explicit = asksForCallback(text);
    if (goal === "callback" && (accepts || explicit)) {
      const priceFirst =
        accepts && (asksPrice(text) || classifyPriceQuestion(text))
          ? stripBookingCta(priceReply(seya, qualification, conversation, text))
          : "";
      return transmitCallback(priceFirst);
    }
    // Objectif A : le rappel reste possible sur demande explicite, si le centre l’autorise.
    if (goal !== "callback" && explicit && (settings.handoffToHuman || !canBookSeya(settings))) {
      return transmitCallback();
    }
    // Objectif B seul : un rendez-vous demandé est organisé par l’équipe, sans créneau inventé.
    if (
      goal === "callback" &&
      !callbackOffered &&
      (wantsSlots(intentText, conversation) ||
        /rendez-vous|\brdv\b|r[ée]serv|cr[ée]neau/i.test(String(intentText || "")))
    ) {
      return {
        ...finishLeadReply(
          withLeadPreference(conversation),
          qualification,
          qualification.need ? "Qualifié" : "En cours",
          text,
          teamOrganisesReply(pathFamily, preference),
          { ...bookingState, pendingQuestion: "offer_callback", lastOfferedSlots: [] },
          { proposedSlots: [] },
        ),
        locked: true,
      };
    }
  }

  if (isIdentityQuestion(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      conversationalReply(text, conversation, qualification, extras.now, {
        durationMinutes,
        seya,
      }),
      bookingState,
    );
  }

  if (
    !reschedule &&
    !isCenterAffirmation(text) &&
    !classifyPriceQuestion(intentText) &&
    !asksPrice(intentText) &&
    (isThanks(text, conversation) ||
      isHesitation(text) ||
      refusesSlots(text) ||
      (isAppointmentConfirmed(conversation) && isShortYes(text) && !confirmYes))
  ) {
    const confirmed = isAppointmentConfirmed(conversation);
    const pause = !confirmed && (refusesSlots(text) || isHesitation(text));
    return finishLeadReply(
      conversation,
      qualification,
      confirmed
        ? "Terminé"
        : qualification.need
          ? "Qualifié"
          : conversation.status || "En cours",
      text,
      conversationalReply(text, conversation, qualification, extras.now, {
        durationMinutes,
      }),
      {
        ...bookingState,
        pendingQuestion: pause ? "no_slots" : bookingState.pendingQuestion,
        lastOfferedSlots: confirmed ? [] : bookingState.lastOfferedSlots,
        appointmentStatus: confirmed ? "confirmed" : bookingState.appointmentStatus,
      },
      { proposedSlots: confirmed || pause ? [] : conversation.proposedSlots },
    );
  }

  const health = classifyHealthMessage(text);
  const resolvedHealth = resolveHealthSheet(seya, conversation, text);
  // Mission rappel : l’info santé est notée pour l’équipe, la qualification continue.
  if (health.personal && isQualifyCallback(settings) && !extras.healthNoted) {
    const review = startHealthReview(
      conversation,
      text,
      resolvedHealth,
      health.mixed ? "mixed" : "personal",
    );
    const next = applyLeadReply(conversation, text, seya, slots, {
      ...extras,
      healthNoted: true,
    });
    return withCallbackHealthNote(next, review);
  }

  if (health.personal && !extras.healthNoted) {
    const parts = [];
    if (asksPrice(text) || classifyPriceQuestion(text)) {
      parts.push(
        stripBookingCta(priceReply(seya, qualification, conversation, text)),
      );
    }
    if (asksLocation(text) || asksAccess(text)) {
      parts.push(centerPlaceReply(text, extras, seya));
    }
    parts.push(personalHealthReply(resolvedHealth));
    const review = startHealthReview(
      conversation,
      text,
      resolvedHealth,
      health.mixed ? "mixed" : "personal",
    );
    return finishLeadReply(
      conversation,
      qualification,
      "Revue santé",
      text,
      parts.filter(Boolean).join(" "),
      { ...bookingState, pendingQuestion: health.mixed ? "price" : "health" },
      review,
    );
  }

  if (health.general) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : conversation.status || "En cours",
      text,
      generalHealthReply(resolvedHealth),
      { ...bookingState, pendingQuestion: "health" },
    );
  }

  if (isAwaitingHealthReview(conversation) && !isQualifyCallback(settings)) {
    if (isOffTopicComplaint(text)) {
      return finishLeadReply(
        conversation,
        qualification,
        "Revue santé",
        text,
        `Vous avez raison, j’ai répondu à côté. ${awaitingHealthReply()}`,
        bookingState,
        {
          healthReview: conversation.healthReview,
          healthTask: conversation.healthTask,
        },
      );
    }
    if (asksLocation(text) || asksAccess(text) || asksPrice(text) || classifyPriceQuestion(text) || faqReply(text, { seya, conversation: { ...conversation, qualification } })) {
      const admin =
        faqReply(text, { seya, conversation: { ...conversation, qualification } }) ||
        (asksLocation(text) || asksAccess(text)
          ? centerPlaceReply(text, extras, seya)
          : priceReply(seya, qualification, conversation, text));
      return finishLeadReply(
        conversation,
        qualification,
        "Revue santé",
        text,
        admin,
        bookingState,
        {
          healthReview: conversation.healthReview,
          healthTask: conversation.healthTask,
        },
      );
    }
    const declines =
      isLeadRefusal(text, conversation) ||
      /^(non|non merci|pas besoin|ca ira|ça ira)\b|\b(ca|ça) ira\b|pas la peine/.test(normalize(text));
    return finishLeadReply(
      conversation,
      qualification,
      "Revue santé",
      text,
      declines
        ? "Très bien, je n’insiste pas 😊 L’équipe devra simplement vérifier votre situation avant toute séance. Si vous changez d’avis, écrivez-nous ici."
        : isThanks(text, conversation)
          ? "Avec plaisir 😊"
          : awaitingHealthReply(),
      bookingState,
      {
        healthReview: conversation.healthReview,
        healthTask: conversation.healthTask,
      },
    );
  }

  if (
    asksPrice(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    asksPrice(intentText) ||
    classifyPriceQuestion(intentText) ||
    isPriceRepeatComplaint(intentText)
  ) {
    const reply = priceReply(seya, qualification, conversation, intentText);
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      withRereadPrefix(
        isRereadAsk(text) || isOffTopicComplaint(text),
        reply,
      ),
      markPriceAnswered({ ...bookingState, pendingQuestion: "price" }),
    );
  }

  const service = serviceOfferReply(text, seya, conversation);
  if (service) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : conversation.status || "En cours",
      text,
      service,
      bookingState,
    );
  }

  const faq = faqReply(text, { seya, conversation: { ...conversation, qualification } });
  if (faq) {
    const slotsPending = conversation.status === "RDV proposé" && (bookingState.lastOfferedSlots || []).length > 0;
    return finishLeadReply(
      conversation,
      qualification,
      slotsPending ? "RDV proposé" : qualification.need ? "Qualifié" : "En cours",
      text,
      faq,
      {
        ...bookingState,
        pendingQuestion: /^offer_(slots|callback)$/.test(bookingState.pendingQuestion || "")
          ? bookingState.pendingQuestion
          : null,
      },
    );
  }

  if (asksLocation(text) || asksAccess(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      centerPlaceReply(text, extras, seya),
      { ...bookingState, pendingQuestion: "address" },
    );
  }

  if (
    settings.handoffToHuman &&
    /conseill|parler (a|à) (un |une )?(humain|quelqu|personne)/i.test(text) &&
    !wantsSlots(intentText, conversation)
  ) {
    return finishLeadReply(
      conversation,
      qualification,
      "À recontacter",
      text,
      "Bien sûr, je transmets à une conseillère du centre. Elle reprendra avec vous.",
      { ...bookingState, pendingQuestion: "callback", callbackSlot: null, lastOfferedSlots: [] },
      { proposedSlots: [] },
    );
  }

  if (isWelcomeRelanceOnly(settings)) {
    if (
      wantsSlots(intentText, conversation) ||
      isBookingThread(conversation) ||
      /rendez-vous|\brdv\b|prendre rendez|un creneau|un créneau/i.test(intentText)
    ) {
      return finishLeadReply(
        conversation,
        qualification,
        "À recontacter",
        text,
        briefClosing(seya, conversation, intentText) || welcomeRelanceHandoffReply(),
        { ...bookingState, pendingQuestion: "callback", callbackSlot: null, lastOfferedSlots: [] },
        { proposedSlots: [] },
      );
    }
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : conversation.status || "En cours",
      text,
      fallbackAfterNote(qualification, conversation, text),
      bookingState,
    );
  }

  if (
    isQualifyCallback(settings) &&
    !pendingCallback &&
    (givesAvailability || wantsSlots(intentText, conversation))
  ) {
    return {
      ...finishLeadReply(
        withLeadPreference(conversation),
        qualification,
        qualification.need ? "Qualifié" : "En cours",
        text,
        teamOrganisesReply(pathFamily, preference),
        { ...bookingState, pendingQuestion: "offer_callback", lastOfferedSlots: [] },
        { proposedSlots: [] },
      ),
      locked: true,
    };
  }

  const staffOwned = Boolean(
    chosenSlot &&
      staffSlots.some(
        (slot) => slot.date === chosenSlot.date && slot.time === chosenSlot.time,
      ),
  );
  if (
    chosenSlot &&
    canBookSeya(settings) &&
    !threadHasMedical(conversation, text) &&
    (slotAllowed(chosenSlot, bookingState) || staffOwned || reschedule)
  ) {
    const occupancy = (extras.appointments || []).filter((appointment) => {
      const own = conversation.bookedSlot;
      if (!reschedule || !own) {
        return true;
      }
      const start = String(appointment.start || appointment.starts_at || "").slice(0, 5);
      return !(
        String(appointment.date || "").slice(0, 10) === String(own.date || "").slice(0, 10) &&
        start === String(own.time || "").slice(0, 5)
      );
    });
    if (
      occupancy.length &&
      !staffOwned &&
      isSlotBusy(occupancy, chosenSlot.date, chosenSlot.time)
    ) {
      const remaining = remainingOfferedSlots(
        offeredSlots(conversation, slots),
        occupancy,
        chosenSlot,
      );
      return finishLeadReply(
        conversation,
        qualification,
        "RDV proposé",
        text,
        remaining.length
          ? `Ce créneau n’est plus disponible. ${humanSlotReply(remaining, bookingState)}`
          : "Ce créneau n’est plus disponible. Souhaitez-vous que je regarde un autre horaire ?",
        {
          ...bookingState,
          lastOfferedSlots: remaining,
          appointmentStatus: "proposed",
          pendingQuestion: "offer_slots",
        },
        { proposedSlots: remaining },
      );
    }
    return finishLeadReply(
      conversation,
      qualification,
      "RDV pris",
      text,
      withRereadPrefix(
        reread,
        reschedule
          ? `Parfait, je décale votre rendez-vous à ${String(chosenSlot.time).replace(":", "h")} et je vous confirme tout de suite.`
          : isConfirmingOfferedTime(intentText, conversation)
            ? checkingSlotReply()
            : `Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊`,
      ),
      { ...bookingState, appointmentStatus: "proposed" },
      {
        bookedSlot: chosenSlot,
        shouldBook: { ...chosenSlot, duration: durationMinutes },
        staffOwned: staffOwned || reschedule,
      },
    );
  }

  if (
    /pas (dispo|disponible) le |pas le /.test(normalize(text)) &&
    bookingState.lastOfferedSlots.length &&
    bookingState.requestedDate &&
    bookingState.lastOfferedSlots.every((slot) => slot.date === bookingState.requestedDate)
  ) {
    const refused = /lundi/.test(normalize(text))
      ? "le lundi"
      : "ce jour-là";
    return finishLeadReply(
      conversation,
      qualification,
      "RDV proposé",
      text,
      `D’accord, pas ${refused}. On reste sur le jour demandé — quel horaire vous irait ?`,
      bookingState,
      { proposedSlots: bookingState.lastOfferedSlots },
    );
  }

  const readyToPropose =
    canBookSeya(settings) &&
    wantsSlots(intentText, conversation) &&
    shouldSearchSlots(bookingState, intentText, conversation) &&
    !asksPrice(text) &&
    !classifyPriceQuestion(text) &&
    !isPriceRepeatComplaint(text) &&
    !bookingState.unansweredPriceIntent &&
    !asksLocation(text) &&
    !asksAccess(text) &&
    !faqReply(text, { seya, conversation: { ...conversation, qualification } }) &&
    !threadHasMedical(conversation, text) &&
    Boolean(qualification.need || conversation.treatment) &&
    !isJunkTreatment(qualification.need || conversation.treatment);

  if (readyToPropose && safeSlots.length === 0) {
    return finishLeadReply(
      conversation,
      qualification,
      "Qualifié",
      text,
      withRereadPrefix(
        reread,
        guarded.fallback || emptySlotFallback(bookingState),
      ),
      {
        ...bookingState,
        lastOfferedSlots: [],
        appointmentStatus: "none",
        pendingQuestion: "offer_slots",
      },
      { proposedSlots: [] },
    );
  }

  if (readyToPropose && safeSlots.length > 0) {
    const ack = firstNeedReply(intentText, conversation, qualification, {
      durationMinutes,
      skipBookingCta: true,
      skipConsultative: true,
      seyaMission: resolveSeyaMission(seya),
      seya,
      centerName: extras.centerName,
    });
    const slotsText = humanSlotReply(safeSlots, bookingState);
    const body =
      ack &&
      !alreadyTold(
        conversation,
        "quand seriez-vous disponible|protocole à votre peau|solutions qui peuvent|diagnostic permettra",
      )
        ? `${ack} ${slotsText}`
        : slotsText;
    return finishLeadReply(
      conversation,
      qualification,
      "RDV proposé",
      text,
      withRereadPrefix(reread, body),
      {
        ...bookingState,
        lastOfferedSlots: safeSlots,
        appointmentStatus: "proposed",
        pendingQuestion: null,
      },
      { proposedSlots: safeSlots },
    );
  }

  if (isOffTopicComplaint(text)) {
    const previous = lastSubstantiveLeadText(conversation, text);
    const previousHealth = classifyHealthMessage(previous);
    if (previousHealth.personal && !isQualifyCallback(settings)) {
      const resolved = resolveHealthSheet(seya, conversation, previous);
      const review = startHealthReview(conversation, previous, resolved, "personal");
      return finishLeadReply(
        conversation,
        qualification,
        "Revue santé",
        text,
        `Vous avez raison, j’ai répondu à côté. ${personalHealthReply(resolved)}`,
        { ...bookingState, pendingQuestion: "health" },
        review,
      );
    }
    if (asksLocation(previous) || asksAccess(previous)) {
      return finishLeadReply(
        conversation,
        qualification,
        qualification.need ? "Qualifié" : "En cours",
        text,
        `Vous avez raison. ${centerPlaceReply(previous, extras, seya)}`,
        { ...bookingState, pendingQuestion: "address" },
      );
    }
    if (asksPrice(previous) || classifyPriceQuestion(previous)) {
      return finishLeadReply(
        conversation,
        qualification,
        qualification.need ? "Qualifié" : "En cours",
        text,
        `Vous avez raison. ${priceReply(seya, qualification, conversation, previous)}`,
        markPriceAnswered({ ...bookingState, pendingQuestion: "price" }),
      );
    }
    return finishLeadReply(
      conversation,
      qualification,
      conversation.status || "En cours",
      text,
      "Vous avez raison, j’ai répondu à côté. Reposez votre question, je la prends tout de suite.",
      bookingState,
    );
  }

  const nextQuestion =
    nextQualificationQuestion(
      qualification,
      seya,
      conversation.treatment,
      conversation,
      text,
      extras.now,
      extras,
    ) || fallbackAfterNote(qualification, conversation, text);
  return finishLeadReply(
    conversation,
    qualification,
    qualification.need ? "Qualifié" : "En cours",
    text,
    nextQuestion,
    bookingState,
  );
}

const GAILLARD_MINCEUR_OBJECTIF =
  /perdre|perde|perd\b|maigrir|mincir|kilos?|\bkg\b|cellulite|peau d'orange|graisse|bourrelet|capiton|affiner|tonifier|raffermir|fermete|silhouette|gonfl|ballonn/;
const GAILLARD_MINCEUR_ZONE =
  /ventre|cuisse|hanche|fesse|bras|culotte de cheval|poignee d'amour|dos|jambes?/;
const GAILLARD_VISAGE_CONCERN =
  /ride|ridule|acne|bouton|tache|eclat|relach|teint|cerne|pore|fermete|hydrat|rajeun|terne|peau (seche|grasse|sensible)|rougeur|cicatrice|double menton|ovale|ferme/;
const GAILLARD_EPILATION_ZONE =
  /jambe|maillot|intime|parties? intimes?|aisselle|bras|levre|menton|visage|dos|fesse|ventre|cuisse|torse|barbe|sourcil|nuque|epaule|pied|main|sillon|integral|bresilien|corps entier|joue|favori/;
const GAILLARD_TRIED =
  /deja (fait|essaye|teste)|jamais (fait|essaye|teste)|premiere fois|a part |aucun(e)? (soin|solution|methode|traitement)|j'ai (fait|essaye|teste) (des?|du|de la|un|une|le|la|plusieurs) (regime|soin|seance|laser|cryo|epil|cire|massage|traitement|methode|solution|lumiere|presso|radiofrequence|drainage)|rien (fait|essaye|teste|de special)|pas (encore )?(teste|essaye)/;
const GAILLARD_KILOS_UNKNOWN =
  /je ne (sais|ses|cet|cest|sait) pas|je (sais|ses|cet) pas|aucune idee|pas (d'|de )?idee|pas (de )?chiffre|je (ne )?connais pas|je verr?(ai|ais) (ca |sa )?(avec vous|ensemble|sur place|au (bilan|centre))|on verra (ca |sa )?(avec vous|ensemble)/;

/** « Perdre » / « affiner » seuls ne répondent pas à « déjà testé ». */
function looksLikeObjectifOnly(text) {
  const value = normalize(text)
    .replace(/[!.,;:?…)(-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value || value.length > 40) {
    return false;
  }
  if (
    GAILLARD_TRIED.test(value) ||
    /^(oui|non)\b/.test(value) ||
    /\d/.test(value) ||
    /aimerais|voudrais|souhaite|kilos?|\bkg\b/.test(value)
  ) {
    return false;
  }
  if (/^(perdre|perde|perd|affiner|raffermir|maigrir|mincir|tonifier)(\s+\w+){0,3}$/.test(value)) {
    return true;
  }
  return (
    GAILLARD_MINCEUR_OBJECTIF.test(value) &&
    !GAILLARD_MINCEUR_ZONE.test(value) &&
    value.split(" ").length <= 3
  );
}

function gaillardLeadTexts(conversation, text) {
  return [
    ...(conversation?.messages || [])
      .filter((item) => item.author === "lead")
      .map((item) => String(item.text || "")),
    String(text || ""),
  ].map(normalize);
}

function gaillardMinceurZonesKnown(qualification, leadTexts) {
  if (qualification.zone && GAILLARD_MINCEUR_ZONE.test(normalize(qualification.zone))) {
    return true;
  }
  return leadTexts.some((value) => GAILLARD_MINCEUR_ZONE.test(value));
}

function gaillardMinceurObjectifKnown(qualification, leadTexts) {
  const detail = normalize(qualification.detail || "");
  if (detail && GAILLARD_MINCEUR_OBJECTIF.test(detail)) {
    return true;
  }
  return leadTexts.some((value) => GAILLARD_MINCEUR_OBJECTIF.test(value));
}

function gaillardDetailKnown(family, qualification, leadTexts) {
  if (family === "minceur") {
    return (
      gaillardMinceurZonesKnown(qualification, leadTexts) &&
      gaillardMinceurObjectifKnown(qualification, leadTexts)
    );
  }
  if (qualification.zone || qualification.detail) {
    return true;
  }
  const pattern =
    family === "visage"
      ? GAILLARD_VISAGE_CONCERN
      : family === "epilation"
        ? GAILLARD_EPILATION_ZONE
        : null;
  return Boolean(pattern && leadTexts.some((value) => pattern.test(value)));
}

const GAILLARD_WEIGHT_LOSS =
  /perdre (du |de |des |quelques )?(poids|kilos?|kg)|maigrir|perte de poids|kilos? en trop|mincir/;
const GAILLARD_KILOS_GIVEN =
  /\d+\s*(kg|kilos?)\b|(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente) (kg|kilos?)\b|non chiffre/;

function gaillardMostlyBloating(leadTexts) {
  const bloating = leadTexts.some((value) => /gonfl|ballonn/.test(value));
  const weightLoss = leadTexts.some((value) => GAILLARD_WEIGHT_LOSS.test(value));
  return bloating && !weightLoss;
}

function gaillardNextQuestion(family, qualification, leadTexts, seya) {
  if (!family) {
    return { step: "axis", text: axisClarifyQuestion(seya) || gaillard.needQuestion("") };
  }
  if (family === "minceur") {
    const hasZones = gaillardMinceurZonesKnown(qualification, leadTexts);
    const hasObjectif = gaillardMinceurObjectifKnown(qualification, leadTexts);
    if (!hasZones && !hasObjectif) {
      return { step: "need", text: gaillard.needQuestion("minceur") };
    }
    if (!hasObjectif) {
      return { step: "need", text: gaillard.needQuestion("minceur", "objectif") };
    }
    if (!hasZones) {
      return { step: "need", text: gaillard.needQuestion("minceur", "zones") };
    }
  } else if (!gaillardDetailKnown(family, qualification, leadTexts)) {
    return { step: "need", text: gaillard.needQuestion(family) };
  }
  // Une fois le bilan proposé, on ne revient pas en arrière (kilos, zones, déjà testé).
  if (family === "minceur" && qualification.pathOffered) {
    return null;
  }
  // Ballonnement ≠ objectif « kilos à perdre » : on ne force pas la question kilos.
  if (
    family === "minceur" &&
    !qualification.kilos &&
    !gaillardMostlyBloating(leadTexts) &&
    leadTexts.some((value) => GAILLARD_WEIGHT_LOSS.test(value)) &&
    !leadTexts.some((value) => GAILLARD_KILOS_GIVEN.test(value))
  ) {
    return { step: "kilos", text: gaillard.kilosQuestion() };
  }
  if (!qualification.tried && !leadTexts.some((value) => GAILLARD_TRIED.test(value))) {
    return { step: "tried", text: gaillard.triedQuestion(family) };
  }
  // Minceur : après « déjà testé », on enchaîne sur la fiche (appli / alimentaire / bilan), sans clôturer.
  if (family === "minceur" && !qualification.pathOffered) {
    return { step: "path", text: "" };
  }
  return null;
}

function withGaillardText(result, family, fallback) {
  const messages = [...(result.conversation?.messages || [])];
  const index = messages.map((item) => item.author).lastIndexOf("seya");
  if (index >= 0) {
    const safe = gaillard.safeGaillardText(messages[index].text, family) || fallback;
    messages[index] = { ...messages[index], text: safe };
  }
  return {
    ...result,
    shouldBook: null,
    conversation: { ...result.conversation, messages },
  };
}

function epilationPriceText(reply) {
  const current = String(reply || "").trim();
  const base =
    !current || current === unknownPriceReply() || /pas ce tarif en fiche/i.test(current)
      ? gaillard.missingPriceReply()
      : current;
  if (/promotion/i.test(base)) {
    return base;
  }
  const question = base.match(/^(.*[.!😊])\s+([^.!?]*\?)$/u);
  return question
    ? `${question[1]} ${gaillard.promoSentence()} ${question[2]}`
    : `${base} ${gaillard.promoSentence()}`;
}

// Gaillard : accueil → besoin → déjà testé → (minceur : fiche + bilan) → rappel. Jamais de créneau.
function gaillardLeadReply(conversation, text, seya, slots, extras = {}) {
  const at = (extras.now instanceof Date ? extras.now : new Date()).toISOString();
  const base = { ...withStaffOfferedSlots(conversation, extras.now), _seya: seya };
  // Une question du prospect n’est pas une réponse au parcours : elle ne change ni le soin
  // suivi, ni la qualification, et ne peut pas déclencher la transmission.
  const asking =
    isServiceAsk(text) ||
    asksOpenQuestion(text) ||
    gaillard.asksTechnology(text) ||
    gaillard.asksProcess(text);
  const thread = understandThread(base, asking ? "" : text);
  const merged = asking
    ? { ...(base.qualification || {}) }
    : {
        ...(base.qualification || {}),
        ...mergeQualification(
          { ...(base.qualification || {}), ...(thread.need ? { need: thread.need } : {}) },
          text,
          base.treatment,
          base,
        ),
        tried: base.qualification?.tried || "",
        distance: base.qualification?.distance || "",
      };
  const familyText = asking ? "" : text;
  const family =
    resolveActiveFamily(seya, { ...base, qualification: merged }, familyText) ||
    inferCareFamily(`${merged.need || ""} ${base.treatment || ""} ${familyText}`) ||
    base.teamNotes?.family ||
    (asking ? inferCareFamily(text) : "") ||
    "";
  const topicFamily = (asking && inferCareFamily(text)) || family;
  const bookingState = base.bookingState || emptyBookingState(extras.centerId || base.centerId);
  const handedOff = Boolean(base.teamNotes?.handedOffAt);
  const status = handedOff
    ? base.status || "À recontacter"
    : merged.need
      ? "Qualifié"
      : "En cours";
  const pendingQuestion = () => {
    if (handedOff || merged.declined) {
      return "";
    }
    const pending = gaillardNextQuestion(
      family,
      merged,
      gaillardLeadTexts(base, asking ? "" : text),
      seya,
    );
    if (pending?.step === "path" || (!pending && family === "minceur" && merged.pathOffered)) {
      return gaillard.pathQuestion();
    }
    return pending?.text || "";
  };
  const withPending = (reply) => {
    const body = String(reply || "").trim();
    const pending = body.includes("?") ? "" : pendingQuestion();
    return [body, pending].filter(Boolean).join(" ");
  };
  const followUp = () => pendingQuestion() || gaillard.keepConversationReply(family);
  const delegate = (fallback) => {
    const inner = withGaillardText(
      applyLeadReply(base, text, seya, slots, { ...extras, gaillardInner: true }),
      family,
      fallback || followUp(),
    );
    const innerStatus = inner.conversation.status;
    return {
      ...inner,
      conversation: {
        ...inner.conversation,
        status: handedOff && /^(Qualifié|En cours)$/.test(innerStatus) ? status : innerStatus,
        qualification: {
          ...merged,
          ...(inner.conversation.qualification || {}),
          tried: merged.tried,
          distance: merged.distance,
        },
      },
    };
  };
  const fixed = (next, nextStatus, reply, state = bookingState) => ({
    ...finishLeadReply(next, merged, nextStatus, text, reply, state),
    shouldBook: null,
    locked: true,
  });
  // Réponse à la question posée, puis la prochaine question utile du parcours.
  const answer = (reply, next = base) => fixed(next, status, withPending(reply));
  // Réponse tirée de la fiche : le modèle peut la rédiger à partir de la fiche, les faits servent de brouillon.
  const informed = (reply, next = base) => ({
    ...answer(reply, next),
    locked: false,
  });

  if (gaillard.mentionsOtherClinicVisit(text)) {
    return answer(gaillard.otherClinicCompareReply());
  }

  if (
    isOptOut(text, base) ||
    isWrongCenter(text) ||
    isOutOfZone(text) ||
    isThreadComplaint(text) ||
    isAlreadyBookedElsewhere(text) ||
    isWillComeBack(text) ||
    isWillCallBack(text)
  ) {
    return delegate();
  }

  if (gaillard.asksIfAi(text, isIdentityQuestion)) {
    return answer(gaillard.identityReply());
  }

  const health = classifyHealthMessage(text);
  if (health.personal && !extras.healthNoted) {
    const review = startHealthReview(
      base,
      text,
      resolveHealthSheet(seya, base, text),
      health.mixed ? "mixed" : "personal",
    );
    // Après transmission, on note la santé sans bloquer plus tard les questions pratiques.
    // Pendant la qualification, on continue le parcours en préfixant la note santé.
    if (handedOff) {
      const noted = fixed(base, status, gaillard.healthNotedReply());
      return {
        ...noted,
        conversation: {
          ...noted.conversation,
          healthReview: review.healthReview,
          healthTask: review.healthTask,
        },
      };
    }
    const next = gaillardLeadReply(conversation, text, seya, slots, {
      ...extras,
      healthNoted: true,
    });
    return withCallbackHealthNote(next, review, gaillard.healthNotedReply());
  }
  if (health.general && !extras.healthNoted) {
    return delegate();
  }

  const profile = normalizeCenterProfile(
    extras?.centerProfile || agentSettings(seya).centerProfile,
  );
  const brief =
    (topicFamily !== family && findTreatmentBrief(seya, text, topicFamily)) ||
    findTreatmentBrief(seya, `${merged.need || ""} ${base.treatment || ""}`, family) ||
    findTreatmentBrief(seya, base.treatment, family);
  const sourceBag = [brief?.brief, seya?.brief, profile.activity, profile.extras];
  const priceFamily =
    inferCareFamily(text) ||
    family ||
    inferCareFamily(`${merged.need || ""} ${base.treatment || ""}`);

  const priceFollowUp =
    handedOff &&
    /pour l[' ]epilation|pour le laser|et (pour )?l[' ]epilation|epilation laser/.test(
      normalize(text),
    ) &&
    (asksPrice(lastOtherLeadText(base, text)) ||
      classifyPriceQuestion(lastOtherLeadText(base, text)));
  // « Ok je vais faire la séance gratuit » = acceptation du bilan, pas une question tarif.
  const softPathAccept =
    !/\?/.test(String(text || "")) &&
    !/prix|tarif|coute|cout|combien/.test(normalize(text)) &&
    (/(seance|bilan) (gratuit|offert)/.test(normalize(text)) ||
      /je (vais|veux) (bien )?(faire |venir )?(pour )?(le |la |l')?(bilan|seance|decouverte)/.test(
        normalize(text),
      ));
  if (!softPathAccept && (gaillard.asksTrialWhen(text) || gaillard.asksDiscoveryFree(text))) {
    const offer = `${base.offerLabel || ""} ${brief?.pricing?.bilan || ""} ${brief?.pricing?.discovery || ""}`;
    const known = gaillard.asksTrialWhen(text)
      ? gaillard.trialWhenReply(brief?.pricing || {}, offer)
      : gaillard.discoveryOfferedReply(brief?.pricing || {}, offer) ||
        "Oui, le bilan et la séance découverte d’environ 20 minutes sont offerts.";
    return answer(known.includes("?") ? known : `${known} ${gaillard.pathQuestion()}`);
  }
  // Prix cryo demandé sans tarif séance cryo en fiche → ne pas présenter le forfait 500 € comme prix cryo.
  if (
    !softPathAccept &&
    /cryo|cryolipolyse/.test(normalize(text)) &&
    (asksPrice(text) || classifyPriceQuestion(text)) &&
    !/\d+\s*€/.test(String(brief?.pricing?.session || ""))
  ) {
    return answer(gaillard.cryoPriceUnknownReply());
  }
  if (
    !softPathAccept &&
    (asksPrice(text) ||
      classifyPriceQuestion(text) ||
      isPriceRepeatComplaint(text) ||
      priceFollowUp ||
      gaillard.asksSessionCount(text) ||
      gaillard.asksPermanence(text))
  ) {
    const priceText = priceFollowUp
      ? `${text} c'est combien`
      : text;
    const priced =
      asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text) || priceFollowUp
        ? priceReply(seya, merged, { ...base, _seya: seya }, priceText)
        : "";
    const spoken = [
      priced,
      gaillard.asksSessionCount(text) && !/8 séances/.test(priced)
        ? gaillard.sessionCountReply(topicFamily || priceFamily, sourceBag)
        : "",
      gaillard.asksPermanence(text)
        ? gaillard.permanenceReply(topicFamily || priceFamily)
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (spoken) {
      return (inferCareFamily(priceText) || priceFamily) === "epilation"
        ? { ...answer(epilationPriceText(spoken)), locked: true }
        : answer(spoken);
    }
  }

  if (gaillard.modalityTopic(text)) {
    const validated = gaillard.validatedModality(text, sourceBag);
    return validated ? informed(validated) : answer(gaillard.modalityReply());
  }

  if (
    /combien de temps|ca dure|duree|dure (le |la )?(rdv|bilan|rendez-vous|decouverte|seance)/.test(
      normalize(text),
    ) &&
    !/resultat/.test(normalize(text))
  ) {
    const spoken = gaillard.durationReply(topicFamily, text);
    return spoken ? answer(spoken) : delegate();
  }

  if (asksLocation(normalize(text)) || asksAccess(normalize(text))) {
    return answer(centerPlaceReply(normalize(text), extras, seya));
  }

  if (gaillard.asksChildCompanion(text)) {
    return informed(gaillard.childCompanionReply(sourceBag));
  }

  if (gaillard.asksLanguageHelp(text)) {
    return answer(gaillard.languageBarrierReply());
  }

  if (gaillard.asksWhiteHairLaser(text)) {
    if (
      !merged.tried &&
      /jamais (fait|essaye|teste)|premiere fois|\bnon\b.{0,40}jamais/.test(normalize(text))
    ) {
      merged.tried = String(text || "").trim().slice(0, 160);
    }
    const zoneFromThread = gaillardLeadTexts(base, "")
      .map((value) => {
        const hit = value.match(
          /\b(intime|maillot|aisselles?|jambes?|bras|levre|menton|visage|dos)\b/,
        );
        return hit ? hit[1] : "";
      })
      .find(Boolean);
    const zoneLabel = String(merged.zone || base.qualification?.zone || zoneFromThread || "").trim();
    return answer(gaillard.whiteHairLaserReply(text, zoneLabel));
  }

  if (gaillard.asksDeviceCompare(text)) {
    const compared = gaillard.deviceCompareReply(text, sourceBag);
    if (compared) {
      return answer(compared);
    }
  }

  if (gaillard.asksBookingNow(text)) {
    return answer(gaillard.bookingCapabilityReply(handedOff));
  }

  if (gaillard.asksProcess(text)) {
    return informed(gaillard.processReply(topicFamily, sourceBag));
  }

  if (gaillard.asksTechnology(text)) {
    return informed(gaillard.technologyReply(text, sourceBag, { family: topicFamily, zone: merged.zone }));
  }

  const mentionsAvailability = gaillard.availabilityMention(text);
  let next = mentionsAvailability ? gaillard.withPreference(base, text, at) : base;
  if (
    !mentionsAvailability &&
    crmUpdateFromLeadMessage(text, extras.now, { ...extras, conversation: base })
  ) {
    return delegate();
  }

  // Pendant la qualification, les réponses au parcours passent avant FAQ / services.
  const askedPath = gaillard.lastSeyaAskedPath(base);
  const wantsCallback =
    gaillard.acceptsContinue(text) &&
    (askedPath ||
      merged.pathOffered ||
      /bilan|rappel|(seance|bilan) (gratuit|offert)|decouverte/.test(normalize(text)));
  if (!handedOff && !asking && (!merged.declined || wantsCallback)) {
    const qualification = { ...merged };
    const said = String(text || "").trim().slice(0, 160);
    if (askedPath ? gaillard.declinesOffer(text) : gaillard.refusesToContinue(text)) {
      return {
        ...finishLeadReply(
          next,
          { ...qualification, declined: true },
          status,
          text,
          gaillard.declinedReply(family),
          bookingState,
        ),
        shouldBook: null,
        locked: true,
      };
    }
    if (wantsCallback) {
      qualification.pathOffered = true;
      qualification.declined = false;
    }
    if (
      gaillard.lastSeyaAskedNeed(base) &&
      !qualification.zone &&
      !qualification.detail &&
      !mentionsAvailability &&
      gaillard.isAnswerLike(text)
    ) {
      qualification.detail = said;
    }
    if (
      gaillard.lastSeyaAskedTried(base) &&
      !qualification.tried &&
      !looksLikeObjectifOnly(text) &&
      (/^(oui|non)\b/.test(normalize(text)) ||
        (!mentionsAvailability && gaillard.isAnswerLike(text)))
    ) {
      qualification.tried = said;
    }
    if (
      gaillard.lastSeyaAskedKilos(base) &&
      !qualification.kilos &&
      (/\d/.test(text) ||
        GAILLARD_KILOS_UNKNOWN.test(normalize(text)) ||
        (!mentionsAvailability && gaillard.isAnswerLike(text)))
    ) {
      qualification.kilos = GAILLARD_KILOS_UNKNOWN.test(normalize(text))
        ? "non chiffré"
        : said;
    }
    const leadTexts = gaillardLeadTexts(base, text);
    const upcoming = gaillardNextQuestion(family, qualification, leadTexts, seya);
    const nextQuestion =
      wantsCallback && upcoming && !["need", "axis"].includes(upcoming.step) ? null : upcoming;
    const prefix = mentionsAvailability ? gaillard.preferenceNotedPrefix() : "";
    const ask = (question) =>
      ({
        ...finishLeadReply(
          next,
          qualification,
          status,
          text,
          [prefix, question].filter(Boolean).join(" "),
          bookingState,
        ),
        shouldBook: null,
        // Verrouillé : le polish IA ne doit pas remplacer une question ouverte par « un expert rappellera ».
        locked: true,
      });

    if (gaillard.lastSeyaAskedTried(base) && !qualification.tried && looksLikeObjectifOnly(text)) {
      if (!qualification.detail) {
        qualification.detail = said;
      }
      return ask(gaillard.triedObjectifAckReply(family));
    }

    // Ballonnement : noter sans transformer en objectif kilos, puis poursuivre.
    if (
      gaillard.describesBloating(text) &&
      !extras.bloatingNoted &&
      !qualification.bloatingNoted
    ) {
      qualification.bloatingNoted = true;
      const afterBloat = gaillardNextQuestion(family, qualification, leadTexts, seya);
      const follow =
        afterBloat?.step === "path"
          ? gaillard.minceurPathReply(sourceBag, brief?.pricing || {})
          : afterBloat?.text || gaillard.triedQuestion(family);
      return ask(`${gaillard.bloatingNotedReply()} ${follow}`.trim());
    }

    // Intérêt soft (« ça peut faire du bien ») : reprendre la proposition de bilan, sans clôturer.
    if (gaillard.expressesInterest(text) && (askedPath || qualification.pathOffered || family === "minceur")) {
      qualification.pathOffered = true;
      return ask(
        [gaillard.minceurPathFacts(sourceBag, brief?.pricing || {}), gaillard.pathQuestion()]
          .filter(Boolean)
          .join(" "),
      );
    }

    // Méthodes déjà testées (drainage, rééquilibrage…) après la proposition de bilan : noter, reposer le path.
    if ((askedPath || qualification.pathOffered) && !wantsCallback) {
      const notedTried = gaillard.noteTriedMethodsReply(text);
      if (notedTried) {
        qualification.tried = qualification.tried || said;
        qualification.pathOffered = true;
        return ask(`${notedTried} ${gaillard.pathQuestion()}`);
      }
    }

    if (
      nextQuestion?.step === "path" &&
      (gaillard.lastSeyaAskedNeed(base) || gaillard.lastSeyaAskedKilos(base)) &&
      !gaillard.lastSeyaAskedTried(base) &&
      !GAILLARD_TRIED.test(normalize(text))
    ) {
      return ask(gaillard.triedQuestion(family));
    }

    if (nextQuestion?.step === "path") {
      qualification.pathOffered = true;
      return ask(gaillard.minceurPathReply(sourceBag, brief?.pricing || {}));
    }

    if (nextQuestion) {
      const previousSeya =
        [...(base.messages || [])].reverse().find((item) => item.author === "seya")?.text || "";
      return ask(gaillard.varyQuestion(nextQuestion.text, previousSeya));
    }

    // Transmission seulement si le prospect accepte le bilan (minceur) ou au bout du parcours hors minceur.
    const mayClose = family !== "minceur" || wantsCallback;
    if (!mayClose) {
      return ask(gaillard.pathQuestion());
    }

    next = {
      ...next,
      teamNotes: {
        ...(next.teamNotes || {}),
        family,
        need: [
          qualification.zone,
          qualification.detail,
          qualification.kilos ? `kilos : ${qualification.kilos}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        tried: qualification.tried || "",
        handedOffAt: at,
      },
    };
    return {
      ...finishLeadReply(
        next,
        { ...qualification, pathOffered: true },
        "À recontacter",
        text,
        mentionsAvailability ? gaillard.preferenceReply() : gaillard.closingReply(family),
        {
          ...bookingState,
          pendingQuestion: "callback",
          appointmentStatus: "none",
          callbackSlot: null,
          lastOfferedSlots: [],
        },
        { proposedSlots: [] },
      ),
      shouldBook: null,
      locked: true,
    };
  }

  if (isServiceAsk(text)) {
    const asked = askedServiceName(text) || "cette prestation";
    return answer(
      gaillard.serviceOfferedReply(serviceIsOffered(asked, seya), phraseAskedService(asked)),
    );
  }

  const faq = faqReply(text, {
    seya,
    conversation: { ...base, qualification: merged },
    centerProfile: profile,
  });
  if (faq) {
    return answer(faq);
  }

  if (handedOff && (isHesitation(text) || gaillard.isIndecisive(text))) {
    return answer(gaillard.hesitationClarifyReply());
  }

  if (isThanks(text, base) || isHesitation(text) || refusesSlots(text)) {
    return delegate();
  }

  if (mentionsAvailability) {
    return fixed(next, status, gaillard.preferenceReply());
  }
  // Dernière chance : question matériel / déroulement documentée dans la fiche.
  if (gaillard.asksTechnology(text) || /appareil|equipement|technologie|machine|cryo|radiofrequ/.test(normalize(text))) {
    return informed(gaillard.technologyReply(text, sourceBag, { family: topicFamily, zone: merged.zone }), next);
  }
  if (gaillard.asksProcess(text)) {
    return informed(gaillard.processReply(topicFamily, sourceBag), next);
  }
  if (/aliment|nutrition|regime|appli|application|complement|physio/.test(normalize(text))) {
    const facts =
      gaillard.supportTopicFacts(text, sourceBag) ||
      gaillard.minceurPathFacts(sourceBag, brief?.pricing || {});
    if (facts) {
      return informed(handedOff ? `${facts} ${gaillard.keepConversationReply(family)}` : facts, next);
    }
  }
  if (asksOpenQuestion(text)) {
    return answer(gaillard.missingPracticalReply(), next);
  }
  if (
    handedOff &&
    softPathAccept &&
    !asksPrice(text) &&
    !classifyPriceQuestion(text)
  ) {
    return fixed(next, status, "Très bien 😊 Votre demande est déjà chez l’équipe pour organiser le bilan avec la séance découverte offerte.");
  }
  if (
    handedOff &&
    gaillard.isAnswerLike(text) &&
    !isThanks(text, base) &&
    String(text || "").trim().length >= 3
  ) {
    next = {
      ...next,
      teamNotes: {
        ...(next.teamNotes || {}),
        need: [next.teamNotes?.need, String(text || "").trim().slice(0, 120)]
          .filter(Boolean)
          .join(" · "),
      },
    };
    return fixed(next, status, gaillard.noteAfterHandoffReply(text, next));
  }
  return fixed(next, status, followUp());
}

function lastOtherLeadText(conversation, current) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find(
        (item) =>
          item.author === "lead" &&
          String(item.text || "").trim() &&
          String(item.text || "").trim() !== String(current || "").trim(),
      )?.text || ""
  );
}

function lastSubstantiveLeadText(conversation, current) {
  const leads = [...(conversation?.messages || [])]
    .reverse()
    .filter(
      (item) =>
        item.author === "lead" &&
        String(item.text || "").trim() &&
        String(item.text || "").trim() !== String(current || "").trim(),
    )
    .map((item) => String(item.text || "").trim());
  return (
    leads.find(
      (text) =>
        classifyPriceQuestion(text) ||
        asksPrice(text) ||
        wantsSlots(text, conversation) ||
        Boolean(extractNeed(text)),
    ) ||
    leads[0] ||
    ""
  );
}

function withRereadPrefix(_reread, text) {
  return String(text || "").trim();
}

function withCallbackHealthNote(result, review, note = "") {
  const messages = [...(result.conversation?.messages || [])];
  const index = messages.map((item) => item.author).lastIndexOf("seya");
  if (index >= 0) {
    const current = String(messages[index].text || "")
      .replace(/Oui, je vous écoute\. Dites-moi précisément ce que vous voulez savoir\.\s*/, "")
      .trim();
    messages[index] = {
      ...messages[index],
      text: note
        ? `${note} ${current}`.trim()
        : `Merci de me l’avoir précisé, je le note pour l’équipe : elle en tiendra compte lors du rappel. ${current.replace(/^(Merci( beaucoup)?[,.!]?\s*)/i, "")}`.trim(),
    };
  }
  return {
    ...result,
    shouldBook: null,
    conversation: {
      ...result.conversation,
      status:
        result.conversation?.status === "Revue santé"
          ? "Qualifié"
          : result.conversation?.status,
      healthReview: review.healthReview,
      healthTask: review.healthTask,
      messages,
    },
  };
}

function spokenCallbackDay(bookingState) {
  const iso = String(bookingState?.requestedDate || "").slice(0, 10);
  const parsed = new Date(`${iso}T12:00:00`);
  if (!iso || Number.isNaN(parsed.getTime())) {
    return "";
  }
  const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const part =
    bookingState?.dayPart === "morning"
      ? " matin"
      : bookingState?.dayPart === "afternoon"
        ? " après-midi"
        : bookingState?.dayPart === "evening"
          ? " en fin de journée"
          : "";
  return `${weekdays[parsed.getDay()]} ${dd}/${mm}${part}`;
}

/** Préférence de rappel telle que donnée par le prospect, sans la transformer en horaire promis. */
function spokenPreference(conversation, text, state) {
  const clocks = parseClockMinutes(text);
  const freshMoment =
    clocks.length > 0 ||
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)\b|\b\d{1,2}\/\d{1,2}\b/.test(normalize(text));
  const bookingState = {
    ...state,
    dayPart: dayPartFromText(text) || (freshMoment ? null : state?.dayPart) || null,
  };
  const day = spokenCallbackDay(bookingState);
  const clock = clocks.length
    ? `${Math.floor(clocks[0] / 60)}h${String(clocks[0] % 60).padStart(2, "0").replace(/^00$/, "")}`
    : "";
  if (day) {
    return clock ? `${day} vers ${clock}` : day;
  }
  const part =
    bookingState?.dayPart === "morning"
      ? "le matin"
      : bookingState?.dayPart === "afternoon"
        ? "l’après-midi"
        : bookingState?.dayPart === "evening"
          ? "en fin de journée"
          : "";
  const half =
    bookingState?.weekHalf === "start"
      ? "en début de semaine"
      : bookingState?.weekHalf === "end"
        ? "en fin de semaine"
        : "";
  return [half, part, clock ? `vers ${clock}` : ""].filter(Boolean).join(", ");
}

function callbackSlotFromThread(conversation, text, bookingState, chosenSlot) {
  const date = String(chosenSlot?.date || bookingState?.requestedDate || "").slice(0, 10);
  const time = String(
    chosenSlot?.time ||
      bookingState?.preferredTime ||
      (bookingState?.preferredTimes || [])[0] ||
      "",
  ).slice(0, 5);
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) {
    const clocks = parseClockMinutes(text);
    if (!date || !clocks.length) {
      return null;
    }
    const minutes = clocks[0];
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return { date, time: clock, label: `${date} à ${clock.replace(":", "h")}` };
  }
  return { date, time, label: `${date} à ${time.replace(":", "h")}` };
}

function fallbackAfterNote(qualification, conversation, text) {
  const reply = fallbackAfterNoteCore(qualification, conversation, text);
  const last = lastSeyaText(conversation);
  if (!last || !isNearDuplicate(reply, last)) {
    return reply;
  }
  return pathGoal(conversation?._seya) === "none"
    ? "Je suis là si une question vous vient."
    : "Je reste disponible si vous avez une question 😊";
}

function fallbackAfterNoteCore(qualification, conversation, text) {
  if (isWelcomeRelanceOnly(conversation?._seya)) {
    if (isServiceAsk(text)) {
      return serviceOfferReply(text, conversation?._seya, conversation) || TEAM_QUESTION_REPLY;
    }
    if (asksOpenQuestion(text)) {
      return (
        faqReply(text, { seya: conversation?._seya, conversation: { ...conversation, qualification } }) ||
        "Oui, je vous écoute. Dites-moi précisément ce que vous voulez savoir."
      );
    }
    if (
      (qualification?.zone || qualification?.need) &&
      !alreadyTold(conversation, "(bilan|diagnostic) permettra d'evaluer")
    ) {
      const step = firstNeedReply(text, conversation, qualification, {
        durationMinutes: visitDurationMinutes(conversation?._seya, conversation, text),
      });
      if (step) {
        return step;
      }
    }
    return "Je suis là si une question vous vient.";
  }
  if (isServiceAsk(text)) {
    return serviceOfferReply(text, conversation?._seya, conversation) || TEAM_QUESTION_REPLY;
  }
  if (asksOpenQuestion(text)) {
    return (
      faqReply(text, { seya: conversation?._seya, conversation: { ...conversation, qualification } }) ||
      "Oui, je vous écoute. Dites-moi précisément ce que vous voulez savoir."
    );
  }
  if (isAppointmentConfirmed(conversation)) {
    if (isRescheduleAsk(text) || wantsNoon(text)) {
      return "Dites-moi l’horaire qui vous convient, je décale le rendez-vous.";
    }
    if (isThanks(text, conversation) || isShortYes(text)) {
      return "Avec plaisir, à bientôt.";
    }
    return "Je reste disponible si vous avez une question 😊";
  }
  if (threadIsPaused(conversation) || isWaitUntilLater(text)) {
    return willCallBackReply();
  }
  if (
    conversation?.bookingState?.pendingQuestion === "no_slots" &&
    !isBookingThread(conversation)
  ) {
    return "Très bien. Je reste là si une question vous vient.";
  }
  const goal = pathGoal(conversation?._seya);
  const family =
    resolveActiveFamily(conversation?._seya, { ...conversation, qualification }, text) ||
    inferCareFamily(`${qualification?.need || ""} ${conversation?.treatment || ""}`) ||
    "";
  const lastSeya = lastSeyaText(conversation);
  const stillOpen = "Je reste disponible si vous avez une question 😊";
  if (goal === "book") {
    if (alreadyTold(conversation, "debut de semaine.*fin de semaine|fin de semaine.*debut de semaine")) {
      if (threadIsPaused(conversation)) {
        return willCallBackReply();
      }
      return "Dites-moi un jour qui vous arrange, je regarde tout de suite.";
    }
    if (isBookingThread(conversation) || alreadyTold(conversation, "c['’]est note pour|propose un creneau")) {
      return `${isHesitation(text) || /je (ne )?sais pas/.test(normalize(text)) ? "Pas de souci. " : ""}Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?`;
    }
  }
  if (qualification?.zone || qualification?.need) {
    if (!alreadyTold(conversation, "(bilan|diagnostic) permettra d'evaluer|faire le point sur votre objectif")) {
      const step = firstNeedReply(text, conversation, qualification, {
        durationMinutes: visitDurationMinutes(conversation?._seya, conversation, text),
      });
      if (step) {
        return step;
      }
    }
    if (goal === "callback" && (isHesitation(text) || /je (ne )?sais pas/.test(normalize(text)))) {
      return "Pas de souci, prenez le temps 😊 Si vous souhaitez un rappel plus tard, il suffit de me l’écrire ici.";
    }
    const question = resumeQuestion(goal, family);
    if (question && !isNearDuplicate(question, lastSeya) && !normalize(lastSeya).includes(normalize(question))) {
      return question;
    }
    return goal === "none" ? "Je suis là si une question vous vient." : stillOpen;
  }
  return (
    axisClarifyQuestion(conversation?._seya) ||
    "Vous cherchez plutôt un soin minceur, un soin visage ou une épilation ?"
  );
}

function finishLeadReply(
  conversation,
  qualification,
  status,
  leadText,
  seyaText,
  bookingState,
  extra = {},
) {
  const slotSafe = enforceOutgoingText(
    seyaText,
    bookingState,
    extra.proposedSlots,
  );
  const { _seya, ...cleanConversation } = conversation;
  const switched = applyCareSwitch(cleanConversation, qualification);
  const checked = enforcePriceReply(slotSafe, leadText, extra.seya || _seya, {
    ...switched,
    qualification,
    bookingState,
  });
  const drafted =
    String(checked.text || "").trim() ||
    String(seyaText || "").trim() ||
    "Je suis là. Dites-moi ce dont vous avez besoin, je vous réponds.";
  const seyaSettings = extra.seya || _seya;
  const allowedFamilies = [
    inferCareFamily(leadText),
    inferCareFamily(qualification?.need),
    inferCareFamily(switched.treatment),
    resolveActiveFamily(seyaSettings, { ...switched, qualification }, leadText),
  ];
  const centerCheck = checkAgainstCenter(drafted, { allowedFamilies });
  if (centerCheck.removed.length) {
    console.warn("[seya/knowledge] phrase retirée avant envoi", { reasons: centerCheck.removed });
  }
  const reply = centerCheck.text;
  const blockedProposal = Boolean(seyaText) && drafted !== seyaText;
  const teamQuestion = reply.includes(TEAM_QUESTION_MARK)
    ? { text: String(leadText || "").trim().slice(0, 300), at: new Date().toISOString(), status: "pending" }
    : null;
  const baseNotes = extra.bookedElsewhere
    ? { ...(conversation.teamNotes || {}), bookedElsewhere: extra.bookedElsewhere }
    : conversation.teamNotes;
  const nextBookingState = blockedProposal
    ? { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" }
    : markOfferPending(bookingState, reply);
  return {
    conversation: {
      ...switched,
      qualification,
      status: blockedProposal && status === "RDV proposé" ? "Qualifié" : status,
      bookingState: nextBookingState,
      proposedSlots: (extra.proposedSlots || conversation.proposedSlots || []).filter((slot) => {
        if ((bookingState.rejectedDates || []).includes(slot.date)) return false;
        if ((bookingState.rejectedWeekdays || []).includes(new Date(`${slot.date}T12:00:00`).getDay())) {
          return false;
        }
        if (
          (bookingState.rejectedSlots || []).some(
            (item) => item.date === slot.date && item.time === slot.time,
          )
        ) {
          return false;
        }
        if (Array.isArray(extra.proposedSlots)) {
          return true;
        }
        if (bookingState.requestedDate && slot.date !== bookingState.requestedDate) {
          return extra.shouldBook?.date === slot.date;
        }
        return true;
      }),
      bookedSlot: extra.bookedSlot || conversation.bookedSlot,
      healthReview: extra.healthReview || conversation.healthReview,
      healthTask: extra.healthTask || conversation.healthTask,
      teamNotes: teamQuestion ? { ...(baseNotes || {}), question: teamQuestion } : baseNotes,
      messages: [
        ...(conversation.messages || []),
        message("lead", leadText),
        message("seya", reply),
      ],
      updatedAt: new Date().toISOString(),
    },
    shouldBook:
      extra.shouldBook &&
      (slotAllowed(extra.shouldBook, bookingState) || extra.staffOwned)
        ? extra.shouldBook
        : null,
  };
}

function markOfferPending(bookingState, reply) {
  const value = normalize(reply);
  if (
    bookingState.pendingQuestion === "no_slots" &&
    (bookingState.lastOfferedSlots || []).length &&
    /\d{1,2}h\d{2}/.test(value)
  ) {
    return { ...bookingState, pendingQuestion: "offer_slots" };
  }
  if (bookingState.pendingQuestion !== "no_slots" && offersCallback(reply)) {
    return { ...bookingState, pendingQuestion: "offer_callback" };
  }
  if (
    bookingState.pendingQuestion !== "no_slots" &&
    /propose un creneau|souhaitez[- ]vous que je|vous voulez que je|quel jour vous irait|quand seriez-vous disponible|premier rendez-vous/.test(value) &&
    !/\d{1,2}\s*h/.test(value)
  ) {
    return { ...bookingState, pendingQuestion: "offer_slots" };
  }
  return bookingState;
}

function lastSeyaAt(conversation) {
  const last = [...(conversation.messages || [])]
    .reverse()
    .find((item) => item.author === "seya");
  return last?.at || conversation.updatedAt || null;
}

function lastLeadAt(conversation) {
  const last = [...(conversation.messages || [])]
    .reverse()
    .find((item) => item.author === "lead");
  return last?.at || null;
}

function daysSince(iso) {
  if (!iso) {
    return 999;
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return 999;
  }
  return Math.floor((Date.now() - then) / 86400000);
}

function remainingOfferedSlots(offered, appointments, taken) {
  const takenKey = `${taken?.date || ""}|${String(taken?.time || "").slice(0, 5)}`;
  return (Array.isArray(offered) ? offered : []).filter((slot) => {
    const key = `${slot.date}|${String(slot.time || "").slice(0, 5)}`;
    if (key === takenKey) {
      return false;
    }
    return !isSlotBusy(appointments, slot.date, slot.time);
  });
}

function relanceCopy(conversation, round = 1, centerName = "", seya) {
  const firstName = displayRelanceName(conversation.firstName);
  const named = firstName ? `Bonjour ${firstName}` : "Bonjour";
  const hello = named;
  const centre = String(centerName || "").trim() || "le centre";
  const care = relanceCareLabel(conversation);
  const about = relanceAbout(care);
  const crmOffer = crmOfferForRelance(conversation, seya);
  const settings = seya ? agentSettings(seya) : null;
  const custom = String(settings?.relances?.[Number(round) - 1]?.message || "").trim();
  if (gaillard.isGaillardCenter(centerName)) {
    return gaillard.relanceText(
      round,
      firstName,
      care,
      custom
        ? fillRelanceTemplate(custom, { prenom: firstName, centre, offre: crmOffer || care || "" })
        : "",
    );
  }
  if (custom) {
    return fillRelanceTemplate(custom, {
      prenom: firstName,
      centre,
      offre: crmOffer || care || "",
    });
  }
  if (seya && String(seya.seyaMission || "") === "welcome_relance") {
    const who = firstName ? `${firstName}, ` : "";
    return `${who}je reviens vers vous. Dites-moi si une question vous vient.`.replace(/^./, (letter) =>
      firstName ? letter : letter.toUpperCase(),
    );
  }
  if (seya && String(seya.seyaMission || "") === "qualify_callback") {
    const greet = firstName ? `Bonjour ${firstName}` : "Bonjour";
    const family = inferCareFamily(`${conversation?.qualification?.need || ""} ${conversation?.treatment || ""}`);
    return `${greet}, je reviens vers vous. ${resumeQuestion("callback", family)}`;
  }
  const lastLead = lastLeadText(conversation);
  const wantsTarif = askedPriceInThread(conversation);
  const candidates = wantsTarif
    ? relancePriceCandidates(hello, about, centre, round, firstName)
    : Number(round) >= 3
      ? relanceThirdCandidates(firstName, crmOffer)
      : Number(round) === 2
        ? relanceSecondCandidates(firstName, crmOffer)
        : relanceFirstCandidates(hello, about, centre, lastLead, conversation);
  const previous = (conversation.messages || [])
    .filter((item) => item.author === "seya")
    .map((item) => String(item.text || ""));
  return (
    candidates.find(
      (text) => !previous.some((item) => isNearDuplicate(text, item)),
    ) || ""
  );
}

function displayRelanceName(value) {
  const name = greetingName(value);
  if (!name) {
    return "";
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function crmOfferForRelance(conversation, seya) {
  const mapped = seya
    ? resolveOfferLabel(
        seya,
        conversation?.campaign,
        conversation?.treatment || conversation?.qualification?.need,
      )
    : "";
  if (mapped) {
    return phraseConfiguredOffer(mapped);
  }
  const stored = String(conversation?.offerLabel || "").replace(/\s+/g, " ").trim();
  if (stored && !isJunkTreatment(stored)) {
    return phraseConfiguredOffer(stored);
  }
  const fromOpening = offerFromOpeningMessage(conversation);
  if (fromOpening) {
    return fromOpening;
  }
  if (seya) {
    const opening = resolveOpeningOffer(
      seya,
      conversation?.campaign,
      conversation?.treatment || conversation?.qualification?.need,
    );
    if (opening && opening !== "un soin") {
      return opening;
    }
  }
  return "";
}

function offerFromOpeningMessage(conversation) {
  const first = (conversation?.messages || []).find((item) => item.author === "seya");
  const match = String(first?.text || "").match(
    /demande pour\s+(.+?)(?:\s*[.?!]|$)/i,
  );
  return String(match?.[1] || "").replace(/\s+/g, " ").trim();
}

function relanceAbout(care) {
  const value = String(care || "").replace(/\s+/g, " ").trim() || "notre offre";
  if (/^(de |d['’])/i.test(value)) {
    return value;
  }
  if (/^une?\s/i.test(value)) {
    return `d’${value}`;
  }
  return `de ${value}`;
}

function relanceOfferMention(raw) {
  const offer = String(raw || "").replace(/\s+/g, " ").trim();
  if (!offer) {
    return "notre offre";
  }
  const lower = offer.charAt(0).toLowerCase() + offer.slice(1);
  if (/^notre offre\b/i.test(lower)) {
    return lower;
  }
  if (/^offre\b/i.test(lower)) {
    return `notre ${lower}`;
  }
  if (/^(une?|la|le|les|l['’]|votre)\s/i.test(lower)) {
    return lower;
  }
  return `notre offre ${lower}`;
}

function relanceSecondCandidates(firstName, crmOffer) {
  const who = firstName ? `${firstName}, ` : "";
  const offer = relanceOfferMention(crmOffer);
  return [
    `${who}je ne veux pas vous relancer inutilement. Dites-moi si vous souhaiteriez prendre un rendez-vous pour bénéficier de ${offer}.`,
    `${who}je ne veux pas vous relancer inutilement. Dites-moi si un rendez-vous pour ${offer} vous arrangerait.`,
  ];
}

function relanceThirdCandidates(firstName, crmOffer) {
  const hello = firstName ? `Bonjour ${firstName} 😊` : "Bonjour 😊";
  const offer = String(crmOffer || "").replace(/\s+/g, " ").trim() || "notre offre";
  return [
    `${hello} Je reviens vers vous concernant votre demande pour ${offer}. Quel jour seriez-vous disponible pour venir en bénéficier ?`,
    `${hello} Je reviens vers vous au sujet de ${offer}. Quel jour vous arrangerait pour en bénéficier ?`,
  ];
}

function askedPriceInThread(conversation) {
  const thread = understandThread(conversation);
  if (thread.openAsked?.includes("prix") || thread.asked.includes("prix")) {
    return true;
  }
  return (conversation?.messages || []).some(
    (item) =>
      item.author === "lead" &&
      /prix|tarif|combien/i.test(String(item.text || "")) &&
      !/combien de (temps|seance)/i.test(String(item.text || "")),
  );
}

function relancePriceCandidates(hello, about, centre, round, firstName) {
  const who = firstName ? `${firstName}, ` : "";
  const start = (text) =>
    firstName ? text : text.replace(/^./, (letter) => letter.toUpperCase());
  if (Number(round) >= 3) {
    const greet = firstName ? `Bonjour ${firstName} 😊` : "Bonjour 😊";
    return [
      `${greet} Vous aviez demandé le tarif ${about}. Je peux vous le préciser, ou vous proposer un rendez-vous. Qu’est-ce qui vous arrangerait ?`,
      `${greet} Je reviens vers vous au sujet du prix ${about}. Je peux vous le détailler, ou vous proposer un créneau.`,
    ];
  }
  if (Number(round) === 2) {
    return [
      start(
        `${who}vous aviez demandé le tarif ${about}. Je peux vous le donner, ou vous proposer un créneau. Dites-moi ce que vous préférez.`,
      ),
      start(
        `${who}vous aviez demandé le prix. Je peux vous le préciser tout de suite, ou vous proposer un rendez-vous.`,
      ),
    ];
  }
  return [
    `${hello}, je me permets de revenir vers vous au sujet ${about} à ${centre}. Souhaitez-vous que je vous précise le tarif, ou que je vous propose un rendez-vous ?`,
    `${hello}, je reviens vers vous au sujet ${about}. Le tarif est noté ; je peux également vous proposer un créneau si vous le souhaitez.`,
  ];
}

function relanceFirstCandidates(hello, about, centre, lastLead, conversation) {
  const lead = String(lastLead || "");
  if (/prix|tarif|combien/i.test(lead) || askedPriceInThread(conversation)) {
    return relancePriceCandidates(hello, about, centre, 1, "");
  }
  if (
    Array.isArray(conversation.proposedSlots) &&
    conversation.proposedSlots.length > 0
  ) {
    return [
      `${hello}, je me permets de revenir vers vous au sujet ${about} à ${centre}. L’horaire évoqué vous convient-il toujours, ou préférez-vous une autre disponibilité ?`,
      `${hello}, je reviens vers vous au sujet ${about} à ${centre}. Souhaitez-vous que je vous propose un autre rendez-vous ?`,
    ];
  }
  return [
    `${hello}, je me permets de revenir vers vous au sujet ${about} à ${centre}. Je ne veux pas vous relancer inutilement. Dites-moi si vous souhaiteriez prendre un rendez-vous pour bénéficier de l’offre.`,
    `${hello}, je reviens vers vous au sujet ${about} à ${centre}. Dites-moi si vous souhaiteriez prendre un rendez-vous pour bénéficier de l’offre.`,
  ];
}

function relanceCareLabel(conversation) {
  const family =
    understandThread(conversation).family ||
    familyFromTreatment(
      `${conversation.treatment || ""} ${conversation.campaign || ""} ${conversation.qualification?.need || ""} ${conversation.offerLabel || ""}`,
    );
  const phrase = naturalOfferPhrase(
    family,
    conversation.offerLabel ||
      conversation.qualification?.need ||
      conversation.treatment ||
      "",
  );
  if (phrase) {
    return phrase;
  }
  if (family === "minceur") {
    return "un soin minceur";
  }
  if (family === "visage") {
    return "un soin visage";
  }
  if (family === "epilation") {
    return "une épilation définitive";
  }
  return "votre soin";
}

function lastLeadText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "lead")?.text || ""
  );
}

function readHours(settings) {
  const record = asRecord(settings);
  const agenda = asRecord(record.agenda);
  const list = agenda.hours || record.hours || record.agendaHours;
  if (!Array.isArray(list) || list.length === 0) {
    return defaultHours();
  }
  return list.map((item) => ({
    weekday: Number(item.weekday ?? item.day),
    startTime: String(item.startTime || item.start || "09:00").slice(0, 5),
    endTime: String(item.endTime || item.end || "19:00").slice(0, 5),
    closed: Boolean(item.closed),
  }));
}

module.exports = {
  briefClosing,
  closingFromBrief,
  agentSettings,
  canBookSeya,
  resolveSeyaMission,
  operatorCallbackReply,
  applyBookingMessage,
  applyLeadReply,
  classifyHealthMessage,
  isAwaitingHealthReview,
  markHealthReviewed,
  emptySlotFallback,
  familyFromTreatment,
  guardSlots,
  isSlotBusy,
  remainingOfferedSlots,
  BILAN_DURATION_MINUTES,
  visitDurationMinutes,
  conversationCabinId,
  lastLeadAt,
  lastSeyaAt,
  persistableConversation,
  persistableConversations,
  confirmedAppointmentReply,
  daysSince,
  matchProposedSlot,
  mergeQualification,
  extractNeed,
  applyCareSwitch,
  readHours,
  relanceCopy,
  asksLocation,
  asksAccess,
  asksPrice,
  faqReply,
  displayCareLabel,
  locationReply,
  centerPlaceReply,
  formatCenterProfilePrompt,
  normalizeCenterProfile,
  pickSlotsForMessage,
  pickSlotsForState,
  hasMedicalFlag,
  humanSlotReply,
  isJunkTreatment,
  isOptOut,
  priceReply,
  threadHasMedical,
  resolveOfferLabel,
  resolveOpeningOffer,
  resolveTreatmentUrl,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
  startConversation,
  inferFamily,
  suggestAvailableSlots,
  message,
};
