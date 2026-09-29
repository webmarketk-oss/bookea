const { classifyPriceQuestion, isPriceRepeatComplaint } = require("./price");
const { isHesitation, isShortYes, refusesSlots, wantsSlots, weekHalfFromText } = require("./conversation");

const WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

function emptyBookingState(centerId) {
  return {
    centerId: centerId || null,
    serviceIntent: "",
    requestedDate: null,
    requestedWeekday: null,
    weekHalf: null,
    rejectedDates: [],
    rejectedWeekdays: [],
    lastOfferedSlots: [],
    pendingQuestion: null,
    appointmentStatus: "none",
    priceAskCount: 0,
    lastPriceIntent: null,
    unansweredPriceIntent: null,
    lastLeadPriceText: "",
  };
}

function normalizeBookingState(value, centerId) {
  const current = value && typeof value === "object" ? value : {};
  const base = emptyBookingState(centerId || current.centerId);
  return {
    ...base,
    ...current,
    rejectedDates: unique(current.rejectedDates || []),
    rejectedWeekdays: unique(current.rejectedWeekdays || []),
    lastOfferedSlots: Array.isArray(current.lastOfferedSlots)
      ? current.lastOfferedSlots
      : [],
    priceAskCount: Number(current.priceAskCount || 0),
    lastPriceIntent: current.lastPriceIntent || null,
    unansweredPriceIntent: current.unansweredPriceIntent || null,
    lastLeadPriceText: current.lastLeadPriceText || "",
  };
}

