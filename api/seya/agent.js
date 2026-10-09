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
} = require("./conversation");
const {
  findOfferMap,
  inferCareFamily,
  understandThread,
  naturalOfferPhrase,
  phraseConfiguredOffer,
  phraseFromCareTitle,
  serviceOfferReply,
} = require("./care-family");
const { sanitizePersonName } = require("../../lib/seya-person-name");
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
  const family = inferFamily(
    seya,
    conversation?.campaign,
    `${conversation?.qualification?.need || ""} ${conversation?.treatment || ""} ${extraText || ""}`,
  );
  const brief =
    findTreatmentBrief(
      seya,
      `${conversation?.qualification?.need || ""} ${conversation?.treatment || ""} ${family || ""}`,
    ) || findTreatmentBrief(seya, conversation?.treatment);
  const fromBrief = Number(
    brief?.durationMinutes ?? brief?.duration ?? brief?.duration_minutes,
  );
  if (Number.isFinite(fromBrief) && fromBrief > 0) {
    return fromBrief;
  }
  return FAMILY_VISIT_MINUTES[family] || BILAN_DURATION_MINUTES;
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
      "bilan",
      "decouverte",
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

function isOptOut(text) {
  return isLeadRefusal(text);
}

function asksPrice(text) {
  const raw = String(text || "");
  if (/combien de (temps|seance|seances|rdv|fois|jours)/i.test(raw)) {
    return false;
  }
  return /prix|tarif|co[uû]te|\bcout\b|donne le prix|c['’ ]?est combien|combien (coute|le bilan)/i.test(
    raw,
  );
}

