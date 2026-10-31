/**
 * Dates et heures de rendez-vous citées dans un message Seya, pour vérifier qu’un texte
 * n’annonce que des créneaux réellement proposés par l’agenda.
 */

const MONTHS = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
};

// Heures d’ouverture plausibles : « 1h » ou « 2h » sont des durées, pas des créneaux.
const FIRST_HOUR = 7;
const LAST_HOUR = 21;

function pad(value) {
  return String(value).padStart(2, "0");
}

function mentionedTimes(text) {
  const times = new Set();
  for (const match of String(text || "").matchAll(/(?<![\d/])(\d{1,2})\s*h\s*(\d{2})?(?!\d)/gi)) {
    const hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    if (hour >= FIRST_HOUR && hour <= LAST_HOUR && minutes < 60) {
      times.add(`${pad(hour)}:${pad(minutes)}`);
    }
  }
  return times;
}

function mentionedDays(text) {
  const days = new Set();
  const raw = String(text || "");
  for (const match of raw.matchAll(/(?<!\d)(\d{1,2})\/(\d{1,2})(?![\d/])/g)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      days.add(`${pad(month)}-${pad(day)}`);
    }
  }
  const monthNames = Object.keys(MONTHS).join("|");
  const named = new RegExp(`(?<!\\d)(1er|\\d{1,2})\\s+(${monthNames})`, "gi");
  for (const match of raw.matchAll(named)) {
    const day = match[1].toLowerCase() === "1er" ? 1 : Number(match[1]);
    const month = MONTHS[match[2].toLowerCase()];
    if (day >= 1 && day <= 31 && month) {
      days.add(`${pad(month)}-${pad(day)}`);
    }
  }
  return days;
}

function slotTime(slot) {
  return String(slot?.time || "").slice(0, 5);
}

function slotDay(slot) {
  return String(slot?.date || "").slice(5, 10);
}

/** Le texte ne cite aucune date ni heure en dehors de ces créneaux (ou du texte de référence). */
function onlyMentionsSlots(text, slots, reference = "") {
  const list = (Array.isArray(slots) ? slots : []).filter((slot) => slot?.date && slot?.time);
  const allowedTimes = new Set([...list.map(slotTime), ...mentionedTimes(reference)]);
  const allowedDays = new Set([...list.map(slotDay), ...mentionedDays(reference)]);
  for (const time of mentionedTimes(text)) {
    if (!allowedTimes.has(time)) {
      return false;
    }
  }
  for (const day of mentionedDays(text)) {
    if (!allowedDays.has(day)) {
      return false;
    }
  }
  return true;
}

/** Le créneau est compatible avec ce que le message annonçait (heure et jour cités, s’il y en a). */
function slotMatchesText(slot, text) {
  const times = mentionedTimes(text);
  const days = mentionedDays(text);
  if (times.size && !times.has(slotTime(slot))) {
    return false;
  }
  if (days.size && !days.has(slotDay(slot))) {
    return false;
  }
  return true;
}

module.exports = {
  mentionedDays,
  mentionedTimes,
  onlyMentionsSlots,
  slotMatchesText,
};
