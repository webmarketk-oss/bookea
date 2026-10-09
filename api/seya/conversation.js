const { classifyPriceQuestion, isNearDuplicate, isPriceRepeatComplaint } = require("./price");
const { inferCareFamily } = require("./care-family");
const { isWelcomeRelanceOnly, resolveSeyaMission } = require("./mission");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

function isRereadAsk(text) {
  const value = normalize(text);
  return /relis|re[- ]lis|regarde ce que je (te |vous )?demande|tu (n[' ]as |n[' ]a )?(rien |pas )?compris|essaie de comprendre|comprendre mes questions|(info|message).{0,28}(clair|claire)|a ete clair|vous n[' ]avez pas lu/.test(
    value,
  );
}

function isRobotComplaint(text) {
  const value = normalize(text);
  return /robot (qui )?(beug|bug|bugg)|c[' ]est (votre |un )?robot qui|votre robot/.test(
    value,
  );
}

function isOpeningHoursAsk(text) {
  const value = normalize(text);
  return /travaill[ez].{0,24}(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)|ouvert[e]? (aussi )?(le )?(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)|vous venez travailler/.test(
    value,
  );
}

function isThreadComplaint(text) {
  return isRobotComplaint(text) || isRereadAsk(text) || isOpeningHoursAsk(text);
}

function isOffTopicComplaint(text) {
  const value = normalize(text);
  return (
    isRereadAsk(text) ||
    isRobotComplaint(text) ||
    /c[' ]est quoi le rapport|hors sujet|rien a voir|tu parle[s]? de quoi|vous parlez de quoi/.test(
      value,
    )
  );
}

function isCenterAffirmation(text) {
  const value = normalize(text);
  return (
    /je suis bien (a|au|chez)/.test(value) ||
    /c[' ]est (bien )?(depil|vichy|le bon (centre|institut|numero))/.test(value) ||
    /je (suis|reste) (bien )?(au|dans le) bon centre/.test(value)
  );
}

function isMessageTimeMention(text) {
  const value = normalize(text);
  return /info (message )?(de )?\d|message (de |a )?\d{1,2}\s*h/.test(value);
}

const WEEKDAY_LABELS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];
const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function comeBackPhrase(value) {
  return /je (vous |te )?(reviendrai|reviendrais|reviens) vers|reviendrai[s]? vers (vous|nous|toi)|a un autre moment|aucun (ce jour|de ces jours|jour)|plus rien (sur |cette |pour )?(la )?semaine|rien (sur |cette |pour )(la )?semaine (qui arrive|prochaine)|je (vous |te )?(tiens|tiendrai) (au courant|informe)|on se (tient|tiendra) au courant/.test(
    value,
  );
}

function isCentrePause(text) {
  const value = normalize(text);
  if (parseClockMinutes(text).length) {
    return false;
  }
  return /prenez le temps|a bientot|quand vous (voulez|souhaitez)|je vous laisse|on reste dispo/.test(
    value,
  );
}