function faqReply(text, extras = {}) {
  const value = normalize(text);
  if (/^\?+$/.test(String(text || "").trim())) {
    return "Dites-moi ce que vous voulez savoir : le prix, un créneau, ou autre chose ?";
  }
  if (/gratuit|offert/.test(value) && /bilan|decouverte|seance/.test(value)) {
    return "";
  }
  if (/resultat/.test(value) || /combien de temps.*result/.test(value)) {
    return "Les résultats dépendent de la zone et du protocole. On vous les explique au bilan.";
  }
  if (/combien de temps|ca dure|duree|dure (le )?(rdv|bilan|rendez-vous)/.test(value)) {
    const minutes = visitDurationMinutes(extras.seya, extras.conversation, text);
    const spoken = spokenVisitDuration(minutes);
    return spoken
      ? `Le rendez-vous dure environ ${spoken}.`
      : "Le bilan dure environ 30 à 45 minutes.";
  }
  if (/fait mal|douloureux|douleur/.test(value)) {
    return "Le bilan est indolore. Pour une séance, ça dépend de la zone, on vous l’explique sur place.";
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
  return /ou (etes|etes[- ]vous|se trouve)|situ[eé]|adresse|\bc['’]est ou\b|vous etes ou|tu es (ou|situ)/i.test(
    String(text || ""),
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
    const options =
      times.length === 1 ? times[0] : `${times[0]} ou ${times[1]}`;
    return `${prefix}Le ${day} je peux vous proposer ${options} — lequel vous irait le mieux ?`;
  }
  return `${prefix}Je peux vous proposer ${formatHumanSlots(list)} — lequel vous irait le mieux ?`;
}

function greetingName(value) {
  const name = String(value || "").trim();
  if (!name || /^(bonjour|hello|hi|bonsoir)$/i.test(name)) {
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
  const built = buildPriceReply(
    text || conversation?.bookingState?.lastLeadPriceText || "c’est combien",
    seya,
    { ...applyCareSwitch(conversation, qualification), qualification },
  );
  if (built) {
    return built;
  }
  const price = resolveTreatmentPrice(
    seya,
    `${qualification?.need || ""} ${qualification?.zone || ""} ${conversation?.treatment || ""}`,
  );
  if (
    price &&
    /analyse corporelle|devis personnalise|devis personnalisé/i.test(price) &&
    inferCareFamily(
      `${qualification?.need || ""} ${conversation?.treatment || ""} ${text || ""}`,
    ) === "minceur"
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

function isSlotBusy(appointments, date, time, duration = BILAN_DURATION_MINUTES) {
  const start = timeToMinutes(time);
  const end = start + (Number(duration) > 0 ? Number(duration) : BILAN_DURATION_MINUTES);
  return (appointments || []).some((appointment) => {
    if (!isBlockingAppointment(appointment, date)) {
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
  const settings = agentSettings(seya);
  const needle = normalize(treatment);
  if (!needle) {
    return "";
  }

  const exact = settings.treatmentBriefs.find(
    (item) => normalize(item?.name) === needle,
  );
  if (exact?.brief) {
    return String(exact.brief).trim();
  }

  const partial = settings.treatmentBriefs.find((item) => {
    const name = normalize(item?.name);
    return name && (needle.includes(name) || name.includes(needle));
  });
  if (partial?.brief) {
    return String(partial.brief).trim();
  }

  const alias = aliases.find((item) =>
    item.keys.some((key) => needle.includes(normalize(key))),
  );
  if (!alias) {
    return "";
  }
  return (
    settings.treatmentBriefs.find((item) => normalize(item?.name) === normalize(alias.name))
      ?.brief || ""
  ).trim();
}

function inferFamily(seya, campaign, treatment) {
  const offer = resolveOfferLabel(seya, campaign, treatment);
  return familyFromTreatment(`${campaign || ""} ${treatment || ""} ${offer}`);
}

function resolveOpeningOffer(seya, campaign, treatment) {
  const family = inferFamily(seya, campaign, treatment);
  const mapped = resolveOfferLabel(seya, campaign, treatment);
  if (mapped) {
    return phraseConfiguredOffer(mapped);
  }
  const brief =
    findTreatmentBrief(seya, `${campaign || ""} ${treatment || ""}`) ||
    findTreatmentBrief(
      seya,
      family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : "",
    );
  const fromTitle = phraseFromCareTitle(brief?.title);
  if (fromTitle) {
    return fromTitle;
  }
  return naturalOfferPhrase(family, campaign || treatment);
}

function resolveTreatmentUrl(seya, campaign, treatment) {
  const brief =
    findTreatmentBrief(seya, `${campaign || ""} ${treatment || ""}`) ||
    findTreatmentBrief(seya, treatment);
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
  return String(template || "")
    .replace(/\{prenom\}/gi, vars.prenom)
    .replace(/\{firstName\}/gi, vars.prenom)
    .replace(/\{centre\}/gi, vars.centre)
    .replace(/\{center\}/gi, vars.centre)
    .replace(/\{offre\}/gi, vars.offre || "")
    .replace(/\{offer\}/gi, vars.offre || "")
    .replace(/Bonjour\s+,/g, "Bonjour,")
    .replace(/\(\s*\)/g, "")
    .replace(/ pour \./g, ".")
    .replace(/demande pour\s+\./gi, "demande.")
    .replace(/  +/g, " ")
    .trim();
}

function findTreatmentBrief(seya, treatment) {
  const settings = agentSettings(seya);
  const needle = normalize(treatment);
  if (!needle) {
    return null;
  }
  const exact = settings.treatmentBriefs.find((item) => normalize(item?.name) === needle);
  if (exact) return exact;
  const partial = settings.treatmentBriefs.find((item) => {
    const name = normalize(item?.name);
    return name && (needle.includes(name) || name.includes(needle));
  });
  if (partial) return partial;
  const alias = aliases.find((item) => item.keys.some((key) => needle.includes(normalize(key))));
  if (!alias) return null;
  return (
    settings.treatmentBriefs.find((item) => normalize(item?.name) === normalize(alias.name)) ||
    null
  );
}

function buildOpeningMessage(context, centerName, seya) {
  const hay = `${context.campaign || ""} ${context.treatment || ""}`;
  const family = inferFamily(seya, context.campaign, context.treatment);
  const offer = resolveOpeningOffer(seya, context.campaign, context.treatment);
  const brief =
    findTreatmentBrief(seya, hay) ||
    findTreatmentBrief(
      seya,
      family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : "",
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
  const matches = [
    ["hydrafacial", "Hydrafacial"],
    ["laser", "Épilation laser"],
    ["epilation", "Épilation laser"],
    ["definitive", "Épilation laser"],
    ["depil", "Épilation laser"],
    ["aisselle", "Épilation laser"],
    ["maillot", "Épilation laser"],
    ["bikini", "Épilation laser"],
    ["minceur", "Soin minceur"],
    ["mincir", "Soin minceur"],
    ["maigrir", "Soin minceur"],
    ["cryo", "Cryolipolyse"],
    ["ventre", "Soin minceur"],
    ["poids", "Soin minceur"],
    ["graisse", "Soin minceur"],
    ["cellulite", "Soin minceur"],
    ["visage", "Soin visage"],
    ["fermete", "Soin visage"],
    ["rides", "Soin visage"],
    ["acne", "Soin visage"],
    ["bilan", "Bilan"],
  ];
  for (const [needle, label] of matches) {
    if (value.includes(needle)) {
      return label;
    }
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
    "menton",
    "levre",
  ];
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
  return {
    ...conversation,
    treatment: qualification.need,
    offerLabel: "",
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
  if (
    /^(le premier|premier)$/i.test(value) ||
    (options.confirmYes && isShortYes(text))
  ) {
    return slots[0];
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
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text: String(text || "").trim(),
    at: new Date().toISOString(),
  };
}

function startConversation(context, centerName, seya) {
  const treatment =
    isJunkTreatment(context.treatment) ? "" : context.treatment || "";
  const family = inferFamily(seya, context.campaign, treatment || context.treatment);
  const mappedOffer = resolveOfferLabel(
    seya,
    context.campaign,
    treatment || context.treatment,
  );
  const offer = mappedOffer
    ? phraseConfiguredOffer(mappedOffer)
    : naturalOfferPhrase(family, context.campaign || treatment);
  const opening = buildOpeningMessage(context, centerName, seya);
  const person = sanitizePersonName(context.firstName, context.lastName);

  return {
    id: context.leadId,
    leadId: context.leadId,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: context.phone,
    treatment:
      treatment ||
      (family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : ""),
    campaign: context.campaign || "",
    offerLabel: offer === "un soin" ? "" : offer,
    status: "À envoyer",
    qualification: {
      need:
        treatment ||
        (family === "minceur"
          ? "Soin minceur"
          : family === "visage"
            ? "Soin visage"
            : family === "epilation"
              ? "Épilation définitive"
              : ""),
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
    state,
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
      if (isSlotBusy(appointments, date, time, slotDuration)) {
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
    return finishLeadReply(
      conversation,
      qualification,
      "RDV pris",
      text,
      alreadyBookedReply(intentText || text),
      {
        ...bookingState,
        pendingQuestion: "no_slots",
        lastOfferedSlots: [],
        appointmentStatus: "confirmed",
      },
      { proposedSlots: [] },
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
  const refuses = isOptOut(text);

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

  const crmIntent = crmUpdateFromLeadMessage(text, extras.now, extras);
  const alreadyBooked =
    isAppointmentConfirmed(conversation) ||
    /rdv pris|rdv confirm/i.test(String(conversation.status || ""));
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

  if (isIdentityQuestion(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      conversationalReply(text, conversation, qualification, extras.now, {
        durationMinutes,
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
  if (health.personal) {
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

  if (isAwaitingHealthReview(conversation)) {
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
    return finishLeadReply(
      conversation,
      qualification,
      "Revue santé",
      text,
      awaitingHealthReply(),
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

  const service = serviceOfferReply(text, seya);
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
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      faq,
      { ...bookingState, pendingQuestion: null },
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
      bookingState,
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
        welcomeRelanceHandoffReply(),
        bookingState,
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

  if (isQualifyCallback(settings)) {
    const callbackSlot = callbackSlotFromThread(
      conversation,
      intentText,
      bookingState,
      chosenSlot,
    );
    if (callbackSlot) {
      return finishLeadReply(
        conversation,
        qualification,
        "À recontacter",
        text,
        operatorCallbackReply(callbackSlot),
        {
          ...bookingState,
          pendingQuestion: "callback",
          appointmentStatus: "none",
        },
        { bookedSlot: null, shouldBook: null },
      );
    }
  }

  if (wantsSlots(intentText, conversation) && !canBookSeya(settings)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      "Parfait. Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?",
      bookingState,
    );
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
    if (previousHealth.personal) {
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

function withRereadPrefix(reread, text) {
  const reply = String(text || "").trim();
  if (!reread || !reply) {
    return reply;
  }
  if (/vous avez raison/i.test(reply)) {
    return reply;
  }
  return `Vous avez raison, je reprends votre demande. ${reply}`;
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
  if (isWelcomeRelanceOnly(conversation?._seya)) {
    if (isServiceAsk(text)) {
      return serviceOfferReply(text, conversation?._seya) ||
        "Je vérifie cette prestation auprès de l’équipe et je vous dis.";
    }
    if (asksOpenQuestion(text)) {
      return "Oui, je vous écoute. Dites-moi précisément ce que vous voulez savoir.";
    }
    return "Je suis là si une question vous vient.";
  }
  if (isServiceAsk(text)) {
    return serviceOfferReply(text, conversation?._seya) ||
      "Je vérifie cette prestation auprès de l’équipe et je vous dis.";
  }
  if (asksOpenQuestion(text)) {
    return "Oui, je vous écoute. Dites-moi précisément ce que vous voulez savoir.";
  }
  if (isAppointmentConfirmed(conversation)) {
    if (isRescheduleAsk(text) || wantsNoon(text)) {
      return "Dites-moi l’horaire qui vous convient, je décale le rendez-vous.";
    }
    if (isThanks(text, conversation) || isShortYes(text)) {
      return "Avec plaisir, à bientôt.";
    }
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
  if (alreadyTold(conversation, "debut de semaine.*fin de semaine|fin de semaine.*debut de semaine")) {
    if (threadIsPaused(conversation)) {
      return willCallBackReply();
    }
    return "Dites-moi un jour qui vous arrange, je regarde tout de suite.";
  }
  if (isBookingThread(conversation) || alreadyTold(conversation, "c['’]est note pour|propose un creneau")) {
    return "Parfait. Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?";
  }
  if (qualification?.zone) {
    if (alreadyTold(conversation, "quand seriez-vous disponible|c['’]est note pour|solutions qui peuvent")) {
      return "Dites-moi un jour qui vous irait, je vous propose un horaire.";
    }
    return firstNeedReply(text, conversation, qualification, {
      durationMinutes: visitDurationMinutes(conversation?._seya, conversation, text),
    });
  }
  if (qualification?.need) {
    return "Vous voulez que je vous propose un créneau, ou vous avez une autre question ?";
  }
  return "Vous cherchez plutôt un soin minceur, un soin visage ou une épilation ?";
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
  const reply = checked.text;
  const blockedProposal = reply !== seyaText;
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
    return `${greet}, je reviens vers vous. Quand seriez-vous disponible pour qu’une opératrice vous rappelle ?`;
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
  if (Number(round) >= 3) {
    const greet = firstName ? `Bonjour ${firstName} 😊` : "Bonjour 😊";
    return [
      `${greet} Je relis notre échange : vous demandiez le tarif ${about}. Je peux vous le préciser, ou vous proposer un rendez-vous. Qu’est-ce qui vous arrangerait ?`,
      `${greet} Je reviens vers vous : le prix ${about} était bien votre question. Je peux vous le détailler, ou vous proposer un créneau.`,
    ];
  }
  if (Number(round) === 2) {
    return [
      `${who}je relis votre demande : vous vouliez le tarif ${about}. Je peux vous le donner, ou vous proposer un créneau. Dites-moi ce que vous préférez.`,
      `${who}vous aviez demandé le prix. Je peux vous le préciser tout de suite, ou vous proposer un rendez-vous.`,
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
