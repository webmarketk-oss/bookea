const { classifyPriceQuestion, isPriceRepeatComplaint } = require("./price");
const {
  asksOtherDay,
  dayPartFromText,
  isAlreadyBookedElsewhere,
  isAppointmentConfirmed,
  isAskToWriteBack,
  isHesitation,
  isOutOfZone,
  isShortYes,
  isWillComeBack,
  isOpeningHoursAsk,
  isThreadComplaint,
  isServiceAsk,
  isWaitUntilLater,
  isMessageTimeMention,
  isRescheduleAsk,
  wantsNoon,
  lastSeyaAskedToSearch,
  parseClockMinutes,
  refusesSlots,
  wantsSlots,
  weekHalfFromText,
  asksNextWeek,
  hasDayOfMonthRequest,
} = require("./conversation");

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
    dayPart: null,
    rejectedDates: [],
    rejectedWeekdays: [],
    rejectedSlots: [],
    lastOfferedSlots: [],
    pendingQuestion: null,
    appointmentStatus: "none",
    priceAskCount: 0,
    lastPriceIntent: null,
    unansweredPriceIntent: null,
    lastLeadPriceText: "",
    preferredTime: null,
    preferredTimes: [],
    searchFrom: null,
    strictWeekday: false,
    weekdayFromName: false,
    dateFlexible: false,
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
    rejectedSlots: Array.isArray(current.rejectedSlots)
      ? current.rejectedSlots.filter((slot) => slot?.date && slot?.time)
      : [],
    lastOfferedSlots: Array.isArray(current.lastOfferedSlots)
      ? current.lastOfferedSlots
      : [],
    priceAskCount: Number(current.priceAskCount || 0),
    lastPriceIntent: current.lastPriceIntent || null,
    unansweredPriceIntent: current.unansweredPriceIntent || null,
    lastLeadPriceText: current.lastLeadPriceText || "",
    preferredTime: current.preferredTime || null,
    preferredTimes: Array.isArray(current.preferredTimes)
      ? current.preferredTimes.filter(Boolean)
      : current.preferredTime
        ? [current.preferredTime]
        : [],
    searchFrom: current.searchFrom || null,
    strictWeekday: Boolean(current.strictWeekday),
    weekdayFromName: Boolean(current.weekdayFromName),
    dateFlexible: Boolean(current.dateFlexible),
  };
}

