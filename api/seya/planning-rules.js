const WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

function isPlanningProspectTone(text) {
  return /c['’]est seya|lequel vous irait|quelle zone|debut ou fin de semaine|je vous laisse revenir|écrivez-moi quand|vous recevrez la confirmation|bonjour \{?prenom/i.test(
    String(text || ""),
  );
}

function formatPlanningHours(hours) {
  return (hours || [])
    .filter((day) => !day.closed)
    .map(
      (day) =>
        `${day.label || WEEKDAYS[day.weekday] || ""} ${String(day.startTime || "").slice(0, 5)}-${String(day.endTime || "").slice(0, 5)}`.trim(),
    )
    .filter(Boolean)
    .join(", ");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .trim();
}

function planningMessage(author, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text: String(text || "").trim(),
    at: new Date().toISOString(),
  };
}

function findTreatment(settings, hint) {
  const needle = normalize(hint);
  if (!needle) {
    return undefined;
  }
  const briefs = settings?.treatmentBriefs || [];
  return (
    briefs.find((item) => normalize(item.name) === needle) ||
    briefs.find((item) => {
      const name = normalize(item.name);
      return Boolean(name) && (needle.includes(name) || name.includes(needle));
    })
  );
}

function matchPlanningSlot(text, slots) {
  const value = normalize(text);
  if (!value || !slots?.length) {
    return null;
  }
  const exact = slots.find(
    (slot) => normalize(slot.label) && value.includes(normalize(slot.label)),
  );
  if (exact) {
    return exact;
  }
  const clock = value.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  if (!clock) {
    return slots.length === 1 && /oui|ok|daccord|pose|bloque|valide/.test(value)
      ? slots[0]
      : null;
  }
  const time = `${String(Number(clock[1])).padStart(2, "0")}:${clock[2] || "00"}`;
  return slots.find((slot) => slot.time === time) || null;
}

function extractClientName(text) {
  const match = String(text || "").match(
    /\b(?:pour|de)\s+([A-ZÉÈÊÀÂÎÔÛÄËÏÖÜÇ][\p{L}'’-]+(?:\s+[A-ZÉÈÊÀÂÎÔÛÄËÏÖÜÇ][\p{L}'’-]+)?)/u,
  );
  return match?.[1]?.trim() || "";
}

function extractNeed(text) {
  const value = normalize(text);
  const matches = [
    ["hydrafacial", "Hydrafacial"],
    ["laser", "Épilation laser"],
    ["epilation", "Épilation laser"],
    ["definitive", "Épilation laser"],
    ["minceur", "Soin minceur"],
    ["cryolipolyse", "Cryolipolyse"],
    ["cryo", "Cryolipolyse"],
    ["visage", "Soin visage"],
    ["bilan", "Bilan"],
    ["massage", "Massage"],
  ];
  for (const [needle, label] of matches) {
    if (value.includes(needle)) {
      return label;
    }
  }
  return "";
}

