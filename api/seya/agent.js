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
  isPriceRepeatComplaint,
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
  conversationalReply,
  isHesitation,
  isIdentityQuestion,
  isOffTopicComplaint,
  isThanks,
  refusesSlots,
  wantsSlots,
} = require("./conversation");
const { inferCareFamily, naturalOfferPhrase } = require("./care-family");
const { sanitizePersonName } = require("../../lib/seya-person-name");

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
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication (pacemaker, grossesse…) : transmets à l’équipe, ne booke pas.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Je peux regarder un créneau avec vous, si vous le souhaitez.",
  },
  {
    name: "Soin minceur",
    pricing: {
      bilan: "offert",
      discovery: "offerte",
      session: "",
      package: "à partir de 500€, payable jusqu’en 10 fois",
      sessionPolicy: "after_bilan",
    },
    price: "",
    brief:
      "Parle comme une réceptionniste. Demande la zone. Ne parle de prix que si on te le demande. Pas de liste de créneaux à la place du tarif.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Sur quelle zone souhaitez-vous que l’on regarde ?",
  },
  {
    name: "Soin visage",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?",
  },
  {
    name: "Cryolipolyse",
    pricing: {
      bilan: "offert",
      discovery: "offerte",
      session: "",
      package: "à partir de 500€, payable jusqu’en 10 fois",
      sessionPolicy: "after_bilan",
    },
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication : transmets à l’équipe.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quelle zone souhaitez-vous traiter ?"
  },
  {
    name: "Hydrafacial",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
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
  const raw = String(text || "").trim();
  const needle = normalize(raw).replace(/[!?.]+$/g, "");
  if (/^(stop|stoppez|arrete|arretez|stop svp)$/.test(needle)) {
    return true;
  }
  if (/pas int[eé]ress/.test(raw)) {
    return true;
  }
  if (/ne (me )?(plus )?(e[cç]rire|contacter|d[eé]ranger|appeler)/i.test(raw)) {
    return true;
  }
  return /^(non merci|plus jamais)$/i.test(raw);
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
    return "Dites-moi ce que vous voulez savoir : le bilan (il est gratuit), un créneau, ou autre chose ?";
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

function asksLocation(text) {
  return /ou (etes|etes[- ]vous|se trouve)|situ[eé]|adresse|\bc['’]est ou\b|vous etes ou|tu es (ou|situ)/i.test(
    String(text || ""),
  );
}

const BILAN_PRICE_REPLY =
  "Le bilan et la séance découverte sont offerts. Le protocole ensuite se précise après l’analyse corporelle.";

function locationReply(address, centerName) {
  if (address) {
    return `Nous sommes au ${address}.`;
  }
  return `Je vérifie l’adresse exacte avec l’équipe${centerName ? ` du ${centerName}` : ""}. Je vous la confirme dès que je l’ai.`.replace(
    /\s+/g,
    " ",
  );
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

function resolveTreatmentPrice(seya, treatment) {
  const brief = findTreatmentBrief(seya, treatment);
  return String(brief?.price || "").trim();
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
    { ...conversation, qualification },
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
  return BILAN_PRICE_REPLY;
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
  const [hours, minutes] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
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

function formatSlotLabel(date, time) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const [, month, day] = date.split("-");
  return `${weekdayShort[weekday]} ${day}/${month} à ${time.replace(":", "h")}`;
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
    brief: String(record.brief || ""),
    relanceEnabled: record.relanceEnabled !== false,
    relanceDays: Array.isArray(record.relanceDays)
      ? record.relanceDays.map(Number).filter((item) => item > 0)
      : [1, 5, 30],
  };
}

function resolveOfferLabel(seya, campaign, treatment) {
  const settings = agentSettings(seya);
  const needle = normalize(`${campaign || ""} ${treatment || ""}`);
  if (!needle) {
    return "";
  }
  const found = settings.offerMaps.find((item) => {
    const match = normalize(item?.match);
    return match.length > 1 && needle.includes(match);
  });
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
  const offer = naturalOfferPhrase(
    family,
    resolveOfferLabel(seya, context.campaign, context.treatment) ||
      context.campaign ||
      context.treatment,
  );
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
  return zones.filter((zone) => value.includes(zone)).join(", ");
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

function matchProposedSlot(text, slots) {
  const value = String(text || "").toLowerCase().trim();
  if (!value || !Array.isArray(slots) || slots.length === 0) {
    return null;
  }
  if (/1er|octobre|novembre|decembre|janvier|fevrier|mars|avril|juin|juillet|aout|septembre|mai\b/i.test(value)) {
    return null;
  }
  if (/^([123])$/.test(value)) {
    return slots[Number(value) - 1] || null;
  }
  if (/^(oui|ok|d['’]?accord|le premier|premier)$/i.test(value)) {
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

function nextQualificationQuestion(qualification, seya, fallbackTreatment, conversation, text) {
  return conversationalReply(text, conversation, {
    ...qualification,
    need: qualification.need || fallbackTreatment,
  });
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
  const offer = naturalOfferPhrase(
    family,
    resolveOfferLabel(seya, context.campaign, treatment || context.treatment) ||
      context.campaign ||
      treatment,
  );
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
    /change de jour|un autre jour|autres? horaires|d['’]autres creneaux|pas ce jour/.test(
      value,
    )
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
    weekdays:
      state.requestedDate || state.requestedWeekday == null
        ? []
        : [state.requestedWeekday],
    excludeWeekdays: state.rejectedWeekdays,
    excludeDates: state.rejectedDates,
    now,
  };
  return suggestAvailableSlots(appointments, hours, options);
}

function pickSlotsForMessage(appointments, hours, conversation, text, now) {
  const state = applyBookingMessage(conversation.bookingState, text, {
    centerId: conversation.centerId,
    now,
  });
  return pickSlotsForState(appointments, hours, state, now);
}

function suggestAvailableSlots(appointments, hours, countOrOptions = 3, duration = 60) {
  const options =
    countOrOptions && typeof countOrOptions === "object"
      ? countOrOptions
      : { count: countOrOptions, duration };
  const count = options.count || 3;
  const slotDuration = options.duration || duration || 60;
  const maxDays = options.days || 14;
  const onlyWeekdays = Array.isArray(options.weekdays) ? options.weekdays : [];
  const onlyDate = String(options.date || "");
  const excludeWeekdays = Array.isArray(options.excludeWeekdays)
    ? options.excludeWeekdays
    : [];
  const excludeDates = Array.isArray(options.excludeDates) ? options.excludeDates : [];
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
    for (let minutes = start; minutes + slotDuration <= end; minutes += 30) {
      if (date === today && minutes < nowMinutes + 60) {
        continue;
      }
      const time = minutesToTime(minutes);
      const busy = (appointments || []).some((appointment) => {
        if (appointment.date !== date) return false;
        if (appointment.kind === "Pause") return false;
        if (/annul/i.test(String(appointment.status || ""))) return false;
        return rangesOverlap(
          minutes,
          minutes + slotDuration,
          timeToMinutes(appointment.start),
          timeToMinutes(appointment.start) + (appointment.duration || 60),
        );
      });
      if (busy) {
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
  const bookingState = extras.bookingState
    ? extras.bookingState
    : applyBookingMessage(conversation.bookingState, text, {
        centerId: extras.centerId || conversation.centerId,
        now: extras.now,
      });
  conversation = {
    ...conversation,
    centerId: extras.centerId || conversation.centerId || bookingState.centerId,
    bookingState,
    _seya: seya,
  };
  const allowRepeat = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
    String(text || ""),
  );
  const guarded = extras.guarded || guardSlots(slots, bookingState, {
    centerId: conversation.centerId,
    allowRepeat,
  });
  const safeSlots = shouldSearchSlots(bookingState, text) ? guarded.slots : [];
  const qualification = mergeQualification(
    conversation.qualification,
    text,
    conversation.treatment,
  );
  const chosenSlot =
    matchProposedSlot(text, conversation.proposedSlots) ||
    matchProposedSlot(text, slots);
  const lastSeyaText =
    [...(conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || "";
  const askedForRdv = /conseill|rendez-vous|oui ou non/i.test(lastSeyaText);
  const refuses = isOptOut(text);
  const wantsRdv =
    settings.askForAppointment &&
    !settings.bookAppointment &&
    ((askedForRdv && /^(oui|ok|d['’]?accord)$/i.test(String(text).trim())) ||
      /je (veux|souhaite).*rdv|prendre (un )?(rdv|rendez-vous)/i.test(text));

  if (refuses) {
    return finishLeadReply(conversation, qualification, "Pas intéressé", text, "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous.", bookingState);
  }

  if (isIdentityQuestion(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      conversationalReply(text, conversation, qualification),
      bookingState,
    );
  }

  if (isThanks(text) || isHesitation(text) || refusesSlots(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : conversation.status || "En cours",
      text,
      conversationalReply(text, conversation, qualification),
      { ...bookingState, pendingQuestion: refusesSlots(text) || isHesitation(text) ? "no_slots" : bookingState.pendingQuestion },
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
    if (asksLocation(text)) {
      parts.push(locationReply(extras.centerAddress, extras.centerName || ""));
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
    if (asksLocation(text) || asksPrice(text) || classifyPriceQuestion(text) || faqReply(text)) {
      const admin =
        faqReply(text) ||
        (asksLocation(text)
          ? locationReply(extras.centerAddress, extras.centerName || "")
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

  if (asksLocation(text)) {
    return finishLeadReply(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      locationReply(extras.centerAddress, extras.centerName || ""),
      { ...bookingState, pendingQuestion: "address" },
    );
  }

  if (wantsRdv || (settings.handoffToHuman && /conseill|humain|appeler|rappel/i.test(text))) {
    return finishLeadReply(
      conversation,
      qualification,
      "À recontacter",
      text,
      "Parfait. Je transmets à une conseillère du centre, elle vous recontacte rapidement.",
      bookingState,
    );
  }

  if (
    chosenSlot &&
    settings.bookAppointment &&
    !threadHasMedical(conversation, text) &&
    slotAllowed(chosenSlot, bookingState)
  ) {
    return finishLeadReply(
      conversation,
      qualification,
      "RDV pris",
      text,
      `Je vérifie le planning et je vous confirme ${chosenSlot.label} pour ${qualification.need || conversation.treatment || "votre soin"}.`,
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
    wantsSlots(text) &&
    shouldSearchSlots(bookingState, text) &&
    !asksPrice(text) &&
    !classifyPriceQuestion(text) &&
    !isPriceRepeatComplaint(text) &&
    !bookingState.unansweredPriceIntent &&
    !asksLocation(text) &&
    !faqReply(text) &&
    !threadHasMedical(conversation, text) &&
    Boolean(qualification.need || conversation.treatment) &&
    !isJunkTreatment(qualification.need || conversation.treatment);

  if (readyToPropose && safeSlots.length === 0) {
    return finishLeadReply(
      conversation,
      qualification,
      "Qualifié",
      text,
      guarded.fallback || emptySlotFallback(bookingState),
      { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" },
    );
  }

  if (readyToPropose && safeSlots.length > 0) {
    return finishLeadReply(
      conversation,
      qualification,
      "RDV proposé",
      text,
      humanSlotReply(safeSlots),
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
    if (asksLocation(previous)) {
      return finishLeadReply(
        conversation,
        qualification,
        qualification.need ? "Qualifié" : "En cours",
        text,
        `Vous avez raison. ${locationReply(extras.centerAddress, extras.centerName || "")}`,
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
    ) || fallbackAfterNote(qualification);
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

function fallbackAfterNote(qualification) {
  if (qualification?.zone) {
    const zone = qualification.zone;
    const label = /cuisse/.test(zone) ? "les cuisses" : `le ${zone}`;
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
  const checked = enforcePriceReply(slotSafe, leadText, extra.seya || conversation._seya, {
    ...conversation,
    qualification,
    bookingState,
  });
  const reply = checked.text;
  const blockedProposal = reply !== seyaText;
  return {
    conversation: {
      ...conversation,
      qualification,
      status: blockedProposal && status === "RDV proposé" ? "Qualifié" : status,
      bookingState: blockedProposal
        ? { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" }
        : bookingState,
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

function relanceCopy(conversation, days) {
  const firstName = conversation.firstName || "bonjour";
  const treatment =
    conversation.qualification?.need || conversation.treatment || "votre soin";
  if (days >= 28) {
    return `Bonjour ${firstName}, c’est Seya. Je reviens vers vous pour ${treatment}. Souhaitez-vous que je vous propose un créneau cette semaine, ou préférez-vous que l’on arrête les messages ? Je ne veux pas vous relancer inutilement.`;
  }
  return `Bonjour ${firstName}, c’est Seya. Je voulais juste reprendre pour ${treatment}. Quel jour vous irait le mieux ? Je ne veux pas vous relancer inutilement.`;
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
  lastLeadAt,
  lastSeyaAt,
  daysSince,
  matchProposedSlot,
  mergeQualification,
  readHours,
  relanceCopy,
  asksLocation,
  asksPrice,
  faqReply,
  displayCareLabel,
  locationReply,
  pickSlotsForMessage,
  pickSlotsForState,
  hasMedicalFlag,
  humanSlotReply,
  isJunkTreatment,
  isOptOut,
  priceReply,
  threadHasMedical,
  resolveOfferLabel,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
  startConversation,
  inferFamily,
  suggestAvailableSlots,
  message,
};
