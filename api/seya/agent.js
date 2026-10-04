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
  alreadyTold,
  conversationalReply,
  isBookingThread,
  isHesitation,
  isIdentityQuestion,
  isWrongCenter,
  wrongCenterReply,
  crmUpdateFromLeadMessage,
  isLeadRefusal,
  isOffTopicComplaint,
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
} = require("./conversation");
const {
  findOfferMap,
  inferCareFamily,
  understandThread,
  naturalOfferPhrase,
  phraseConfiguredOffer,
  phraseFromCareTitle,
} = require("./care-family");
const { sanitizePersonName } = require("../../lib/seya-person-name");
const { resolveGeneralBrief } = require("./general-brief");

const BILAN_DURATION_MINUTES = 75;

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

function faqReply(text) {
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
    return "Le bilan dure environ 30 à 45 minutes.";
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
  const labels = (slots || []).slice(0, 3).map((slot) => slot.label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} ou ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} ou ${labels[2]}`;
}

function humanSlotReply(slots) {
  const list = (slots || []).slice(0, 3);
  if (!list.length) {
    return "Je n’ai plus de place sur ce jour-là. Quel autre jour vous irait ?";
  }
  const sameDay = list.every((slot) => slot.date === list[0].date);
  if (sameDay) {
    const day = list[0].label.replace(/\s+à\s+.*/, "");
    const times = list.map((slot) => String(slot.time || "").replace(":", "h"));
    const options =
      times.length === 1
        ? times[0]
        : times.length === 2
          ? `${times[0]} ou ${times[1]}`
          : `${times[0]}, ${times[1]} ou ${times[2]}`;
    return `Le ${day} je peux vous proposer ${options} — lequel vous irait le mieux ?`;
  }
  return `Je peux vous proposer ${formatHumanSlots(list)} — lequel vous irait le mieux ?`;
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
  if (price && /analyse corporelle|devis personnalise|devis personnalisé/i.test(price)) {
    return price;
  }
  return unknownPriceReply();
}

function todayIso(now) {
  const date = now instanceof Date ? now : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
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

function currentMinutes(now) {
  const date = now instanceof Date ? now : new Date();
  return date.getHours() * 60 + date.getMinutes();
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
  if (appointment.date && appointment.date !== date) {
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
  return {
    whatsappAgentEnabled: record.whatsappAgentEnabled !== false,
    autoMessageOnNewLead: record.autoMessageOnNewLead !== false,
    qualifyOnSignup: record.qualifyOnSignup !== false,
    askForAppointment: record.askForAppointment !== false,
    bookAppointment: record.bookAppointment === true,
    handoffToHuman: record.handoffToHuman !== false,
    treatmentBriefs: briefs,
    offerMaps: offers,
    centerProfile: normalizeCenterProfile(record.centerProfile),
    brief: resolveGeneralBrief(record.brief),
    relanceEnabled: record.relanceEnabled !== false,
    relanceDays: Array.isArray(record.relanceDays)
      ? record.relanceDays.map(Number).filter((item) => item > 0)
      : [1, 5, 30],
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

function defaultOpeningForFamily(family) {
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
  const template = looksRoboticOpening(stored)
    ? defaultOpeningForFamily(family)
    : stored || defaultOpeningForFamily(family);
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
    ["minceur", "Soin minceur"],
    ["mincir", "Soin minceur"],
    ["maigrir", "Soin minceur"],
    ["cryo", "Cryolipolyse"],
    ["ventre", "Soin minceur"],
    ["poids", "Soin minceur"],
    ["graisse", "Soin minceur"],
    ["cellulite", "Soin minceur"],
    ["visage", "Soin visage"],
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

function mergeQualification(current, text, fallbackTreatment) {
  const currentNeed = isJunkTreatment(current?.need) ? "" : current?.need || "";
  const fallback = isJunkTreatment(fallbackTreatment) ? "" : fallbackTreatment || "";
  const next = {
    need: currentNeed || fallback,
    zone: current?.zone || "",
    delay: current?.delay || "",
    availability: current?.availability || "",
  };
  const need = extractNeed(text);
  const zone = extractZone(text);
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

function nextQualificationQuestion(qualification, seya, fallbackTreatment, conversation, text, now) {
  return conversationalReply(
    text,
    conversation,
    {
      ...qualification,
      need: qualification.need || fallbackTreatment,
    },
    now,
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

function pickSlotsForState(appointments, hours, state, now) {
  const today = todayIso(now);
  const untilRequested = state.requestedDate
    ? Math.round(
        (new Date(`${state.requestedDate}T12:00:00`).getTime() -
          new Date(`${today}T12:00:00`).getTime()) /
          86400000,
      )
    : 0;
  const options = {
    count: 3,
    days: Math.max(45, untilRequested + 2),
    date: state.requestedDate || "",
    weekdays: state.requestedDate
      ? []
      : state.requestedWeekday != null
        ? [state.requestedWeekday]
        : state.weekHalf === "start"
          ? [1, 2, 3]
          : state.weekHalf === "end"
            ? [4, 5, 6]
            : [],
    excludeWeekdays: state.rejectedWeekdays,
    excludeDates: state.rejectedDates,
    excludeSlots: state.rejectedSlots,
    duration: BILAN_DURATION_MINUTES,
    dayPart: state.dayPart,
    now,
  };
  return suggestAvailableSlots(appointments, hours, options);
}

function pickSlotsForMessage(appointments, hours, conversation, text, now) {
  const state = applyBookingMessage(conversation.bookingState, text, {
    centerId: conversation.centerId,
    now,
    conversation,
  });
  return pickSlotsForState(appointments, hours, state, now);
}

function suggestAvailableSlots(appointments, hours, countOrOptions = 3, duration = BILAN_DURATION_MINUTES) {
  const options =
    countOrOptions && typeof countOrOptions === "object"
      ? countOrOptions
      : { count: countOrOptions, duration };
  const count = options.count || 3;
  const slotDuration = options.duration || duration || BILAN_DURATION_MINUTES;
  const maxDays = options.days || 14;
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

  for (let offset = 0; offset < maxDays && slots.length < count; offset += 1) {
    const date = addDaysIso(today, offset);
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
      if (slots.length >= count) {
        break;
      }
    }
  }
  return slots;
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
  const previousLead = lastOtherLeadText(conversation, text);
  const reread =
    isRereadAsk(text) ||
    (isOffTopicComplaint(text) && isBookingThread(conversation));
  const intentText = reread && previousLead ? previousLead : text;
  const bookingState =
    extras.bookingState && !reread
      ? extras.bookingState
      : applyBookingMessage(conversation.bookingState, intentText, {
          centerId: extras.centerId || conversation.centerId,
          now: extras.now,
          conversation,
        });
  conversation = {
    ...conversation,
    centerId: extras.centerId || conversation.centerId || bookingState.centerId,
    bookingState,
    _seya: seya,
  };
  const allowRepeat =
    asksOtherDay(intentText) ||
    /lundi|mardi|mercredi|jeudi|vendredi|samedi|debut de semaine|fin de semaine|fin de journee|soir|apres.?midi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
      String(intentText || ""),
    );
  const guarded = extras.guarded && !reread
    ? extras.guarded
    : guardSlots(slots, bookingState, {
        centerId: conversation.centerId,
        allowRepeat,
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
  );
  const pool = offeredSlots(conversation, slots);
  const confirmYes = isConfirmingOfferedTime(intentText, conversation);
  const chosenSlot =
    (isAppointmentConfirmed(conversation) && !confirmYes) ||
    (lastSeyaAskedToSearch(conversation) && isShortYes(intentText)) ||
    (bookingState.pendingQuestion === "no_slots" && !lastSeyaOfferedToBook(conversation))
      ? null
      : matchProposedSlot(intentText, conversation.proposedSlots, {
          confirmYes,
          date: bookingState.requestedDate,
        }) ||
        matchProposedSlot(intentText, conversation.bookingState?.lastOfferedSlots, {
          confirmYes,
          date: bookingState.requestedDate,
        }) ||
        matchProposedSlot(intentText, pool, { date: bookingState.requestedDate });
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

  const crmIntent = crmUpdateFromLeadMessage(text, extras.now);
  const alreadyBooked =
    isAppointmentConfirmed(conversation) ||
    /rdv pris|rdv confirm/i.test(String(conversation.status || ""));
  if (crmIntent && crmIntent.conversationStatus && !alreadyBooked) {
    return finishLeadReply(
      conversation,
      qualification,
      crmIntent.conversationStatus,
      text,
      conversationalReply(text, conversation, qualification, extras.now),
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
      conversationalReply(text, conversation, qualification, extras.now),
      bookingState,
    );
  }

  if (
    isThanks(text, conversation) ||
    isHesitation(text) ||
    refusesSlots(text) ||
    (isAppointmentConfirmed(conversation) && isShortYes(text) && !confirmYes)
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
      conversationalReply(text, conversation, qualification, extras.now),
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
    if (asksLocation(text) || asksAccess(text) || asksPrice(text) || classifyPriceQuestion(text) || faqReply(text)) {
      const admin =
        faqReply(text) ||
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

  if (asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)) {
    const reply = priceReply(seya, qualification, conversation, text);
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      reply,
      markPriceAnswered({ ...bookingState, pendingQuestion: "price" }),
    );
  }

  const faq = faqReply(text);
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

  if (wantsSlots(intentText, conversation) && !settings.bookAppointment) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      "Parfait. Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?",
      bookingState,
    );
  }

  if (
    chosenSlot &&
    settings.bookAppointment &&
    !threadHasMedical(conversation, text) &&
    slotAllowed(chosenSlot, bookingState)
  ) {
    const occupancy = extras.appointments || [];
    if (occupancy.length && isSlotBusy(occupancy, chosenSlot.date, chosenSlot.time)) {
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
          ? `Ce créneau n’est plus disponible. ${humanSlotReply(remaining)}`
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
        isConfirmingOfferedTime(intentText, conversation)
          ? checkingSlotReply()
          : `Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊`,
      ),
      { ...bookingState, appointmentStatus: "proposed" },
      { bookedSlot: chosenSlot, shouldBook: chosenSlot },
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
    settings.bookAppointment &&
    wantsSlots(intentText, conversation) &&
    shouldSearchSlots(bookingState, intentText, conversation) &&
    !asksPrice(text) &&
    !classifyPriceQuestion(text) &&
    !isPriceRepeatComplaint(text) &&
    !bookingState.unansweredPriceIntent &&
    !asksLocation(text) &&
    !asksAccess(text) &&
    !faqReply(text) &&
    !threadHasMedical(conversation, text) &&
    Boolean(qualification.need || conversation.treatment) &&
    !isJunkTreatment(qualification.need || conversation.treatment);

  if (readyToPropose && safeSlots.length === 0) {
    const rejected = bookingState.requestedDate
      ? [...new Set([...(bookingState.rejectedDates || []), bookingState.requestedDate])]
      : bookingState.rejectedDates;
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
        rejectedDates: rejected,
      },
      { proposedSlots: [] },
    );
  }

  if (readyToPropose && safeSlots.length > 0) {
    return finishLeadReply(
      conversation,
      qualification,
      "RDV proposé",
      text,
      withRereadPrefix(reread, humanSlotReply(safeSlots)),
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
    const previous = lastOtherLeadText(conversation, text);
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
    ) || fallbackAfterNote(qualification, conversation);
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

function fallbackAfterNote(qualification, conversation) {
  if (isAppointmentConfirmed(conversation)) {
    return "Avec plaisir, à bientôt.";
  }
  if (
    conversation?.bookingState?.pendingQuestion === "no_slots" &&
    !isBookingThread(conversation)
  ) {
    return "Très bien. Je reste là si une question vous vient.";
  }
  if (alreadyTold(conversation, "debut de semaine.*fin de semaine|fin de semaine.*debut de semaine")) {
    return "Dites-moi un jour qui vous arrange, je regarde tout de suite.";
  }
  if (isBookingThread(conversation) || alreadyTold(conversation, "c['’]est note pour|propose un creneau")) {
    return "Parfait. Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?";
  }
  if (qualification?.zone) {
    const zone = qualification.zone;
    const label = /cuisse/.test(zone) ? "les cuisses" : `le ${zone}`;
    if (alreadyTold(conversation, "c['’]est note pour")) {
      return "Dites-moi un jour qui vous irait, je vous propose un horaire.";
    }
    return `C’est noté pour ${label}. Vous voulez que je vous propose un créneau ?`;
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
  const slotSafe = enforceOutgoingText(seyaText, bookingState);
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
      extra.shouldBook && slotAllowed(extra.shouldBook, bookingState)
        ? extra.shouldBook
        : null,
  };
}

function markOfferPending(bookingState, reply) {
  const value = normalize(reply);
  if (
    bookingState.pendingQuestion !== "no_slots" &&
    /propose un creneau|souhaitez[- ]vous que je|vous voulez que je|quel jour vous irait/.test(value) &&
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
  const about = /^une?\s/i.test(care) ? `d’${care}` : `de ${care}`;
  const crmOffer = crmOfferForRelance(conversation, seya);
  const lastLead = lastLeadText(conversation);
  const candidates =
    Number(round) >= 3
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

function relanceFirstCandidates(hello, about, centre, lastLead, conversation) {
  const lead = String(lastLead || "");
  if (/prix|tarif|combien/i.test(lead)) {
    return [
      `${hello}, je me permets de revenir vers vous au sujet ${about} à ${centre}. Souhaitez-vous que je vous précise le tarif, ou que je vous propose un rendez-vous ?`,
      `${hello}, je reviens vers vous au sujet ${about}. Le tarif est noté ; je peux également vous proposer un créneau si vous le souhaitez.`,
    ];
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
  const family = familyFromTreatment(
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