function slotList(slots) {
  const labels = (slots || []).slice(0, 5).map((slot) => slot.label).filter(Boolean);
  if (!labels.length) {
    return "Aucun créneau libre sur les semaines à venir pour ce jour et cet horaire. Je peux regarder un autre jour.";
  }
  if (labels.length === 1) {
    return `Créneau libre : ${labels[0]}.`;
  }
  return `Créneaux libres : ${labels.join(" · ")}.`;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
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

function todayIso(now) {
  const date = now instanceof Date ? now : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysIso(date, days) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPlanningSlotLabel(date, time) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const short = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const [, month, day] = date.split("-");
  return `${short[weekday]} ${day}/${month} à ${time.replace(":", "h")}`;
}

function namedWeekdays(text) {
  const value = normalize(text);
  return WEEKDAYS.map((day, index) => (value.includes(day) ? index : -1)).filter(
    (index) => index >= 0,
  );
}

function pinsNextWeekday(text) {
  const value = normalize(text);
  return /\bce (lundi|mardi|mercredi|jeudi|vendredi|samedi)\b|\b(lundi|mardi|mercredi|jeudi|vendredi|samedi) prochain\b/.test(
    value,
  );
}

function timeWindowFromText(text) {
  const value = normalize(text).replace(/\bmidi\b/g, "12h");
  const range = value.match(
    /(?:entre\s+)?(\d{1,2})\s*h(?:\s*(\d{2}))?\s+(?:et|a|-)\s+(\d{1,2})\s*h(?:\s*(\d{2}))?/,
  );
  if (range) {
    return {
      from: Number(range[1]) * 60 + Number(range[2] || 0),
      to: Number(range[3]) * 60 + Number(range[4] || 0),
    };
  }
  const single = value.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  if (single && !/horaire|ouvert/.test(value)) {
    const from = Number(single[1]) * 60 + Number(single[2] || 0);
    return { from, to: from + 60 };
  }
  return null;
}

function planningSlotBusy(appointments, date, time, duration) {
  const start = timeToMinutes(time);
  const end = start + duration;
  const onDay = (appointments || []).filter((item) => {
    if (item.date !== date) {
      return false;
    }
    return !/annul|cancel/i.test(String(item.status || ""));
  });
  const overlaps = (item) => {
    const otherStart = timeToMinutes(String(item.start || "00:00"));
    const otherEnd = otherStart + (Number(item.duration) > 0 ? Number(item.duration) : 60);
    return start < otherEnd && otherStart < end;
  };
  const cabinIds = [
    ...new Set((appointments || []).map((item) => String(item.cabinId || "")).filter(Boolean)),
  ];
  if (cabinIds.length >= 2) {
    return cabinIds.every((cabinId) =>
      onDay.some((item) => String(item.cabinId || "") === cabinId && overlaps(item)),
    );
  }
  return onDay.some(overlaps);
}

function parisMinutes(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function pickPlanningSlots(appointments, hours, text, extras) {
  const now = extras?.now instanceof Date ? extras.now : new Date();
  const duration = extras?.duration || 75;
  const today = todayIso(now);
  const weekdays = namedWeekdays(text);
  const window = timeWindowFromText(text);
  const pinNext = pinsNextWeekday(text);
  const week = Array.isArray(hours) && hours.length ? hours : [];
  const slots = [];
  const seenDays = new Set();
  const nowMinutes = parisMinutes(now);

  for (let offset = 0; offset < 56 && slots.length < 4; offset += 1) {
    const date = addDaysIso(today, offset);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (weekdays.length && !weekdays.includes(weekday)) {
      continue;
    }
    if (pinNext && weekdays.length === 1 && seenDays.size > 0) {
      break;
    }
    const dayHours = week.find((item) => Number(item.weekday) === weekday);
    if (!dayHours || dayHours.closed) {
      continue;
    }
    const open = timeToMinutes(String(dayHours.startTime || "09:00").slice(0, 5));
    const close = timeToMinutes(String(dayHours.endTime || "19:00").slice(0, 5));
    for (let minutes = open; minutes + duration <= close; minutes += 30) {
      if (window && (minutes < window.from || minutes >= window.to)) {
        continue;
      }
      if (date === today && minutes < nowMinutes + 60) {
        continue;
      }
      const time = minutesToTime(minutes);
      if (planningSlotBusy(appointments, date, time, duration)) {
        continue;
      }
      slots.push({
        date,
        time,
        label: formatPlanningSlotLabel(date, time),
      });
      seenDays.add(date);
      if (weekdays.length) {
        break;
      }
    }
  }

  return slots;
}

function applyPlanningReply(conversation, text, settings, slots, extras) {
  const command = String(text || "").trim();
  const hours = extras?.hours || [];
  const need = extractNeed(command) || conversation.treatment || "";
  const hint = `${command} ${conversation.treatment || ""} ${conversation.qualification?.need || ""}`;
  const brief =
    findTreatment(settings, need) || findTreatment(settings, hint);
  const care = need || brief?.name || conversation.treatment || "";
  const clientName = extractClientName(command);
  const chosen = matchPlanningSlot(command, [
    ...(conversation.proposedSlots || []),
    ...(slots || []),
  ]);

  let reply = "";
  let shouldBook = null;

  if (/prix|tarif|combien|coute|coûte|\bcout\b/i.test(command)) {
    const price = String(brief?.price || "").trim();
    reply = price
      ? `Selon la fiche soin : ${price}.`
      : "Pas de tarif en fiche pour ce soin. Vérifiez le brief dans Seya CRM.";
    if (brief?.brief) {
      reply += ` ${brief.brief}`;
    }
  } else if (/horaire|ouvert|on ouvre|fermeture|jusqu['’]?a quelle heure|c['’]est ouvert/i.test(command)) {
    const open = formatPlanningHours(hours);
    reply = open
      ? `Horaires du centre : ${open}.`
      : "Aucun horaire renseigné pour ce centre.";
  } else if (
    chosen &&
    /pose|bloque|valide|confirme|oui|ok|daccord/.test(normalize(command))
  ) {
    shouldBook = chosen;
    reply = clientName
      ? `Je pose ${chosen.label} pour ${clientName}${care ? ` · ${care}` : ""}.`
      : `Je pose ${chosen.label}${care ? ` · ${care}` : ""}. Donnez-moi le nom si ce n’est pas déjà sur la fiche.`;
  } else if (
    /creneau|créneau|dispo|planning|libre|rendez-vous|\brdv\b|pose|bloque/i.test(command) ||
    ((slots || []).length > 0 &&
      /jeudi|lundi|mardi|mercredi|vendredi|samedi|demain|semaine/i.test(command))
  ) {
    reply = slotList(slots);
    if (brief?.brief) {
      reply += ` Brief ${brief.name} : ${brief.brief}`;
    }
  } else if (brief?.brief) {
    reply = `Brief ${brief.name} : ${brief.brief}${brief.price ? ` Tarif fiche : ${brief.price}.` : ""}`;
  } else if (String(settings?.brief || "").trim()) {
    reply = `Consignes du centre : ${String(settings.brief).trim()}`;
  } else {
    reply =
      "Seya Planning est là pour l’équipe : créneau libre, tarif fiche, brief soin, pause ou pose de RDV. Dites le soin et le jour.";
  }

  const [firstName, ...lastParts] = clientName.split(/\s+/);
  return {
    conversation: {
      ...conversation,
      firstName: firstName || conversation.firstName,
      lastName: lastParts.join(" ") || conversation.lastName,
      treatment: care || conversation.treatment,
      proposedSlots: slots?.length ? slots : conversation.proposedSlots,
      messages: [
        ...(conversation.messages || []),
        planningMessage("centre", command),
        planningMessage("seya", reply.trim()),
      ],
      updatedAt: new Date().toISOString(),
    },
    shouldBook,
  };
}

module.exports = {
  applyPlanningReply,
  formatPlanningHours,
  isPlanningProspectTone,
  pickPlanningSlots,
};
