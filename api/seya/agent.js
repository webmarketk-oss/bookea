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
    name: "Épilation Laser",
    brief:
      "Le lead vient pour une épilation définitive. Demande la zone (jambes, maillot, aisselles, visage…). Ne promets pas un tarif. Propose un bilan / première séance, puis un créneau.",
  },
  {
    name: "Épilation définitive",
    brief:
      "Le lead vient pour une épilation définitive. Demande la zone (jambes, maillot, aisselles, visage…). Ne promets pas un tarif. Propose un bilan / première séance, puis un créneau.",
  },
  {
    name: "Hydrafacial",
    brief:
      "Le lead vient pour un soin visage. Demande l’objectif peau (éclat, pores, acné). Propose un hydrafacial ou un soin visage, puis un créneau cette semaine.",
  },
  {
    name: "Soin visage",
    brief:
      "Le lead vient pour un soin visage. Demande l’objectif peau (éclat, pores, acné, hydratation). Propose un soin ou un bilan peau, puis un créneau.",
  },
  {
    name: "Soin minceur",
    brief:
      "Le lead vient pour un minceur. Demande la zone et l’objectif. Propose un bilan minceur, pas une série complète tout de suite, puis un créneau.",
  },
  {
    name: "Cryolipolyse",
    brief:
      "Le lead vient pour un minceur / cryolipolyse. Demande la zone et si un bilan a déjà été fait. Oriente vers un rendez-vous bilan avant de parler prix.",
  },
];

const aliases = [
  {
    keys: ["epilation", "laser", "definitive", "epil"],
    name: "Épilation Laser",
  },
  { keys: ["minceur", "cryo", "cryolipolyse", "cellulite"], name: "Soin minceur" },
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

function familyFromTreatment(treatment) {
  const needle = normalize(treatment);
  if (!needle) {
    return "";
  }
  if (aliases[0].keys.some((key) => needle.includes(key))) {
    return "Épilation définitive";
  }
  if (aliases[1].keys.some((key) => needle.includes(key))) {
    return "Minceur";
  }
  if (aliases[2].keys.some((key) => needle.includes(key))) {
    return "Visage";
  }
  return "";
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
  const next = {
    need: current?.need || fallbackTreatment || "",
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
  const indexMatch = value.match(/\b([123])\b/);
  if (indexMatch) {
    return slots[Number(indexMatch[1]) - 1] || null;
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
  if (settings.qualifyOnSignup && !qualification.need) {
    return "Merci. Quel soin souhaitez-vous : épilation définitive, minceur ou visage ?";
  }
  if (treatmentBrief && !qualification.zone && !qualification.availability) {
    return treatmentBrief;
  }
  if (
    settings.qualifyOnSignup &&
    !qualification.zone &&
    /laser|minceur|cryo|epilation/i.test(normalize(qualification.need))
  ) {
    return `Pour ${qualification.need}, quelle zone voulez-vous traiter ?`;
  }
  if (settings.bookAppointment && !qualification.availability && !qualification.delay) {
    return "Très bien. Quels jours ou créneaux vous iraient le mieux cette semaine ?";
  }
  if (settings.bookAppointment) {
    return "Parfait, je regarde le planning du centre et je vous propose des créneaux réels.";
  }
  if (settings.askForAppointment) {
    return "Merci. Souhaitez-vous qu’une conseillère vous appelle pour poser un rendez-vous ? Répondez oui ou non.";
  }
  return "Merci, je transmets ces informations à l’équipe du centre.";
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
  const treatment = context.treatment || "";
  const offer = resolveOfferLabel(seya, context.campaign, treatment);
  const shown =
    offer ||
    (treatment && !/soin a preciser|lead meta|offre \d+/i.test(normalize(treatment))
      ? treatment
      : "");
  const family = familyFromTreatment(treatment);
  const brief = resolveTreatmentBrief(seya, treatment);
  const opening = shown
    ? `Bonjour ${context.firstName}, merci pour votre inscription chez ${centerName}. Je suis Seya. Vous avez demandé ${shown}${family ? ` (${family})` : ""}. ${brief || "Dites-moi la zone ou l’objectif."}`
    : `Bonjour ${context.firstName}, merci pour votre message chez ${centerName}. Je suis Seya. Quel soin souhaitez-vous : épilation définitive, minceur ou visage ?`;

  return {
    id: context.leadId,
    leadId: context.leadId,
    firstName: context.firstName,
    lastName: context.lastName,
    phone: context.phone,
    treatment,
    campaign: context.campaign || "",
    offerLabel: offer,
    status: "En cours",
    qualification: { need: treatment, zone: "", delay: "", availability: "" },
    proposedSlots: [],
    messages: [message("seya", opening)],
    updatedAt: new Date().toISOString(),
    lastRelanceAt: null,
    relanceCount: 0,
  };
}

function suggestAvailableSlots(appointments, hours, count = 3, duration = 60) {
  const slots = [];
  const today = todayIso();
  const nowMinutes = currentMinutes();
  const week = Array.isArray(hours) && hours.length ? hours : defaultHours();

  for (let offset = 0; offset < 12 && slots.length < count; offset += 1) {
    const date = addDaysIso(today, offset);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const dayHours = week.find((item) => Number(item.weekday) === weekday);
    if (!dayHours || dayHours.closed) {
      continue;
    }
    const start = timeToMinutes(dayHours.startTime || "09:00");
    const end = timeToMinutes(dayHours.endTime || "19:00");
    for (let minutes = start; minutes + duration <= end; minutes += 30) {
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
          minutes + duration,
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

function applyLeadReply(conversation, text, seya, slots) {
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
  const refuses = /pas int[eé]ress|non merci|stop|ne plus|arr[eê]te/i.test(text);
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

  if (chosenSlot && settings.bookAppointment) {
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
    Boolean(qualification.need || conversation.treatment) &&
    (qualification.delay ||
      qualification.availability ||
      /rdv|creneau|créneau|dispo|semaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd/i.test(
        normalize(text),
      ) ||
      conversation.status === "Qualifié");

  if (readyToPropose && slots.length > 0) {
    const list = slots
      .map((slot, index) => `${index + 1}) ${slot.label}`)
      .join("\n");
    return {
      conversation: {
        ...conversation,
        qualification,
        proposedSlots: slots,
        status: "RDV proposé",
        messages: [
          ...(conversation.messages || []),
          message("lead", text),
          message(
            "seya",
            `Merci. Pour ${qualification.need || conversation.treatment || "votre soin"}, voici les prochains créneaux libres :\n${list}\nRépondez 1, 2 ou 3, ou dites-moi un autre jour.`,
          ),
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
  resolveOfferLabel,
  resolveTreatmentBrief,
  startConversation,
  suggestAvailableSlots,
  message,
};
