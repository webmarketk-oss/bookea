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
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Je peux vous proposer un créneau rapidement, vous êtes plutôt dispo en début ou fin de semaine ? Je ne veux pas vous relancer inutilement.",
  },
  {
    name: "Soin minceur",
    price: "",
    brief:
      "Parle comme une réceptionniste. Demande la zone. Ne parle de prix que si on te le demande. Pas de liste de créneaux à la place du tarif.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! C’est plutôt quelle zone ? Je peux ensuite regarder un créneau, je ne veux pas vous relancer inutilement.",
  },
  {
    name: "Soin visage",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quel est votre objectif peau ? Je ne veux pas vous relancer inutilement.",
  },
  {
    name: "Cryolipolyse",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication : transmets à l’équipe.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quelle zone souhaitez-vous traiter ? Je ne veux pas vous relancer inutilement.",
  },
  {
    name: "Hydrafacial",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quel est votre objectif peau ? Je ne veux pas vous relancer inutilement.",
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
    return "Oui, le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?";
  }
  if (/resultat/.test(value) || /combien de temps.*result/.test(value)) {
    return "Les résultats dépendent de la zone et du protocole. On vous les explique au bilan, qui est gratuit. Quand seriez-vous disponible ?";
  }
  if (/combien de temps dure|duree|dure (le )?(rdv|bilan|rendez-vous)/.test(value)) {
    return "Le bilan dure environ 30 à 45 minutes, et il est gratuit. Quel jour vous irait ?";
  }
  if (/fait mal|douloureux|douleur/.test(value)) {
    return "Le bilan est indolore. Pour une séance, ça dépend de la zone, on vous l’explique sur place. Vous voulez un créneau bilan ?";
  }
  return "";
}

function asksLocation(text) {
  return /ou (etes|etes[- ]vous|se trouve)|situ[eé]|adresse|\bc['’]est ou\b|vous etes ou|tu es (ou|situ)/i.test(
    String(text || ""),
  );
}

const BILAN_PRICE_REPLY =
  "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?";

function locationReply(address, centerName) {
  if (address) {
    return `Nous sommes au ${address}. Vous voulez que je vous propose un créneau bilan ?`;
  }
  return `Nous sommes au centre ${centerName || ""}. L’équipe peut vous confirmer l’adresse exacte si besoin.`.replace(
    /\s+/g,
    " ",
  );
}

function hasMedicalFlag(text) {
  return /pacemaker|stimulateur|enceinte|grossesse|cancer|chimio|roaccutane|accutane|implant|photo.?sensib|cardiaque|coeur/i.test(
    String(text || ""),
  );
}