function applyBookingMessage(state, text, extras = {}) {
  const next = normalizeBookingState(state, extras.centerId);
  if (extras.centerId) {
    next.centerId = extras.centerId;
  }
  const value = normalize(text);
  const now = extras.now instanceof Date ? extras.now : new Date();

  if (/ventre|poids|minceur|mincir|maigrir|cryo|graisse|cellulite/.test(value)) {
    next.serviceIntent = "minceur_ventre";
  }

  const explicitDate = parseExplicitDate(text, now);
  if (explicitDate) {
    next.requestedDate = explicitDate;
    next.requestedWeekday = weekdayOf(explicitDate);
    next.weekHalf = null;
    next.pendingQuestion = null;
  }

  const namedDays = WEEKDAYS.map((day, index) =>
    value.includes(day) ? index : -1,
  ).filter((index) => index >= 0);

  if (!explicitDate && namedDays.length === 1 && !/pas (dispo|disponible).*|pas le /.test(value)) {
    next.requestedWeekday = namedDays[0];
    next.requestedDate = nextDateForWeekday(namedDays[0], now);
    next.weekHalf = null;
    next.pendingQuestion = null;
  }

  const weekHalf = weekHalfFromText(text);
  if (weekHalf) {
    next.weekHalf = weekHalf;
    next.requestedDate = null;
    next.requestedWeekday = null;
    next.lastOfferedSlots = [];
    next.pendingQuestion = null;
  }

  if (/suivant|prochain|un autre (lundi|mardi|mercredi|jeudi|vendredi|samedi)/.test(value)) {
    const weekday = namedDays[0] ?? next.requestedWeekday;
    if (next.requestedDate) {
      next.rejectedDates = unique([...next.rejectedDates, next.requestedDate]);
    }
    next.lastOfferedSlots.forEach((slot) => {
      next.rejectedDates = unique([...next.rejectedDates, slot.date]);
    });
    if (weekday != null) {
      next.requestedWeekday = weekday;
      const after = addDays(next.requestedDate || todayIso(now), 1);
      next.requestedDate = nextDateForWeekday(weekday, new Date(`${after}T12:00:00`));
    }
  }

  if (/pas (dispo|disponible) le lundi|pas le lundi|pas disponible le lundi/.test(value)) {
    next.rejectedWeekdays = unique([...next.rejectedWeekdays, 1]);
    next.lastOfferedSlots
      .filter((slot) => weekdayOf(slot.date) === 1)
      .forEach((slot) => {
        next.rejectedDates = unique([...next.rejectedDates, slot.date]);
      });
  }

  const numbered = value.match(/lundi\s*(\d{1,2})/);
  if (numbered) {
    upcomingDatesForWeekday(1, now, 45)
      .filter((date) => Number(date.slice(-2)) === Number(numbered[1]))
      .forEach((date) => {
        next.rejectedDates = unique([...next.rejectedDates, date]);
      });
  }

  if (/change de jour|un autre jour|autres? horaires|pas ce jour/.test(value)) {
    next.lastOfferedSlots.forEach((slot) => {
      next.rejectedDates = unique([...next.rejectedDates, slot.date]);
    });
    next.requestedDate = null;
    next.requestedWeekday = null;
    next.weekHalf = null;
    next.pendingQuestion = "other_day";
  }

  if (/^non\s+jeudi/.test(value) || /non jeudi/.test(value)) {
    next.lastOfferedSlots.forEach((slot) => {
      next.rejectedDates = unique([...next.rejectedDates, slot.date]);
    });
    next.rejectedWeekdays = unique([
      ...next.rejectedWeekdays,
      ...weekdaysOf(next.lastOfferedSlots),
    ]).filter((day) => day !== 4);
    next.requestedWeekday = 4;
    if (!explicitDate) {
      next.requestedDate = nextDateForWeekday(4, now);
    }
    next.pendingQuestion = null;
  }

  const priceIntent = classifyPriceQuestion(text);
  if (priceIntent === "repeat_complaint") {
    next.pendingQuestion = "price";
    next.unansweredPriceIntent = next.unansweredPriceIntent || next.lastPriceIntent || "next_session";
  } else if (priceIntent) {
    next.pendingQuestion = "price";
    next.priceAskCount += 1;
    next.lastPriceIntent = priceIntent;
    next.unansweredPriceIntent = priceIntent;
    next.lastLeadPriceText = String(text || "").trim();
  } else if (refusesSlots(text) || isHesitation(text)) {
    next.pendingQuestion = "no_slots";
  } else if (asksLocation(text)) {
    next.pendingQuestion = "address";
  } else if (faqKind(text)) {
    next.pendingQuestion = faqKind(text);
  } else if (!/lundi|mardi|mercredi|jeudi|vendredi|samedi|dispo|creneau|rendez-vous|rdv/.test(value)) {
    if (next.pendingQuestion === "price" || next.pendingQuestion === "address") {
      next.pendingQuestion = next.pendingQuestion;
    }
  } else if (namedDays.length || explicitDate || wantsSlots(text)) {
    next.pendingQuestion = null;
  }

  return next;
}

function shouldSearchSlots(state, text, conversation) {
  if (
    asksPrice(text) ||
    asksLocation(text) ||
    faqKind(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    state.unansweredPriceIntent ||
    refusesSlots(text) ||
    isHesitation(text)
  ) {
    return false;
  }
  if (state.pendingQuestion === "no_slots" && !wantsSlots(text, conversation)) {
    return false;
  }
  if (state.pendingQuestion === "price" || state.pendingQuestion === "address") {
    if (!wantsSlots(text, conversation)) {
      return false;
    }
  }
  if ((state.lastOfferedSlots || []).length && !asksForOtherSlots(text)) {
    return false;
  }
  return (
    wantsSlots(text, conversation) ||
    (state.pendingQuestion === "offer_slots" && isShortYes(text))
  );
}

function asksForOtherSlots(text) {
  const value = normalize(text);
  return /change de jour|un autre jour|autres? horaires|d[' ]autres creneaux|propose quoi|suivant|prochain|debut de semaine|fin de semaine/.test(
    value,
  ) || /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|demain)\b/.test(value);
}

function weekHalfDays(half) {
  if (half === "start") {
    return [1, 2, 3];
  }
  if (half === "end") {
    return [4, 5, 6];
  }
  return [];
}