function applyBookingMessage(state, text, extras = {}) {
  const next = normalizeBookingState(state, extras.centerId);
  if (extras.centerId) {
    next.centerId = extras.centerId;
  }
  const value = normalize(text);
  const now = extras.now instanceof Date ? extras.now : new Date();

  if (isAlreadyBookedElsewhere(text)) {
    next.pendingQuestion = "no_slots";
    next.lastOfferedSlots = [];
    next.appointmentStatus = "confirmed";
    return next;
  }

  if (isServiceAsk(text)) {
    return next;
  }

  if (
    isWillComeBack(text) ||
    isWaitUntilLater(text) ||
    isHesitation(text) ||
    isAskToWriteBack(text) ||
    isOutOfZone(text) ||
    refusesSlots(text)
  ) {
    next.pendingQuestion = "no_slots";
    next.lastOfferedSlots = [];
    return next;
  }

  if (isThreadComplaint(text) || isOpeningHoursAsk(text) || isMessageTimeMention(text)) {
    return next;
  }

  if (/ventre|poids|minceur|mincir|maigrir|cryo|graisse|cellulite/.test(value)) {
    next.serviceIntent = "minceur_ventre";
  }

  const dateRequest = parseDateRequest(text, now);
  const explicitDate = dateRequest.date;
  if (explicitDate) {
    next.lastOfferedSlots.forEach((slot) => {
      if (slot?.date && slot.date !== explicitDate) {
        next.rejectedDates = unique([...next.rejectedDates, slot.date]);
        next.rejectedSlots = uniqueSlots([
          ...(next.rejectedSlots || []),
          slot,
        ]);
      }
    });
    next.lastOfferedSlots = (next.lastOfferedSlots || []).filter(
      (slot) => slot?.date === explicitDate,
    );
    if (dateRequest.from) {
      next.searchFrom = explicitDate;
      next.requestedDate = null;
      next.requestedWeekday = null;
      next.dateFlexible = true;
    } else {
      next.requestedDate = explicitDate;
      next.searchFrom = explicitDate;
      next.requestedWeekday = weekdayOf(explicitDate);
      next.dateFlexible = false;
    }
    next.weekHalf = null;
    next.pendingQuestion = null;
    const dayNum = Number(String(explicitDate).slice(-2));
    if (
      next.preferredTime &&
      Number(String(next.preferredTime).slice(0, 2)) === dayNum &&
      !/\d{1,2}\s*h/.test(value)
    ) {
      next.preferredTime = null;
      next.preferredTimes = [];
    }
  }

  const namedDays = WEEKDAYS.map((day, index) =>
    value.includes(day) ? index : -1,
  ).filter((index) => index >= 0);
  const refusedDays = rejectedWeekdaysFromText(value);
  const wantedDays = namedDays.filter((day) => !refusedDays.includes(day));

  if (refusedDays.length) {
    next.rejectedWeekdays = unique([...next.rejectedWeekdays, ...refusedDays]);
    next.lastOfferedSlots
      .filter((slot) => refusedDays.includes(weekdayOf(slot.date)))
      .forEach((slot) => {
        next.rejectedDates = unique([...next.rejectedDates, slot.date]);
      });
    next.lastOfferedSlots = next.lastOfferedSlots.filter(
      (slot) => !refusedDays.includes(weekdayOf(slot.date)),
    );
    if (!explicitDate) {
      if (next.requestedDate && refusedDays.includes(weekdayOf(next.requestedDate))) {
        next.requestedDate = null;
        next.requestedWeekday = null;
      }
      if (next.requestedWeekday != null && refusedDays.includes(next.requestedWeekday)) {
        next.requestedWeekday = null;
        if (next.requestedDate && refusedDays.includes(weekdayOf(next.requestedDate))) {
          next.requestedDate = null;
        }
      }
    }
  }

  if (wantedDays.length === 1) {
    next.weekdayFromName = true;
    if (/uniquement|seulement/.test(value)) {
      next.strictWeekday = true;
    }
    if (!explicitDate) {
      next.requestedWeekday = wantedDays[0];
      next.requestedDate = nextDateForWeekday(wantedDays[0], now);
      next.weekHalf = null;
      next.pendingQuestion = null;
    }
  } else if (explicitDate) {
    next.weekdayFromName = wantedDays.length > 0;
    if (!wantedDays.length) {
      next.strictWeekday = false;
    }
  }

  if (
    /^(non|pas)\b/.test(value) &&
    next.lastOfferedSlots.length &&
    (explicitDate || wantedDays.length || dayPartFromText(text))
  ) {
    next.rejectedSlots = uniqueSlots([
      ...(next.rejectedSlots || []),
      ...next.lastOfferedSlots.filter(
        (slot) => !explicitDate || slot.date !== explicitDate,
      ),
    ]);
  }

  if (/\baujourd[' ]?hui\b/.test(value)) {
    next.requestedDate = todayIso(now);
    next.requestedWeekday = weekdayOf(next.requestedDate);
    next.weekHalf = null;
    next.pendingQuestion = null;
  } else if (/\bdemain\b/.test(value) && !explicitDate) {
    next.requestedDate = addDays(todayIso(now), 1);
    next.requestedWeekday = weekdayOf(next.requestedDate);
    next.weekHalf = null;
    next.pendingQuestion = null;
  }

  const clocks = parseClockMinutes(text);
  if (wantsNoon(text)) {
    next.preferredTime = "12:00";
    next.preferredTimes = ["12:00"];
    next.dayPart = null;
  } else if (clocks.length && !isMessageTimeMention(text) && !isRescheduleAsk(text)) {
    next.preferredTimes = unique(clocks.map(minutesToClock));
    next.preferredTime = next.preferredTimes[0];
    const hasLunch = clocks.some((minutes) => minutes >= 12 * 60 && minutes <= 14 * 60);
    const hasEvening = clocks.some((minutes) => minutes >= 17 * 60);
    if (hasLunch && hasEvening) {
      next.dayPart = null;
    }
  }

  const bookedDate = extras.conversation?.bookedSlot?.date;
  if ((isRescheduleAsk(text) || wantsNoon(text)) && bookedDate) {
    next.requestedDate = bookedDate;
    next.requestedWeekday = weekdayOf(bookedDate);
    next.weekHalf = null;
  }

  const dayPart = dayPartFromText(text);
  if (dayPart && !wantsNoon(text) && !(next.preferredTimes || []).some(isLunchClock)) {
    next.dayPart = dayPart;
    next.lastOfferedSlots = [];
    next.pendingQuestion = null;
  }

  const weekHalf = weekHalfFromText(text);
  if (weekHalf && !explicitDate) {
    next.weekHalf = weekHalf;
    next.requestedDate = null;
    next.requestedWeekday = null;
    next.lastOfferedSlots = [];
    next.pendingQuestion = null;
  }

  if (isShortYes(text) && lastSeyaAskedToSearch(extras.conversation)) {
    const previous = [
      ...(next.lastOfferedSlots || []),
      ...((extras.conversation && extras.conversation.proposedSlots) || []),
    ];
    previous.forEach((slot) => {
      if (slot?.date) {
        next.rejectedDates = unique([...next.rejectedDates, slot.date]);
      }
    });
    next.lastOfferedSlots = [];
    next.weekHalf = null;
    next.dayPart = null;
    next.requestedDate = null;
    next.requestedWeekday = null;
    next.pendingQuestion = null;
  }

  if (
    isShortYes(text) &&
    next.pendingQuestion === "offer_slots" &&
    next.requestedDate &&
    !explicitDate &&
    namedDays.length === 0
  ) {
    next.rejectedDates = unique([...next.rejectedDates, next.requestedDate]);
    next.requestedDate = null;
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

  const numbered = value.match(/pas(?:\s+\w+){0,5}\s+lundi\s*(\d{1,2})/);
  if (numbered) {
    upcomingDatesForWeekday(1, now, 45)
      .filter((date) => Number(date.slice(-2)) === Number(numbered[1]))
      .forEach((date) => {
        next.rejectedDates = unique([...next.rejectedDates, date]);
      });
  }

  if (asksNextWeek(text)) {
    next.lastOfferedSlots.forEach((slot) => {
      if (slot?.date) {
        next.rejectedDates = unique([...next.rejectedDates, slot.date]);
      }
    });
    const lastDiscussed = [
      ...(next.lastOfferedSlots || []).map((slot) => slot?.date),
      next.requestedDate,
      ...((extras.conversation && extras.conversation.proposedSlots) || []).map(
        (slot) => slot?.date,
      ),
    ]
      .filter(Boolean)
      .sort()
      .at(-1);
    next.searchFrom = lastDiscussed
      ? startOfFollowingWeek(lastDiscussed)
      : nextWeekStart(now);
    next.requestedDate = null;
    next.requestedWeekday = null;
    next.weekHalf = null;
    next.lastOfferedSlots = [];
    next.pendingQuestion = null;
  }

  if (asksOtherDay(text)) {
    next.lastOfferedSlots.forEach((slot) => {
      next.rejectedDates = unique([...next.rejectedDates, slot.date]);
    });
    next.requestedDate = null;
    next.requestedWeekday = null;
    next.weekHalf = null;
    next.lastOfferedSlots = [];
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
  } else if (
    refusesSlots(text) ||
    isHesitation(text) ||
    isAskToWriteBack(text) ||
    isOutOfZone(text) ||
    isWillComeBack(text)
  ) {
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
  const forceSearch = lastSeyaAskedToSearch(conversation) && isShortYes(text);
  if (isRescheduleAsk(text) || wantsNoon(text)) {
    return true;
  }
  if (isAlreadyBookedElsewhere(text) || isAppointmentConfirmed(conversation)) {
    return false;
  }
  if (
    asksPrice(text) ||
    asksLocation(text) ||
    faqKind(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    state.unansweredPriceIntent ||
    refusesSlots(text) ||
    isHesitation(text) ||
    isAskToWriteBack(text) ||
    isOutOfZone(text) ||
    isWillComeBack(text) ||
    isThreadComplaint(text) ||
    isOpeningHoursAsk(text)
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
  if ((state.lastOfferedSlots || []).length && !asksForOtherSlots(text) && !forceSearch) {
    return false;
  }
  return (
    wantsSlots(text, conversation) ||
    forceSearch ||
    (state.pendingQuestion === "offer_slots" && isShortYes(text))
  );
}

function asksForOtherSlots(text) {
  const value = normalize(text);
  return (
    asksOtherDay(text) ||
    asksNextWeek(text) ||
    Boolean(dayPartFromText(text)) ||
    Boolean(parseClockMinutes(text).length) ||
    /propose quoi|suivant|prochain|debut de semaine|fin de semaine|aujourd[' ]?hui/.test(
      value,
    ) ||
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|demain)\b/.test(value) ||
    hasDayOfMonthRequest(text)
  );
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

function slotMinutes(slot) {
  const [hours, minutes] = String(slot?.time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function matchesDayPart(slot, state) {
  const minutes = slotMinutes(slot);
  if (state.dayPart === "evening") {
    return minutes >= 16 * 60;
  }
  if (state.dayPart === "afternoon") {
    return minutes >= 14 * 60;
  }
  if (state.dayPart === "morning") {
    return minutes < 12 * 60;
  }
  return true;
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

  const dateLocked = Boolean(state.requestedDate) && extras.allowDateFallback !== true;
  const weekdayLocked =
    (state.strictWeekday || state.weekdayFromName) && state.requestedWeekday != null;

  const leaked = list.filter((slot) => {
    if (dateLocked && slot.date !== state.requestedDate) return true;
    if (
      !dateLocked &&
      weekdayLocked &&
      weekdayOf(slot.date) !== state.requestedWeekday
    ) {
      return true;
    }
    if (!matchesWeekHalf(slot, state)) return true;
    if (!matchesDayPart(slot, state)) return true;
    if (rejected.has(slot.date)) return true;
    if (rejectedDays.has(weekdayOf(slot.date))) return true;
    if (state.searchFrom && slot.date < state.searchFrom) return true;
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
    if (dateLocked && slot.date !== state.requestedDate) {
      return false;
    }
    if (
      !dateLocked &&
      weekdayLocked &&
      weekdayOf(slot.date) !== state.requestedWeekday
    ) {
      return false;
    }
    if (!matchesWeekHalf(slot, state)) {
      return false;
    }
    if (!matchesDayPart(slot, state)) {
      return false;
    }
    if (rejected.has(slot.date) || rejectedDays.has(weekdayOf(slot.date))) {
      return false;
    }
    if (state.searchFrom && slot.date < state.searchFrom) {
      return false;
    }
    if (
      (state.rejectedSlots || []).some(
        (item) => item.date === slot.date && item.time === slot.time,
      )
    ) {
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

  return { slots: kept.slice(0, 2), blocked: false, fallback: null };
}

function emptySlotFallback(state) {
  if (state.requestedDate) {
    const label = formatHumanDate(state.requestedDate);
    return `Je n’ai pas de disponibilité ${label} qui corresponde à votre demande, y compris plus loin. Pouvez-vous être un peu flexible sur le jour ou l’horaire ?`;
  }
  if (state.requestedWeekday != null) {
    return `Je n’ai pas de disponibilité ${WEEKDAYS[state.requestedWeekday]} qui corresponde à votre demande dans les deux prochains mois. Pouvez-vous être un peu flexible sur le jour ou l’horaire ?`;
  }
  if ((state.preferredTimes || []).length) {
    const hours = state.preferredTimes
      .map((time) => String(time).replace(":", "h"))
      .join(" ou ");
    return `Je n’ai pas de ${hours} dans les deux prochains mois. Pouvez-vous être un peu flexible sur le jour ou l’horaire ?`;
  }
  if (state.dayPart === "evening") {
    return "Je n’ai pas de créneau en fin de journée sur ces jours-là. Souhaitez-vous un autre horaire, ou une autre journée ?";
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
  const probeTime =
    state.dayPart === "evening"
      ? "17:00"
      : state.dayPart === "afternoon"
        ? "15:00"
        : "09:00";
  for (const match of dates) {
    const iso = `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    if (!slotAllowed({ date: iso, time: probeTime }, state)) {
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

function relaxRequestedDate(state, slots) {
  if (!state?.requestedDate || !Array.isArray(slots) || !slots.length) {
    return state;
  }
  if (slots.every((slot) => !slot?.date || slot.date === state.requestedDate)) {
    return state;
  }
  return {
    ...state,
    requestedDate: null,
    searchFrom: state.searchFrom || state.requestedDate,
  };
}

function enforceOutgoingText(text, state, slots) {
  const checkState = relaxRequestedDate(state, slots);
  if (!replyHasForbiddenSlots(text, checkState)) {
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

function parseDateRequest(text, now) {
  const value = normalize(text);
  const from = /(?:a partir du|des le)\s+\d{1,2}/.test(value);
  const explicit = parseExplicitDate(text, now);
  if (explicit) {
    return { date: explicit, from };
  }
  const dayOnly = value.match(
    /(?:a partir du|des le|(?:^|[\s,;:.!?])(?:le|du))\s+(\d{1,2})(?:er|e)?(?!\s*(?:h|:|\/))/,
  );
  if (dayOnly) {
    const date = nextDateForMonthDay(Number(dayOnly[1]), now);
    return { date: date || null, from };
  }
  return { date: null, from: false };
}

function nextDateForMonthDay(day, now) {
  const dayNum = Number(day);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
    return null;
  }
  const start = now instanceof Date ? now : new Date();
  const today = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let add = 0; add < 4; add += 1) {
    const candidate = new Date(today.getFullYear(), today.getMonth() + add, dayNum);
    if (candidate.getDate() !== dayNum) {
      continue;
    }
    if (candidate >= today) {
      return toIso(candidate);
    }
  }
  return null;
}

function uniqueSlots(list) {
  const seen = new Set();
  return (list || []).filter((slot) => {
    if (!slot?.date || !slot?.time) {
      return false;
    }
    const key = `${slot.date}|${String(slot.time).slice(0, 5)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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
  const weekdayNumber = value.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi)\s+(\d{1,2})(?!\s*h)/,
  );
  if (weekdayNumber) {
    const weekday = WEEKDAYS.indexOf(weekdayNumber[1]);
    const dayNum = Number(weekdayNumber[2]);
    if (weekday > 0 && dayNum >= 1 && dayNum <= 31) {
      return (
        upcomingDatesForWeekday(weekday, now, 70).find(
          (date) => Number(date.slice(-2)) === dayNum,
        ) || null
      );
    }
  }
  return null;
}

function rejectedWeekdaysFromText(value) {
  const found = [];
  const pattern =
    /\bpas(?:\s+(?:dispo(?:nible)?|disponible))?\s+(?:ce |le )?(lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/g;
  let match = pattern.exec(value);
  while (match) {
    const index = WEEKDAYS.indexOf(match[1]);
    if (index > 0) {
      found.push(index);
    }
    match = pattern.exec(value);
  }
  return unique(found);
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

function minutesToClock(total) {
  const hours = Math.floor(Number(total) / 60);
  const minutes = Number(total) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isLunchClock(value) {
  if (typeof value === "number") {
    return value >= 12 * 60 && value <= 14 * 60;
  }
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  const total = (hours || 0) * 60 + (minutes || 0);
  return total >= 12 * 60 && total <= 14 * 60;
}

function nextWeekStart(now) {
  const weekday = (now instanceof Date ? now : new Date()).getDay();
  const add = weekday === 0 ? 1 : 8 - weekday;
  return addDays(todayIso(now), add);
}

function startOfFollowingWeek(iso) {
  const weekday = weekdayOf(iso);
  const add = weekday === 0 ? 1 : 8 - weekday;
  return addDays(iso, add);
}

function dbStatusWhenSlotPositioned(date, start) {
  const [year, month, day] = String(date || "").split("-").map(Number);
  const [hours, minutes] = String(start || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);

  if (!year || !month || !day) {
    return "to_confirm";
  }

  const when = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  if (Number.isNaN(when.getTime())) {
    return "to_confirm";
  }

  return when.getTime() - Date.now() > 48 * 60 * 60 * 1000
    ? "confirmed"
    : "to_confirm";
}

module.exports = {
  WEEKDAYS,
  applyBookingMessage,
  asksLocation,
  asksPrice,
  dbStatusWhenSlotPositioned,
  emptyBookingState,
  emptySlotFallback,
  enforceOutgoingText,
  faqKind,
  guardSlots,
  markPriceAnswered,
  normalizeBookingState,
  parseDateRequest,
  replyHasForbiddenSlots,
  shouldSearchSlots,
  slotAllowed,
};