function threadHasMedical(conversation, text) {
  return (
    hasMedicalFlag(text) ||
    (conversation.messages || []).some((item) => hasMedicalFlag(item.text))
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
  return /bonjour,?\s+je suis seya/i.test(String(value || ""));
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
  if (family === "minceur") return "le minceur";
  if (family === "visage") return "le soin visage";
  if (family === "epilation") return "l’épilation définitive";
  return "votre soin";
}

function priceReply(seya, qualification, conversation) {
  const price = resolveTreatmentPrice(
    seya,
    `${qualification?.need || ""} ${qualification?.zone || ""} ${conversation?.treatment || ""}`,
  );
  if (price && /analyse corporelle|devis personnalise|devis personnalisé/i.test(price)) {
    return price;
  }
  return BILAN_PRICE_REPLY;
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
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

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
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
  const hay = `${campaign || ""} ${treatment || ""} ${offer}`;
  const direct = familyFromTreatment(hay);
  if (direct) {
    return direct;
  }
  const maps = agentSettings(seya).offerMaps || [];
  const families = [
    ...new Set(
      maps
        .map((item) => familyFromTreatment(`${item.match} ${item.label}`))
        .filter(Boolean),
    ),
  ];
  return families.length === 1 ? families[0] : "";
}

function familyFromTreatment(treatment) {
  const needle = normalize(treatment);
  if (!needle) {
    return "";
  }
  if (aliases[0].keys.some((key) => needle.includes(key))) {
    return "epilation";
  }
  if (aliases[1].keys.some((key) => needle.includes(key))) {
    return "minceur";
  }
  if (aliases[2].keys.some((key) => needle.includes(key))) {
    return "visage";
  }
  return "";
}

function defaultOfferForFamily(family) {
  if (family === "minceur") return "le minceur";
  if (family === "visage") return "notre soin visage";
  if (family === "epilation") return "l’épilation définitive";
  return "un soin";
}

function defaultOpeningForFamily(family) {
  if (family === "minceur") {
    return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! C’est plutôt quelle zone ? Je peux ensuite regarder un créneau, je ne veux pas vous relancer inutilement.";
  }
  if (family === "visage") {
    return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quel est votre objectif peau ? Je ne veux pas vous relancer inutilement.";
  }
  if (family === "epilation") {
    return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Je peux vous proposer un créneau rapidement, vous êtes plutôt dispo en début ou fin de semaine ? Je ne veux pas vous relancer inutilement.";
  }
  return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande. Je peux vous proposer un créneau rapidement, vous êtes plutôt dispo en début ou fin de semaine ? Je ne veux pas vous relancer inutilement.";
}

function fillOpening(template, vars) {
  return String(template || "")
    .replace(/\{prenom\}/gi, vars.prenom)
    .replace(/\{firstName\}/gi, vars.prenom)
    .replace(/\{centre\}/gi, vars.centre)
    .replace(/\{center\}/gi, vars.centre)
    .replace(/\{offre\}/gi, vars.offre)
    .replace(/\{offer\}/gi, vars.offre)
    .replace(/Bonjour\s+,/g, "Bonjour,")
    .replace(/\(\s*\)/g, "")
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
  const offer =
    resolveOfferLabel(seya, context.campaign, context.treatment) ||
    defaultOfferForFamily(family);
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
    "cuisses",
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

function nextQualificationQuestion(qualification, seya, fallbackTreatment) {
  const settings = agentSettings(seya);
  const treatmentBrief = resolveTreatmentBrief(
    seya,
    qualification.need || fallbackTreatment,
  );
  if (settings.qualifyOnSignup && (!qualification.need || isJunkTreatment(qualification.need))) {
    return "C’est pour du minceur, du visage ou de l’épilation ?";
  }
  if (treatmentBrief && !qualification.zone && !qualification.availability) {
    return /pacemaker|prix|tarif|créneau|receptionniste|réceptionniste/i.test(treatmentBrief)
      ? "C’est plutôt quelle zone ?"
      : treatmentBrief;
  }
  if (
    settings.qualifyOnSignup &&
    !qualification.zone &&
    /laser|minceur|cryo|epilation/i.test(normalize(qualification.need))
  ) {
    return "C’est plutôt quelle zone ?";
  }
  if (settings.bookAppointment && !qualification.availability && !qualification.delay) {
    return "Vous êtes plutôt dispo en début ou fin de semaine ? Je ne veux pas vous relancer inutilement.";
  }
  if (settings.bookAppointment) {
    return "Je regarde le planning et je vous propose ce qui est vraiment libre.";
  }
  if (settings.askForAppointment) {
    return "Vous voulez que je fasse passer ça à une conseillère pour caler un créneau ?";
  }
  return "Je transmets ça à l’équipe du centre.";
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
  const offer =
    resolveOfferLabel(seya, context.campaign, treatment || context.treatment) ||
    defaultOfferForFamily(family);
  const opening = buildOpeningMessage(context, centerName, seya);

  return {
    id: context.leadId,
    leadId: context.leadId,
    firstName: context.firstName,
    lastName: context.lastName,
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
    proposedSlots: [],
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

function pickSlotsForMessage(appointments, hours, conversation, text) {
  const request = parseDayRequest(text, conversation);
  const days = request.date || request.weekdays.length ? 45 : 14;
  const options = {
    count: 3,
    days,
    weekdays: request.weekdays,
    date: request.date,
    excludeWeekdays: request.excludeWeekdays,
    excludeDates: request.excludeDates,
  };
  let slots = suggestAvailableSlots(appointments, hours, options);
  if (!slots.length && request.date) {
    slots = suggestAvailableSlots(appointments, hours, {
      ...options,
      date: "",
      days: 45,
    });
  }
  if (!slots.length) {
    slots = suggestAvailableSlots(appointments, hours, {
      count: 3,
      days: 21,
      excludeWeekdays: request.excludeWeekdays,
      excludeDates: request.excludeDates,
    });
  }
  return slots;
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
  const today = todayIso();
  const nowMinutes = currentMinutes();
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
    return {
      conversation: {
        ...conversation,
        qualification,
        status: "Pas intéressé",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message("seya", "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous."),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (hasMedicalFlag(text) || (threadHasMedical(conversation, text) && settings.handoffToHuman)) {
    const alreadyFlagged = conversation.status === "À recontacter" && !hasMedicalFlag(text);
    return {
      conversation: {
        ...conversation,
        qualification,
        status: "À recontacter",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message(
            "seya",
            alreadyFlagged
              ? "Je transmets cette préférence à l’équipe, elle reviendra vers vous après vérification."
              : "Il faut que l’équipe vérifie votre situation avant de confirmer. Je leur transmets pour voir si c’est adapté.",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  const faq = faqReply(text);
  if (faq) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: qualification.need ? "Qualifié" : "En cours",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message("seya", faq),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (asksLocation(text)) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: qualification.need ? "Qualifié" : "En cours",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message(
            "seya",
            locationReply(extras.centerAddress, extras.centerName || ""),
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (asksPrice(text)) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: qualification.need ? "Qualifié" : "En cours",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message("seya", priceReply(seya, qualification, conversation)),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (wantsRdv || (settings.handoffToHuman && /conseill|humain|appeler|rappel/i.test(text))) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: "À recontacter",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message(
            "seya",
            "Parfait. Je transmets à une conseillère du centre, elle vous recontacte rapidement.",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (chosenSlot && settings.bookAppointment && !threadHasMedical(conversation, text)) {
    return {
      conversation: {
        ...conversation,
        qualification,
        bookedSlot: chosenSlot,
        status: "RDV pris",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message(
            "seya",
            `Parfait, je bloque ${chosenSlot.label} pour ${qualification.need || conversation.treatment || "votre soin"}. Vous recevrez la confirmation du centre.`,
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: chosenSlot,
    };
  }

  const readyToPropose =
    settings.bookAppointment &&
    !asksPrice(text) &&
    !asksLocation(text) &&
    !faqReply(text) &&
    !threadHasMedical(conversation, text) &&
    Boolean(qualification.need || conversation.treatment) &&
    !isJunkTreatment(qualification.need || conversation.treatment) &&
    (qualification.delay ||
      qualification.availability ||
      /rdv|creneau|créneau|dispo|semaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd/i.test(
        normalize(text),
      ));

  if (readyToPropose && slots.length === 0) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: "Qualifié",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message(
            "seya",
            "Je n’ai plus de place sur ce jour-là. Quel autre jour vous irait ?",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (readyToPropose && slots.length > 0) {
    return {
      conversation: {
        ...conversation,
        qualification,
        proposedSlots: slots,
        status: "RDV proposé",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message("seya", humanSlotReply(slots)),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  const nextQuestion = nextQualificationQuestion(
    qualification,
    seya,
    conversation.treatment,
  );
  return {
    conversation: {
      ...conversation,
      qualification,
      status: qualification.need ? "Qualifié" : "En cours",
      messages: [
        ...(conversation.messages || []),
        message("lead", text),
        message("seya", nextQuestion),
      ],
      updatedAt: new Date().toISOString(),
    },
    shouldBook: null,
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
    return `Bonjour ${firstName}, c’est Seya. Je reviens vers vous pour ${treatment}. Souhaitez-vous que je vous propose un créneau cette semaine, ou préférez-vous que l’on arrête les messages ?`;
  }
  return `Bonjour ${firstName}, c’est Seya. Je voulais juste reprendre pour ${treatment}. Quel jour vous irait le mieux ?`;
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
  applyLeadReply,
  familyFromTreatment,
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
  suggestAvailableSlots,
  message,
};