function matchesWeekHalf(slot, state) {
  const allowed = weekHalfDays(state.weekHalf);
  if (!allowed.length || state.requestedDate || state.requestedWeekday != null) {
    return true;
  }
  return allowed.includes(weekdayOf(slot.date));
}

function guardSlots(slots, state, extras = {}) {
  const list = Array.isArray(slots) ? slots : [];
  const rejected = new Set(state.rejectedDates || []);
  const rejectedDays = new Set(state.rejectedWeekdays || []);
  const alreadyOffered = new Set(
    (state.lastOfferedSlots || []).map((slot) => `${slot.date}|${slot.time}`),
  );

  const leaked = list.filter((slot) => {
    if (state.requestedDate && slot.date !== state.requestedDate) return true;
    if (
      !state.requestedDate &&
      state.requestedWeekday != null &&
      weekdayOf(slot.date) !== state.requestedWeekday
    ) {
      return true;
    }
    if (!matchesWeekHalf(slot, state)) return true;
    if (rejected.has(slot.date)) return true;
    if (rejectedDays.has(weekdayOf(slot.date))) return true;
    return false;
  });

  if (leaked.some((slot) => slot.label)) {
    console.error("[seya/booking] slot_mismatch", {
      centerId: state.centerId,
      requestedDate: state.requestedDate,
      requestedWeekday: state.requestedWeekday,
      leaked: leaked.map((slot) => slot.label).filter(Boolean),
    });
  }

  const kept = list.filter((slot) => {
    if (extras.centerId && state.centerId && extras.centerId !== state.centerId) {
      return false;
    }
    if (state.requestedDate && slot.date !== state.requestedDate) {
      return false;
    }
    if (
      !state.requestedDate &&
      state.requestedWeekday != null &&
      weekdayOf(slot.date) !== state.requestedWeekday
    ) {
      return false;
    }
    if (!matchesWeekHalf(slot, state)) {
      return false;
    }
    if (rejected.has(slot.date) || rejectedDays.has(weekdayOf(slot.date))) {
      return false;
    }
    if (alreadyOffered.has(`${slot.date}|${slot.time}`) && extras.allowRepeat !== true) {
      return false;
    }
    return true;
  });

  if (!kept.length) {
    return {
      slots: [],
      blocked: true,
      fallback: emptySlotFallback(state),
    };
  }

  return { slots: kept.slice(0, 3), blocked: false, fallback: null };
}

function emptySlotFallback(state) {
  if (state.requestedDate) {
    const label = formatHumanDate(state.requestedDate);
    const day = WEEKDAYS[weekdayOf(state.requestedDate)];
    return `Je n’ai pas de disponibilité ${label} pour ce bilan. Souhaitez-vous que je regarde le ${day} suivant ou une autre journée ?`;
  }
  if (state.requestedWeekday != null) {
    return `Je n’ai pas de disponibilité ${WEEKDAYS[state.requestedWeekday]} pour ce bilan. Souhaitez-vous un autre jour ?`;
  }
  if (state.weekHalf === "start") {
    return "Je n’ai plus de place en début de semaine. Souhaitez-vous plutôt la fin de semaine ?";
  }
  if (state.weekHalf === "end") {
    return "Je n’ai plus de place en fin de semaine. Souhaitez-vous plutôt le début de semaine ?";
  }
  return "Parfait. Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?";
}

function slotAllowed(slot, state) {
  if (!slot?.date) {
    return false;
  }
  return !guardSlots([slot], { ...state, lastOfferedSlots: [] }, { allowRepeat: true })
    .blocked;
}