function nextIsoForWeekday(weekday, now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const paris = new Date(`${year}-${month}-${day}T12:00:00`);
  for (let offset = 0; offset < 21; offset += 1) {
    const probe = new Date(paris);
    probe.setDate(paris.getDate() + offset);
    if (probe.getDay() === weekday) {
      const y = probe.getFullYear();
      const m = String(probe.getMonth() + 1).padStart(2, "0");
      const d = String(probe.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return "";
}

function dateFromOfferedText(text, now) {
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
    const base = now instanceof Date ? now : new Date();
    let date = new Date(base.getFullYear(), months[named[2]], Number(named[1]));
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    if (date < today) {
      date = new Date(base.getFullYear() + 1, months[named[2]], Number(named[1]));
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const slash = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : (now instanceof Date ? now : new Date()).getFullYear();
    return `${year}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
  }
  const weekdayNumber = value.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi)\s+(\d{1,2})(?!\s*h)/,
  );
  if (weekdayNumber) {
    const weekday = WEEKDAY_LABELS.indexOf(weekdayNumber[1]);
    const dayNum = Number(weekdayNumber[2]);
    if (weekday > 0 && dayNum >= 1 && dayNum <= 31) {
      for (let offset = 0; offset < 70; offset += 1) {
        const iso = nextIsoForWeekday(weekday, now);
        const probe = now instanceof Date ? new Date(now.getTime()) : new Date();
        probe.setDate(probe.getDate() + offset);
        if (probe.getDay() === weekday && probe.getDate() === dayNum) {
          const y = probe.getFullYear();
          const m = String(probe.getMonth() + 1).padStart(2, "0");
          const d = String(probe.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
      }
    }
  }
  const weekday = WEEKDAY_LABELS.findIndex((day) =>
    new RegExp(`\\b${day}\\b`).test(value),
  );
  if (weekday >= 0) {
    return nextIsoForWeekday(weekday, now);
  }
  return "";
}

function minutesToClock(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function staffSlotLabel(date, time) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const [, month, day] = String(date || "").split("-");
  return `${WEEKDAY_SHORT[weekday] || ""} ${day}/${month} à ${String(time).replace(":", "h")}`.trim();
}

function slotsFromOfferedText(text, now) {
  const clocks = parseClockMinutes(text);
  if (!clocks.length) {
    return [];
  }
  const date = dateFromOfferedText(text, now);
  if (!date) {
    return [];
  }
  return clocks.map((minutes) => {
    const time = minutesToClock(minutes);
    return { date, time, label: staffSlotLabel(date, time) };
  });
}

function slotsFromStaffThread(conversation, now) {
  let slots = [];
  for (const item of conversation?.messages || []) {
    if (item.author !== "centre") {
      continue;
    }
    const at = item.at ? new Date(item.at) : now;
    const clock = Number.isFinite(at?.getTime()) ? at : now;
    const parsed = slotsFromOfferedText(item.text, clock);
    if (parsed.length) {
      slots = parsed;
    }
  }
  return slots;
}

function withStaffOfferedSlots(conversation, now) {
  const staffSlots = slotsFromStaffThread(conversation, now);
  if (!staffSlots.length) {
    return conversation;
  }
  return {
    ...conversation,
    proposedSlots: staffSlots,
    bookingState: {
      ...(conversation.bookingState || {}),
      lastOfferedSlots: staffSlots,
      appointmentStatus:
        conversation.bookingState?.appointmentStatus === "confirmed"
          ? "confirmed"
          : "proposed",
      pendingQuestion:
        conversation.bookingState?.pendingQuestion === "no_slots"
          ? conversation.bookingState.pendingQuestion
          : null,
    },
  };
}

function applyCentreMessage(conversation, text, now) {
  const slots = slotsFromOfferedText(text, now);
  if (slots.length) {
    return {
      ...conversation,
      proposedSlots: slots,
      bookingState: {
        ...(conversation.bookingState || {}),
        lastOfferedSlots: slots,
        appointmentStatus: "proposed",
        pendingQuestion: null,
      },
    };
  }
  if (isCentrePause(text)) {
    const booked = /rdv pris|rdv confirm/i.test(String(conversation?.status || ""));
    return {
      ...conversation,
      status: booked ? conversation.status : "Terminé",
      proposedSlots: [],
      bookingState: {
        ...(conversation.bookingState || {}),
        lastOfferedSlots: [],
        pendingQuestion: "no_slots",
      },
    };
  }
  return conversation;
}

function threadIsPaused(conversation, extraText) {
  const messages = [...(conversation?.messages || [])];
  if (extraText) {
    messages.push({ author: "lead", text: extraText });
  }
  const leads = messages.filter((item) => item.author === "lead");
  for (let index = leads.length - 1; index >= 0; index -= 1) {
    const text = leads[index].text || "";
    if (isThreadComplaint(text) || isOpeningHoursAsk(text)) {
      continue;
    }
    if (
      isWillComeBack(text) ||
      isWillCallBack(text) ||
      isOutOfZone(text) ||
      isLeadRefusal(text)
    ) {
      return true;
    }
    if (wantsSlots(text, conversation)) {
      return false;
    }
  }
  const lastHuman = [...messages]
    .reverse()
    .find((item) => item.author === "lead" || item.author === "centre");
  return lastHuman?.author === "centre" && isCentrePause(lastHuman.text || "");
}

function isIdentityQuestion(text) {
  const value = normalize(text);
  return /tu es (une )?ia|t[' ]es une ia|vous etes (une )?ia|c[' ]est une ia|je parle (a|à) un robot|assistante virtuelle|chatbot|intelligence artificielle/.test(
    value,
  );
}

function isWrongCenter(text) {
  const value = normalize(text);
  if (!value) {
    return false;
  }
  return (
    /je pensais (que )?(c[' ]?etait|c etait)/.test(value) ||
    /je me suis tromp[eé]e?( de )?(centre|institut|ville|adresse|numero)/.test(
      value,
    ) ||
    /pas le bon (centre|institut|etablissement|numero)/.test(value) ||
    /mauvais (centre|institut|numero)/.test(value) ||
    /c[' ]est (pas|pas du tout) (le |votre )?(centre|institut)/.test(value) ||
    /je (cherchais|voulais) (l[' ]?institut|le centre) de/.test(value)
  );
}

function wrongCenterReply(now) {
  return `D’accord, aucun souci. Je vous souhaite ${greetingForTime(now)}.`;
}

function compactText(text) {
  return normalize(text)
    .replace(/[.!,;:?…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsNoon(text) {
  const value = normalize(text);
  if (/apres[- ]?midi/.test(value)) {
    return false;
  }
  return /\bmidi\b/.test(value);
}

function isRescheduleAsk(text) {
  const value = normalize(text);
  return /comment (faire )?(pour )?modifi|modifi(er|ez)|changer (l[' ]heure|le (creneau|rdv|rendez-vous|horaire))|l[' ]heure ne (me )?convient|ne convient pas|pas (dit )?oui pour (cet |cette )?(horaire|creneau)|pas cet horaire|mais a midi/.test(
    value,
  );
}

function threadWantsNoon(conversation, extraText) {
  if (wantsNoon(extraText)) {
    return true;
  }
  return (conversation?.messages || []).some(
    (item) => item.author === "lead" && wantsNoon(item.text),
  );
}

function parseClockMinutes(text) {
  const value = compactText(text);
  const times = [];
  if (wantsNoon(text)) {
    times.push(12 * 60);
  }
  const pattern = /\b(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\b/g;
  let match = pattern.exec(value);
  while (match) {
    const hour = Number(match[1]);
    const minutes = match[2] != null ? Number(match[2]) : 0;
    const token = match[0];
    const looksLikeClock = /h|:/.test(token);
    const dayAfterWeekday = new RegExp(
      `(lundi|mardi|mercredi|jeudi|vendredi|samedi|le)\\s+${hour}\\b`,
    ).test(value);
    if (!looksLikeClock && dayAfterWeekday) {
      match = pattern.exec(value);
      continue;
    }
    if (hour >= 7 && hour <= 20 && minutes >= 0 && minutes <= 59) {
      times.push(hour * 60 + minutes);
    }
    match = pattern.exec(value);
  }
  return times;
}

function isShortYes(text) {
  const value = compactText(text);
  if (!value || value.length > 72) {
    return false;
  }
  return /^(bonjour |hello |salut |coucou )?(oui|ouais|ouai|ok|okay|okey|d'accord|dac|volontiers|avec plaisir|je veux bien|ca me va|ca marche|pourquoi pas|vas y|vas-y|allez y|allez|go|nickel|parfait|super|yes|yep)( (oui|ok|merci|s'il (te|vous) plait|svp|je veux bien|volontiers|avec plaisir|toujours))*$/.test(
    value,
  );
}

function lastSeyaOfferedToBook(conversation) {
  const last = lastSeyaText(conversation);
  if (!last) {
    return false;
  }
  const value = normalize(last);
  return /propose(r)? (un )?(creneau|horaire|rdv)|je (peux |vais )?(vous )?(regarder|proposer)|quel jour|lequel vous (irait|conviendrait)|cela vous conviendrait|quand (etes|seriez)|debut de semaine|fin de semaine|je peux vous proposer|autre journee|autre jour|lundi suivant|(l['’])?horaire.*(convient|irait)|convient toujours|pas de disponibilite|je (vous )propose/.test(
    value,
  );
}

function lastSeyaAskedToSearch(conversation) {
  const value = normalize(lastSeyaText(conversation));
  if (!value) {
    return false;
  }
  if (/convient toujours|horaire vu ensemble/.test(value)) {
    return false;
  }
  return /regarde(r)? (les )?(d[' ]autres )?(disponibilites|un creneau|un horaire)|disponibilites pour vous|regarde autre chose|je dois regarder un creneau/.test(
    value,
  );
}

function offeredSlots(conversation, extraSlots) {
  const fromConversation = Array.isArray(conversation?.proposedSlots)
    ? conversation.proposedSlots
    : [];
  const fromState = Array.isArray(conversation?.bookingState?.lastOfferedSlots)
    ? conversation.bookingState.lastOfferedSlots
    : [];
  const fromExtra = Array.isArray(extraSlots) ? extraSlots : [];
  return fromConversation.length
    ? fromConversation
    : fromState.length
      ? fromState
      : fromExtra;
}

function isBookingThread(conversation) {
  if (isAppointmentConfirmed(conversation)) {
    return false;
  }
  const state = conversation?.bookingState || {};
  return Boolean(
    (state.lastOfferedSlots || []).length ||
      (conversation?.proposedSlots || []).length ||
      state.requestedDate ||
      state.requestedWeekday != null ||
      state.pendingQuestion === "offer_slots" ||
      conversation?.status === "RDV proposé" ||
      conversation?.status === "RDV pris",
  );
}

function checkingSlotReply() {
  return "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊";
}

function threadHasConfirmedVisit(conversation) {
  return (conversation?.messages || []).some((item) => {
    if (item?.author !== "seya") {
      return false;
    }
    const value = compactText(item.text);
    return /rendez-vous est confirme|rdv (est )?confirme|est bien bloque/.test(value);
  });
}

function isAppointmentConfirmed(conversation) {
  return (
    conversation?.status === "RDV confirmé" ||
    conversation?.status === "RDV pris" ||
    conversation?.bookingState?.appointmentStatus === "confirmed" ||
    Boolean(conversation?.bookedSlot) ||
    threadHasConfirmedVisit(conversation)
  );
}

function isAlreadyBookedElsewhere(text) {
  const value = normalize(text);
  if (!value) {
    return false;
  }
  if (
    /je (veux|voudrais|souhaite|aimerais|peux) (prendre|reserver)/.test(value)
  ) {
    return false;
  }
  if (
    /(prendre|reserver) (un )?(rdv|rendez-vous|creneau)/.test(value) &&
    !/j[' ]?ai |je viens de |deja |a l[' ]instant/.test(value)
  ) {
    return false;
  }
  const mentionsVisit = /(rdv|rendez-vous|creneau|reserve|reservation|booke)/.test(
    value,
  );
  if (!mentionsVisit) {
    return false;
  }
  const done =
    /j[' ]?ai (deja )?(pris|reserve|booke)/.test(value) ||
    /je viens de (prendre|reserver|booker)/.test(value) ||
    /a l[' ]instant/.test(value) ||
    /deja (pris|reserve|booke)/.test(value) ||
    /rdv (deja )?pris/.test(value) ||
    /rendez-vous (deja )?(pris|reserve)/.test(value);
  const elsewhere =
    /planity|treatwell|en ligne|sur (le )?site|sur (votre )?agenda/.test(value);
  return done || (elsewhere && /pris|reserve|booke/.test(value));
}

function alreadyBookedReply(text) {
  const value = normalize(text);
  const via = /planity/.test(value)
    ? " sur Planity"
    : /treatwell/.test(value)
      ? " sur Treatwell"
      : "";
  return `Parfait, c’est noté, votre rendez-vous est déjà pris${via}. Je n’ai plus de créneau à vous proposer. À très vite au centre.`;
}

function isConfirmingOfferedTime(text, conversation) {
  if (!conversation) {
    return false;
  }
  if (isAppointmentConfirmed(conversation) && !offeredSlots(conversation).length) {
    return false;
  }
  if (
    isHesitation(text) ||
    refusesSlots(text) ||
    classifyPriceQuestion(text) ||
    isAlreadyBookedElsewhere(text)
  ) {
    return false;
  }
  if (lastSeyaAskedToSearch(conversation)) {
    return false;
  }
  const hasOffered = offeredSlots(conversation).length > 0;
  const lastAsked =
    lastSeyaOfferedToBook(conversation) ||
    /convient toujours|horaire vu ensemble|cela vous conviendrait/i.test(
      lastSeyaText(conversation),
    );
  const clock = parseClockMinutes(text).length > 0;
  if (!hasOffered) {
    return false;
  }
  if (clock) {
    return true;
  }
  if (!lastAsked) {
    return false;
  }
  return (
    isShortYes(text) ||
    /toujours|ca me convient|ça me convient|c[' ]est bon/i.test(compactText(text))
  );
}

function acceptsBookingOffer(text, conversation) {
  if (!conversation || !isShortYes(text) || isAppointmentConfirmed(conversation)) {
    return false;
  }
  if (
    isHesitation(text) ||
    refusesSlots(text) ||
    isIdentityQuestion(text) ||
    classifyPriceQuestion(text)
  ) {
    return false;
  }
  if (
    conversation.bookingState?.pendingQuestion === "no_slots" &&
    !lastSeyaOfferedToBook(conversation)
  ) {
    return false;
  }
  return (
    lastSeyaOfferedToBook(conversation) ||
    conversation.bookingState?.pendingQuestion === "offer_slots" ||
    offeredSlots(conversation).length > 0 ||
    conversation.status === "RDV proposé"
  );
}

function isThanks(text, conversation) {
  if (acceptsBookingOffer(text, conversation)) {
    return false;
  }
  const value = compactText(text);
  if (
    /^(merci beaucoup d'avance|merci d'avance|merci beaucoup|super merci|ok merci|c'est gentil|je vous remercie|merci)$/.test(
      value,
    )
  ) {
    return true;
  }
  return /merci( beaucoup)? (et )?a bientot|a bientot merci|^a bientot$|^merci a bientot$|merci.*a bientot/.test(
    value,
  );
}

function asksForHelpNow(text) {
  const value = normalize(text);
  if (comeBackPhrase(value)) {
    return false;
  }
  if (classifyPriceQuestion(text) || isPriceRepeatComplaint(text)) {
    return true;
  }
  if (
    /prix|tarif|combien/.test(value) &&
    !/combien de (temps|seance|seances|rdv|fois|jours)/.test(value)
  ) {
    return true;
  }
  if (weekHalfFromText(text) || dayPartFromText(text) || asksOtherDay(text)) {
    return true;
  }
  return /proposition|creneau|horaire|\brdv\b|rendez-vous|dispo|apres[- ]?midi/.test(
    value,
  );
}

function isWillCallBack(text) {
  const value = normalize(text);
  if (asksForHelpNow(text) || isAskToWriteBack(text)) {
    return false;
  }
  if (/pas (te |vous )?(re)?contacter|ne (me |te |vous )?(re)?contacte/.test(value)) {
    return true;
  }
  return /je (prefere|vais|aimerais) (vous |te )?(re)?contacter|recontacter moi[- ]meme|c[' ]est moi qui (vous |te )?(re)?contacte|je (vous|te) (re)?contacterai|je (vous|te) rappellerai|je prefere (rappeler|vous rappeler)/.test(
    value,
  );
}

function isWillComeBack(text) {
  const value = normalize(text);
  if (isAskToWriteBack(text)) {
    return false;
  }
  if (comeBackPhrase(value)) {
    if (
      /plus rien|aucun (ce jour|de ces jours|jour)|a un autre moment|tiens au courant/.test(
        value,
      )
    ) {
      return true;
    }
    if (parseClockMinutes(text).length && !isMessageTimeMention(text)) {
      return false;
    }
    return true;
  }
  if (asksForHelpNow(text)) {
    return false;
  }
  if (
    /jeudi|lundi|mardi|mercredi|vendredi|samedi|creneau|horaire|\brdv\b/.test(
      value,
    ) &&
    !/plus rien|tiens au courant|aucun (ce jour|de ces jours)/.test(value)
  ) {
    return false;
  }
  return /je (vous |te )?recontacte (plus tard|moi[- ]meme)|je (vous |te )?(dirai|previendrai)/.test(
    value,
  );
}

function mentionedDepartment(text) {
  const value = normalize(text);
  const match = value.match(
    /(?:j[' ]habite|je (?:suis|habite)|habite).{0,24}dans le (\d{2})\b|dans le (\d{2})(?=\s*(?:,|et|!|\.|$))|departement (\d{2})\b/,
  );
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function centerDepartment(extras = {}) {
  const hay = [
    extras.centerAddress,
    extras.centerPostal,
    extras.centerProfile?.address,
    extras.centerProfile?.postalCode,
  ]
    .filter(Boolean)
    .join(" ");
  return hay.match(/\b(\d{2})\d{3}\b/)?.[1] || "";
}

function isOutOfZone(text, extras = {}) {
  const value = normalize(text);
  if (
    /hors[- ]?zone|trop loin|beaucoup de route|trop de route|trop de trajet|loin pour (venir|se deplacer)|pas (dans )?(le |votre )?secteur|pas de votre cote|j[' ]habite (trop )?loin|je (n[' ]?habite|suis) pas (du tout )?(a cote|a proximite|dans le coin|sur (place|votre ville))/.test(
      value,
    )
  ) {
    return true;
  }
  const dept = mentionedDepartment(text);
  if (!dept) {
    return false;
  }
  const local = centerDepartment(extras);
  if (local && dept !== local) {
    return true;
  }
  return /route|trajet|loin|deplacement|erreur/.test(value);
}

function isWaitUntilLater(text) {
  const value = normalize(text);
  return /j[' ]attends la fin|fin (du |de )?mois|d[' ]ici (la )?fin (du |de )?mois|dans (un |1 |deux |2 )mois/.test(
    value,
  );
}

function parseLaterIso(text, now) {
  if (!isWaitUntilLater(text)) {
    return null;
  }
  const date = now instanceof Date ? now : new Date();
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, "0");
  const d = String(last.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function askedServiceName(text) {
  const value = normalize(text)
    .replace(/[?!.…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = value.match(
    /(?:faites|proposez|offrez|avez)(?:[- ]vous)?(?: aussi)?(?: le | la | l'| les | de | du | des | un | une )(.+)$/,
  );
  return String(match?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isServiceAsk(text) {
  const value = normalize(text);
  if (askedServiceName(text)) {
    return true;
  }
  return /est[- ]ce que vous (faites|proposez|avez|offrez)|vous (faites|proposez) (le |la |l'|les |un |une )/.test(
    value,
  );
}

function asksOpenQuestion(text) {
  const raw = String(text || "");
  const value = normalize(raw);
  if (isServiceAsk(text)) {
    return true;
  }
  return (
    /j[' ]ai une question|est[- ]ce que|c[' ]est quoi|comment (ca |cela )?marche/.test(
      value,
    ) || /\?/.test(raw)
  );
}

function isAskToWriteBack(text) {
  const value = normalize(text);
  if (asksForHelpNow(text) || isServiceAsk(text) || asksOpenQuestion(text)) {
    return false;
  }
  if (isWaitUntilLater(text)) {
    return false;
  }
  return /renvoy(ez|e)[- ]moi|rappelez[- ]moi|recontactez[- ]moi|recontactez moi|un message (lundi|mardi|mercredi|jeudi|vendredi|samedi)|ecrivez[- ]moi (lundi|mardi|mercredi|jeudi|vendredi|samedi)/.test(
    value,
  );
}

function parseNextWeekdayIso(text, now) {
  const value = normalize(text);
  const names = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
  ];
  const weekday = names.findIndex((day) => new RegExp(`\\b${day}\\b`).test(value));
  if (weekday < 0) {
    return null;
  }

  const date = now instanceof Date ? now : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const paris = new Date(`${year}-${month}-${day}T12:00:00`);
  const current = paris.getDay();
  let add = (weekday - current + 7) % 7;
  if (add === 0) {
    add = 7;
  }
  paris.setDate(paris.getDate() + add);
  const y = paris.getFullYear();
  const m = String(paris.getMonth() + 1).padStart(2, "0");
  const d = String(paris.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lockedCrmStatuses() {
  return [
    "RDV pris",
    "RDV confirmé",
    "Vendu",
    "Client",
    "Client converti",
    "Acompte reçu",
    "Acompte validé",
    "Acompte envoyé",
    "Devis",
  ];
}

function isLeadRefusal(text) {
  const raw = String(text || "").trim();
  const needle = normalize(raw).replace(/[!?.]+$/g, "");
  if (!needle) {
    return false;
  }
  if (/^(stop|stoppez|arrete|arretez|stop svp)$/.test(needle)) {
    return true;
  }
  if (/pas int[eé]ress/.test(needle)) {
    return true;
  }
  if (/ne donne(rai)? pas (la )?suite|pas (la )?peine/.test(needle)) {
    return true;
  }
  if (
    /ne (me )?(plus )?(e[cç]rire|contacter|d[eé]ranger|appeler|relancer)/.test(
      needle,
    )
  ) {
    return true;
  }
  if (isWrongCenter(raw)) {
    return true;
  }
  return /^(non merci|plus jamais)$/.test(needle);
}

function crmUpdateFromLeadMessage(text, now, extras = {}) {
  if (isLeadRefusal(text)) {
    return {
      status: "Pas intéressé",
      conversationStatus: "Pas intéressé",
      reminderDate: null,
    };
  }
  if (isOutOfZone(text, extras)) {
    return {
      status: "Hors zone",
      conversationStatus: "Terminé",
      reminderDate: null,
    };
  }
  if (isServiceAsk(text) || (asksOpenQuestion(text) && !isWaitUntilLater(text))) {
    return null;
  }
  if (isWaitUntilLater(text)) {
    return {
      status: "À relancer",
      conversationStatus: "À recontacter",
      reminderDate: parseLaterIso(text, now),
    };
  }
  if (isAskToWriteBack(text)) {
    return {
      status: "À relancer",
      conversationStatus: "À recontacter",
      reminderDate: parseNextWeekdayIso(text, now),
    };
  }
  if (isWillComeBack(text) || isWillCallBack(text)) {
    return {
      status: "Reviendra vers nous",
      conversationStatus: "Terminé",
      reminderDate: null,
    };
  }
  if (isWrongCenter(text)) {
    return {
      status: "Pas intéressé",
      conversationStatus: "Pas intéressé",
      reminderDate: null,
    };
  }
  return null;
}

function isAwayForNow(text) {
  const value = normalize(text);
  if (asksForHelpNow(text)) {
    return false;
  }
  return (
    isWillCallBack(text) ||
    /pas sur place|pour l[' ]instant pas|je (ne )?suis pas (la|sur place)/.test(value)
  );
}

function weekHalfFromText(text) {
  const value = normalize(text);
  if (/debut de semaine|en debut de semaine|plutot (le )?debut( de semaine)?/.test(value) && !/fin de semaine/.test(value)) {
    return "start";
  }
  if (/fin de semaine|en fin de semaine/.test(value)) {
    return "end";
  }
  if (/plutot (la )?fin/.test(value) && !/fin de journee/.test(value)) {
    return "end";
  }
  return "";
}

function dayPartFromText(text) {
  const value = normalize(text);
  if (
    /fin de journee|en fin de journee|le soir|\bsoiree\b|vers 1[6-9]\s*h|apres 16\s*h/.test(
      value,
    )
  ) {
    return "evening";
  }
  if (/\b(apm|aprem)['']?\b|apres[- ]?midi/.test(value)) {
    return "afternoon";
  }
  if (/\bmatin\b/.test(value) && !/apres/.test(value)) {
    return "morning";
  }
  return "";
}

function asksNextWeek(text) {
  const value = normalize(text);
  return /semaine (d[' ]?)?(apres|suivante|prochaine)|la semaine prochaine/.test(
    value,
  );
}

function asksOtherDay(text) {
  const value = normalize(text);
  if (comeBackPhrase(value)) {
    return false;
  }
  return (
    asksNextWeek(text) ||
    /change de jour|d[' ]?autres? ?j|un autre jour|autre journee|autres? (jours?|horaires)|pas ce jour|aucun ce jour|aucun je |d[' ]autres creneaux/.test(
      value,
    )
  );
}

function greetingForTime(now) {
  const date = now instanceof Date ? now : new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(date).find((part) => part.type === "hour")?.value || 0,
  );
  return hour >= 18 ? "une bonne soirée" : "une belle journée";
}

function willCallBackReply(now) {
  return `D’accord, aucun souci, je vous laisse revenir vers nous quand ça sera le moment pour vous. Je vous souhaite ${greetingForTime(now)} :)`;
}

function isHesitation(text) {
  const value = normalize(text);
  if (
    asksForHelpNow(text) ||
    isAskToWriteBack(text) ||
    isOutOfZone(text) ||
    /j[' ]?ai reflechi/.test(value)
  ) {
    return false;
  }
  return (
    isAwayForNow(text) ||
    /je (reflechis|vais reflechir)|pas maintenant|on verra|je sais pas encore|je ne sais pas encore|pas sure|pas certain|plus tard|je vais voir|laisse[- ]moi|je (reviendrai|reviens) vers|je (te|vous) (recontacte|reviendrai)|on se reparle|je te (dis|tiens)/.test(
      value,
    )
  );
}

function refusesSlots(text) {
  const value = normalize(text);
  return /arr[eê]te.*(creneau|horaire|rdv)|pas (de |les )creneaux|plus de creneaux|on verra pour le rdv|pas de rdv pour l[' ]instant/.test(
    value,
  );
}

function wantsSlots(text, conversation) {
  if (isAlreadyBookedElsewhere(text)) {
    return false;
  }
  if (isRescheduleAsk(text) || wantsNoon(text)) {
    return true;
  }
  if (isWillComeBack(text) || isWillCallBack(text) || isThreadComplaint(text)) {
    return false;
  }
  if (isServiceAsk(text) || isWaitUntilLater(text)) {
    return false;
  }
  if (isMessageTimeMention(text) && !comeBackPhrase(normalize(text))) {
    if (isOpeningHoursAsk(text) || isRobotComplaint(text) || isRereadAsk(text)) {
      return false;
    }
  }
  if (isAppointmentConfirmed(conversation) && (isShortYes(text) || isThanks(text, conversation))) {
    return false;
  }
  if (acceptsBookingOffer(text, conversation)) {
    return true;
  }
  if (isRereadAsk(text) && isBookingThread(conversation)) {
    return true;
  }
  if (parseClockMinutes(text).length && offeredSlots(conversation).length) {
    return true;
  }
  const value = normalize(text);
  if (
    isIdentityQuestion(text) ||
    isWrongCenter(text) ||
    isOutOfZone(text) ||
    isAskToWriteBack(text) ||
    isWillComeBack(text) ||
    isThanks(text, conversation) ||
    isHesitation(text) ||
    refusesSlots(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    (isOffTopicComplaint(text) && !isBookingThread(conversation))
  ) {
    return false;
  }
  if (/prix|tarif|combien|adresse|ou (etes|se trouve)|situe/.test(value) && !/dispo|creneau|horaire|\brdv\b/.test(value)) {
    return false;
  }
  if (/ouvert|ouvrez|horaires d[' ]ouverture/.test(value) && !/creneau|\brdv\b|dispo pour/.test(value)) {
    return false;
  }
  if (/^non\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/.test(value)) {
    return true;
  }
  const namesDay =
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd[' ]?hui)\b/.test(
      value,
    );
  const refusedDay = /pas (dispo|disponible) le |pas le |je ne suis pas disponible/.test(value);
  if (weekHalfFromText(text) || dayPartFromText(text)) {
    return true;
  }
  if (asksOtherDay(text)) {
    return true;
  }
  const asksAgenda =
    /dispo|creneau|horaire|rendez-vous|\brdv\b|de la place|voir les (heures|horaires)|quand (puis-je|je peux) (venir|passer)|un creneau|(tu|vous) (me )?(proposes? quoi|proposes? comme)|propose quoi|t[' ]as (quoi|comme)/.test(
      value,
    );
  return asksAgenda || (namesDay && !refusedDay);
}

function identityReply() {
  return "Je suis SEYA, l’assistante virtuelle du centre. Je peux vous renseigner et organiser votre rendez-vous, et l’équipe peut reprendre la conversation si vous préférez.";
}

function lastSeyaText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function pickFresh(options, conversation) {
  const last = lastSeyaText(conversation);
  return options.find((item) => !isNearDuplicate(item, last)) || options[0];
}

function alreadyTold(conversation, needle) {
  const pattern = new RegExp(needle, "i");
  return (conversation?.messages || []).some(
    (item) => item.author === "seya" && pattern.test(normalize(item.text || "")),
  );
}

function speakZoneList(zone) {
  const parts = String(zone || "")
    .split(/\s*(?:,|\/| et )\s*/i)
    .map((item) => normalize(item))
    .filter(Boolean);
  const labels = parts.map((part) => {
    if (/cuisse/.test(part)) return "les cuisses";
    if (/hanche/.test(part)) return "les hanches";
    if (/jambe/.test(part)) return "les jambes";
    if (/aisselle/.test(part)) return "les aisselles";
    if (/maillot|bikini/.test(part)) return "le maillot";
    if (/bras/.test(part)) return "les bras";
    if (/dos/.test(part)) return "le dos";
    if (/ventre/.test(part)) return "le ventre";
    if (/fermete/.test(part)) return "le manque de fermeté";
    if (/ride/.test(part)) return "les rides";
    if (/acne/.test(part)) return "l’acné";
    if (/tache/.test(part)) return "les taches";
    if (/cerne/.test(part)) return "les cernes";
    if (/pore/.test(part)) return "les pores";
    if (/eclat/.test(part)) return "l’éclat";
    if (/hydrat/.test(part)) return "l’hydratation";
    if (/relachement/.test(part)) return "le relâchement";
    return /^les? |^l['’]/.test(part) ? part : `le ${part}`;
  });
  if (!labels.length) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

function spokenVisitDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  if (value === 60) {
    return "1 heure";
  }
  if (value % 60 === 0) {
    return `${value / 60} heures`;
  }
  if (value > 60) {
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return `${hours} h ${String(rest).padStart(2, "0")}`;
  }
  return `${value} minutes`;
}

function bookingOfferCta(conversation, durationMinutes) {
  const spoken = spokenVisitDuration(durationMinutes);
  const offer = String(conversation?.offerLabel || "").trim();
  const offerBit = offer ? " pour bénéficier de notre offre" : "";
  const durationBit = spoken ? ` Il dure environ ${spoken}.` : "";
  return `Je peux vous proposer un premier rendez-vous${offerBit}.${durationBit} Quand seriez-vous disponible ?`;
}

function firstNeedAck(family, zoneLabel, conversation) {
  if (family === "epilation") {
    return pickFresh(
      zoneLabel
        ? [
            `Pour ${zoneLabel}, nous adaptons le protocole à votre peau et à votre pilosité pour obtenir les meilleurs résultats possibles.`,
            `C’est noté pour ${zoneLabel}. Le protocole se personnalise selon la peau et la pilosité.`,
          ]
        : [
            "Pour l’épilation laser, le protocole se personnalise selon la peau et la pilosité.",
          ],
      conversation,
    );
  }
  if (family === "visage") {
    return pickFresh(
      zoneLabel
        ? [
            `Pour ${zoneLabel} que vous décrivez, nous avons des soins adaptés. Le diagnostic permettra de déterminer celui qui correspond le mieux à votre peau.`,
            `Je note ${zoneLabel}. Le diagnostic permettra de choisir le soin le plus adapté à votre peau.`,
          ]
        : [
            "Nous avons des soins visage adaptés. Le diagnostic permettra de déterminer celui qui correspond le mieux à votre peau.",
          ],
      conversation,
    );
  }
  return pickFresh(
    zoneLabel
      ? [
          `Pour ${zoneLabel}, nous avons des solutions qui peuvent vous accompagner dans votre objectif. Le bilan permettra de faire le point et de définir l’accompagnement adapté.`,
          `C’est noté pour ${zoneLabel}. Nous avons des solutions adaptées à cet objectif. Le bilan permettra de préciser l’accompagnement.`,
        ]
      : [
          "Nous avons des solutions minceur adaptées. Le bilan permettra de faire le point et de définir l’accompagnement.",
        ],
    conversation,
  );
}

function firstNeedReply(text, conversation, qualification, extras = {}) {
  const mission = extras.seyaMission || resolveSeyaMission(extras.seya || conversation?._seya);
  if (isWelcomeRelanceOnly(mission)) {
    extras = { ...extras, skipBookingCta: true };
  }
  const family =
    inferCareFamily(
      `${qualification?.need || ""} ${qualification?.zone || ""} ${text || ""} ${conversation?.treatment || ""} ${conversation?.campaign || ""}`,
    ) || "";
  const zoneLabel = speakZoneList(qualification?.zone);
  const needKnown = Boolean(qualification?.need || family);
  const detailKnown = Boolean(
    zoneLabel ||
      (family === "visage" && /peau|visage|fermete|ride|acne/.test(normalize(text))),
  );

  if (!needKnown) {
    if (alreadyTold(conversation, "soin minceur, un soin visage")) {
      return "";
    }
    return "Vous cherchez plutôt un soin minceur, un soin visage ou une épilation ?";
  }

  if (!detailKnown && (family === "minceur" || family === "epilation")) {
    if (alreadyTold(conversation, "quelle zone")) {
      return "";
    }
    return family === "epilation"
      ? "C’est noté. Quelle zone souhaitez-vous traiter ?"
      : "C’est noté. Quelle zone souhaitez-vous que l’on regarde ?";
  }

  if (!detailKnown && family === "visage") {
    if (alreadyTold(conversation, "objectif pour la peau")) {
      return "";
    }
    return "C’est noté. Quel est votre objectif pour la peau ?";
  }

  if (
    alreadyTold(
      conversation,
      "quand seriez-vous disponible|protocole à votre peau|solutions qui peuvent vous accompagner|diagnostic permettra",
    )
  ) {
    return "";
  }

  const ack = firstNeedAck(family, zoneLabel, conversation);
  if (extras.skipBookingCta) {
    return ack;
  }
  return `${ack} ${bookingOfferCta(conversation, extras.durationMinutes)}`.replace(
    /\s+/g,
    " ",
  ).trim();
}

function conversationalReply(text, conversation, qualification, now, extras = {}) {
  if (isCenterAffirmation(text)) {
    return "";
  }
  if (isIdentityQuestion(text)) {
    return identityReply();
  }
  if (isWrongCenter(text)) {
    return wrongCenterReply(now);
  }
  if (isOutOfZone(text)) {
    return "D’accord, je note que ce n’est pas dans notre secteur. Je vous souhaite une belle journée.";
  }
  if (isWaitUntilLater(text)) {
    return "D’accord, on se reparle fin du mois.";
  }
  if (isAskToWriteBack(text)) {
    const day = parseNextWeekdayIso(text, now);
    if (day) {
      const weekday = [
        "dimanche",
        "lundi",
        "mardi",
        "mercredi",
        "jeudi",
        "vendredi",
        "samedi",
      ][new Date(`${day}T12:00:00`).getDay()];
      return `Très bien, je vous recontacte ${weekday}.`;
    }
    return "Très bien, je vous recontacte.";
  }
  if (isWillComeBack(text) || isWillCallBack(text)) {
    return willCallBackReply(now);
  }
  if (isThreadComplaint(text) && threadIsPaused(conversation, text)) {
    return "Vous avez raison, c’était bien noté. On vous laisse revenir quand ça vous arrange, je ne vous relance pas.";
  }
  if (isOpeningHoursAsk(text) && /dimanche/.test(normalize(text))) {
    return "Non, nous ne travaillons pas le dimanche. Dites-moi un jour d’ouverture qui vous arrange, je regarde.";
  }
  if (isAppointmentConfirmed(conversation) && (isThanks(text, conversation) || isShortYes(text))) {
    return pickFresh(
      ["Avec plaisir, à bientôt.", "Avec plaisir.", "Très bien, à bientôt."],
      conversation,
    );
  }
  if (isThanks(text, conversation) || (isAppointmentConfirmed(conversation) && isShortYes(text))) {
    return pickFresh(["Avec plaisir.", "Très bien.", "Avec plaisir, à bientôt."], conversation);
  }
  if (isAwayForNow(text) || isWillCallBack(text)) {
    return willCallBackReply(now);
  }
  if (isAlreadyBookedElsewhere(text)) {
    return alreadyBookedReply(text);
  }
  if (isHesitation(text) || refusesSlots(text)) {
    return pickFresh(
      [
        "Très bien, prenez le temps.",
        "D’accord, on n’avance pas sur un rendez-vous pour l’instant.",
      ],
      conversation,
    );
  }
  const value = normalize(text);
  if (/carte (bleue|bancaire)|\bcb\b|paiement|payer|cheque|especes/.test(value)) {
    return "Oui, le règlement se fait au centre. L’équipe vous indiquera les moyens acceptés sur place.";
  }
  if (/parking|se garer|se garer|ou (je )?me gare/.test(value)) {
    return "Je n’ai pas le détail du parking. Je peux demander à l’équipe et vous le confirmer.";
  }
  if (/homme|pour un homme|les hommes/.test(value)) {
    return "Oui, le centre reçoit aussi les hommes, selon la prestation.";
  }
  if (/copine|amie|accompagn/.test(value)) {
    return "Vous pouvez venir accompagnée. Dites-le simplement à l’accueil le jour J.";
  }
  if (/ouvert/.test(value) && /samedi/.test(value)) {
    return "Oui, le samedi est en général ouvert. Je peux regarder un horaire précis si vous le souhaitez.";
  }
  if (/s[' ]epiler|epilation avant|raser/.test(value)) {
    return "Pour la cryo, on vous précise les consignes au bilan. Pas besoin de tout anticiper maintenant.";
  }
  if (/allaite|allaitement/.test(value)) {
    return "Pour l’allaitement, une personne du centre doit vérifier avant toute séance. Je peux lui transmettre.";
  }
  if (/je me suis trompe|je voulais (plutot |le )?(lundi|mardi|mercredi|jeudi|vendredi|samedi)/.test(value)) {
    return "";
  }
  if (
    /c[' ]est quoi le rapport|essaie de comprendre|tu (n[' ]as pas |n[' ]a pas )?compris|hors sujet|rien a voir/.test(
      value,
    )
  ) {
    return "";
  }
  if (wantsSlots(text, conversation) || isBookingThread(conversation)) {
    return "";
  }

  return firstNeedReply(text, conversation, qualification, extras);
}

function composeReplies(parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

module.exports = {
  acceptsBookingOffer,
  alreadyBookedReply,
  alreadyTold,
  checkingSlotReply,
  isAlreadyBookedElsewhere,
  isAppointmentConfirmed,
  threadHasConfirmedVisit,
  isConfirmingOfferedTime,
  composeReplies,
  conversationalReply,
  firstNeedReply,
  spokenVisitDuration,
  identityReply,
  isAwayForNow,
  isBookingThread,
  isWillCallBack,
  isOffTopicComplaint,
  isCenterAffirmation,
  isRereadAsk,
  greetingForTime,
  weekHalfFromText,
  dayPartFromText,
  asksNextWeek,
  asksOtherDay,
  lastSeyaAskedToSearch,
  willCallBackReply,
  isHesitation,
  isIdentityQuestion,
  isWrongCenter,
  wrongCenterReply,
  isOutOfZone,
  isWillComeBack,
  isAskToWriteBack,
  isWaitUntilLater,
  isServiceAsk,
  wantsNoon,
  isRescheduleAsk,
  threadWantsNoon,
  asksOpenQuestion,
  askedServiceName,
  parseLaterIso,
  isCentrePause,
  isRobotComplaint,
  isOpeningHoursAsk,
  isThreadComplaint,
  isMessageTimeMention,
  parseNextWeekdayIso,
  isLeadRefusal,
  crmUpdateFromLeadMessage,
  lockedCrmStatuses,
  isShortYes,
  isThanks,
  lastSeyaOfferedToBook,
  offeredSlots,
  parseClockMinutes,
  refusesSlots,
  wantsSlots,
  slotsFromOfferedText,
  slotsFromStaffThread,
  withStaffOfferedSlots,
  applyCentreMessage,
  threadIsPaused,
};