function replyHasForbiddenSlots(text, state) {
  const raw = String(text || "");
  const value = normalize(raw);
  const proposesTime = /\d{1,2}\s*h\d{0,2}|propose/.test(value);
  if (!proposesTime) {
    return false;
  }

  const year = state.requestedDate
    ? Number(state.requestedDate.slice(0, 4))
    : new Date().getFullYear();
  const dates = [...raw.matchAll(/(\d{1,2})\/(\d{1,2})/g)];
  for (const match of dates) {
    const iso = `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    if (!slotAllowed({ date: iso, time: "09:00" }, state)) {
      return true;
    }
  }

  const weekday = state.requestedWeekday;
  if (weekday != null && weekday !== 1 && /\blun(di|\.)/.test(value)) {
    return true;
  }
  if ((state.rejectedWeekdays || []).includes(1) && /\blun(di|\.)/.test(value)) {
    return true;
  }
  if (state.requestedDate && weekdayOf(state.requestedDate) !== 1 && /\blun(di|\.)/.test(value)) {
    return true;
  }
  return false;
}

function enforceOutgoingText(text, state) {
  if (!replyHasForbiddenSlots(text, state)) {
    return text;
  }
  console.error("[seya/booking] reply_mismatch", {
    centerId: state.centerId,
    requestedDate: state.requestedDate,
    requestedWeekday: state.requestedWeekday,
    rejectedDates: state.rejectedDates,
    preview: String(text || "").slice(0, 160),
  });
  return emptySlotFallback(state);
}

function markPriceAnswered(state) {
  return {
    ...state,
    unansweredPriceIntent: null,
    pendingQuestion: state.pendingQuestion === "price" ? null : state.pendingQuestion,
  };
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

function asksLocation(text) {
  return /ou (etes|etes[- ]vous|se trouve)|situ[eé]|adresse|\bc['’]est ou\b|vous etes ou|tu es (ou|situ)/i.test(
    String(text || ""),
  );
}

function faqKind(text) {
  const value = normalize(text);
  if (/gratuit|offert/.test(value) && /bilan|decouverte|seance/.test(value)) {
    return "free";
  }
  if (/resultat/.test(value)) return "results";
  if (/combien de temps dure|duree|dure (le )?(rdv|bilan)/.test(value)) {
    return "duration";
  }
  if (/fait mal|douloureux|douleur/.test(value)) return "pain";
  return "";
}

function parseExplicitDate(text, now) {
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
    let year = now.getFullYear();
    let date = new Date(year, months[named[2]], Number(named[1]));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date < today) {
      date = new Date(year + 1, months[named[2]], Number(named[1]));
    }
    return toIso(date);
  }
  const slash = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : now.getFullYear();
    return `${year}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
  }
  return null;
}

function nextDateForWeekday(weekday, from) {
  const start = from instanceof Date ? from : new Date(`${from}T12:00:00`);
  for (let offset = 0; offset < 21; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    if (date.getDay() === weekday) {
      return toIso(date);
    }
  }
  return null;
}

function upcomingDatesForWeekday(weekday, from, days) {
  const dates = [];
  const start = from instanceof Date ? from : new Date(`${from}T12:00:00`);
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    if (date.getDay() === weekday) {
      dates.push(toIso(date));
    }
  }
  return dates;
}

function weekdayOf(iso) {
  return new Date(`${iso}T12:00:00`).getDay();
}

function weekdaysOf(slots) {
  return unique((slots || []).map((slot) => weekdayOf(slot.date)));
}

function formatHumanDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const day = WEEKDAYS[date.getDay()];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${day} ${dd}/${mm}`;
}

function todayIso(now) {
  const date = now instanceof Date ? now : new Date();
  return toIso(date);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

function toIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function unique(list) {
  return [...new Set((list || []).filter((item) => item || item === 0))];
}

module.exports = {
  WEEKDAYS,
  applyBookingMessage,
  asksLocation,
  asksPrice,
  emptyBookingState,
  emptySlotFallback,
  enforceOutgoingText,
  faqKind,
  guardSlots,
  markPriceAnswered,
  normalizeBookingState,
  replyHasForbiddenSlots,
  shouldSearchSlots,
  slotAllowed,
};
