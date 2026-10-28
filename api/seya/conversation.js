const { classifyPriceQuestion, isNearDuplicate, isPriceRepeatComplaint } = require("./price");
const { axisClarifyQuestion, inferCareFamily, resolveActiveFamily } = require("./care-family");
const { isWelcomeRelanceOnly, resolveSeyaMission } = require("./mission");
const { classifyHealthMessage } = require("./health");
const { pathGoal, pathStepReply, stepAsked } = require("./path");

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
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].author !== "lead") {
      continue;
    }
    const text = messages[index].text || "";
    if (isThreadComplaint(text) || isOpeningHoursAsk(text)) {
      continue;
    }
    if (
      isWillComeBack(text) ||
      isWillCallBack(text) ||
      isOutOfZone(text) ||
      isLeadRefusal(text, { messages: messages.slice(0, index) })
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
  return /tu es (une )?ia|t[' ]es une ia|vous etes (une )?ia|c[' ]est une ia|je parle (a|à) un robot|assistante virtuelle|chatbot|intelligence artificielle|\b(tu es|t[' ]es|vous etes|c[' ]est)( pas)?( un| une| une vraie| un vrai)? (humain|humaine|robot|vraie personne|personne reelle)\b|\b(un|une) (robot|humain|humaine)\s*\?/.test(
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
  return /comment (faire )?(pour )?modifi|modifi(er|ez)|changer (l[' ]heure|le (creneau|rdv|rendez-vous|horaire))|l[' ]heure ne (me )?convient|ne convient pas|pas (dit )?oui pour (cet |cette )?(horaire|creneau)|pas cet horaire|mais a midi|\b(decaler|reporter|deplacer)\b|\b(je )?(ne )?(peux|pourrai|pourrais) (finalement |plus )?pas (venir|y aller|etre la|lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|ce jour)/.test(
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
      `(lundi|mardi|mercredi|jeudi|vendredi|samedi|le|du|a partir du|des le)\\s+${hour}\\b`,
    ).test(value);
    const followedByUnit =
      !looksLikeClock &&
      /^\s*(km|kilo|kg|min|minute|an\b|ans\b|mois|cm|%|€|euro|fois|seance|sceance|enfant|semaine|jour|taille|kilometre)/.test(
        value.slice(match.index + token.length),
      );
    if (
      followedByUnit ||
      (!looksLikeClock && (dayAfterWeekday || hasDayOfMonthRequest(text)))
    ) {
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
  return /propose(r)? (un )?(creneau|horaire|rdv)|je (peux |vais )?(vous )?(regarder|proposer)|quel jour|lequel vous (irait|conviendrait)|cela vous conviendrait|quand (etes|seriez)|debut de semaine|fin de semaine|je peux vous proposer|autre journee|autre jour|lundi suivant|(l['’])?horaire.*(convient|irait)|convient toujours|pas de disponibilite|je (vous )propose|je vous le reserve|est disponible\. je vous/.test(
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
    /rendez[- ]?vous dans (un[e]? )*(autre )?(clinique|centre|institut)/.test(value) ||
    /(clinique|institut).{0,60}(soins? esthetiques?|voir ce que|comparer)/.test(value)
  ) {
    return false;
  }
  if (
    /je (veux|voudrais|souhaite|aimerais|peux) (prendre|reserver|caler)/.test(value)
  ) {
    return false;
  }
  if (
    /(prendre|reserver|caler) (un )?(rdv|rendez-vous|creneau)/.test(value) &&
    !/j[' ]?ai |je viens de |deja |a l[' ]instant/.test(value)
  ) {
    return false;
  }
  const platform =
    /doctolib|planity|treatwell|fresha|clicrdv|rdv medical|en ligne|sur (le )?site|sur (votre )?agenda/.test(
      value,
    );
  const mentionsVisit =
    /(rdv|rendez-vous|creneau|reserve|reservation|booke|cale)/.test(value) ||
    platform;
  if (!mentionsVisit) {
    return false;
  }
  const declared =
    /j[' ]?ai (deja )?(pris|reserve|booke|cale|pose|fixe)/.test(value) ||
    /je viens de (prendre|reserver|booker|caler|poser)/.test(value) ||
    /a l[' ]instant/.test(value) ||
    /deja (pris|reserve|booke|cale|pose|fixe)/.test(value) ||
    /rdv (deja )?pris/.test(value) ||
    /rendez-vous (deja )?(pris|reserve|cale)/.test(value) ||
    /j[' ]?ai (un |mon )?(rdv|rendez-vous|creneau)\b/.test(value) ||
    /cale(e)? (un )?(rdv|rendez-vous|creneau)/.test(value);
  return (
    declared ||
    (platform && /pris|reserve|booke|cale|pose|fixe|rdv|creneau/.test(value))
  );
}

function alreadyBookedReply(text) {
  const value = normalize(text);
  const hasWhen =
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd'hui)\b/.test(
      value,
    ) ||
    /\b\d{1,2}\s*h(\d{2})?\b/.test(value) ||
    /\b\d{1,2}\/\d{1,2}\b/.test(value);
  if (hasWhen) {
    return "Merci de me l’avoir indiqué 😊";
  }
  return "Merci de me l’avoir indiqué 😊 Si vous avez le jour et l’heure, je peux les noter pour l’équipe.";
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
    /^(le |la )?(premier|premiere|1er|deuxieme|second|seconde|2e|2eme|dernier|derniere)( creneau| horaire)?$/.test(compactText(text)) ||
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

function isCourtesyClose(text) {
  const value = compactText(text);
  return /^(merci( beaucoup)?[, ]*)?(et )?(passez une )?(tres )?(bonne|bon) apres[- ]?midi( a vous| a toute)?[.! ]*$/.test(
    value,
  );
}

function isThanks(text, conversation) {
  if (acceptsBookingOffer(text, conversation)) {
    return false;
  }
  if (isCourtesyClose(text)) {
    return true;
  }
  const value = compactText(text);
  if (
    /^(merci beaucoup d'avance|merci d'avance|merci beaucoup|super merci|ok merci|c'est gentil|je vous remercie|merci)$/.test(
      value,
    )
  ) {
    return true;
  }
  if (
    /^((super|ok|parfait|top|tres bien|d'accord|genial) )?(merci( beaucoup)? )?(et )?(bonne (journee|soiree|fin de journee|semaine|week-end|weekend)|au revoir)( a vous)?( merci)?$/.test(
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

/** « Vous avez des disponibilités / un créneau » ≠ question sur une prestation. */
function isSchedulingVocabulary(label) {
  return /disponibilit|\bdispos?\b|creneau|horaire|rendez[- ]?vous|\brdv\b|\bquand\b|\bjour\b|\bheure\b|matin|apres[- ]midi|soir|place (libre|cette|vendredi|lundi|mardi|mercredi|jeudi|samedi)|de la place|creneaux/.test(
    normalize(label),
  );
}

function isAgendaAvailabilityAsk(text) {
  const value = normalize(text);
  if (
    /(soin|soins|epilation|laser|minceur|visage|cryo|lumiere pulsee|hydra|radiofrequence|massage|pilates|yoga)/.test(
      value,
    )
  ) {
    return false;
  }
  return /disponibilit|\bdispos?\b|creneau|quel jour|quelle heure|quand (seriez|etes|pourriez)|par hasard|de la place|place (cette|vendredi|lundi|mardi|mercredi|jeudi|samedi|demain|bientot)/.test(
    value,
  );
}

function askedServiceName(text) {
  const value = normalize(text)
    .replace(/[?!.…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Agenda / dispo : jamais une demande de soin (« Vous avez des disponibilités quand ? »).
  if (isAgendaAvailabilityAsk(text)) {
    return "";
  }
  // Autre ville / autre centre (« centre sur Cournon ») ≠ prestation.
  if (
    /centre (sur|a|de|dans)|institut (sur|a|de|dans)|secteur |cournon|la bas\b/.test(value)
  ) {
    return "";
  }
  const match = value.match(
    /(?:faites|faisiez|proposez|offrez|avez)(?:[- ]vous)?(?: aussi)?(?: le | la | l'| les | de | du | des | un | une )(.+)$/,
  );
  if (match?.[1]) {
    const asked = String(match[1]).replace(/\s+/g, " ").trim();
    return isSchedulingVocabulary(asked) ? "" : asked;
  }
  const inverted = value.match(
    /(?:le |la |l'|les |un |une |de l[' ]|de la |du |des )?(soins?(?: visage| minceur)?|epilation(?: laser| definitive)?|laser|minceur|visage|lumiere pulsee).{0,30}vous (?:faites|faisiez|proposez|avez|offrez)/,
  );
  if (inverted?.[1]) {
    return String(inverted[1]).replace(/\s+/g, " ").trim();
  }
  const seen = value.match(
    /j[' ]ai vu que vous (?:faisiez|faites|proposiez|proposez|aviez|avez)(?: aussi)?(?: le | la | l'| les | de | du | des | un | une )?(.+)$/,
  );
  const fromSeen = String(seen?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  return isSchedulingVocabulary(fromSeen) ? "" : fromSeen;
}

function isServiceAsk(text) {
  const value = normalize(text);
  if (isAgendaAvailabilityAsk(text)) {
    return false;
  }
  if (
    /centre (sur|a|de|dans)|institut (sur|a|de|dans)|secteur |cournon|faire .{0,40}la bas/.test(
      value,
    )
  ) {
    return false;
  }
  if (askedServiceName(text)) {
    return true;
  }
  return (
    /est[- ]ce que vous (faites|faisiez|proposez|avez|offrez)|vous (faites|faisiez|proposez) (le |la |l'|les |un |une )/.test(
      value,
    ) ||
    /(soin|soins|epilation|laser|minceur|visage|lumiere pulsee).{0,40}vous (faites|faisiez|proposez|avez|offrez)/.test(
      value,
    ) ||
    /j[' ]ai vu que vous (faisiez|faites|propos)/.test(value)
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

// Seya vient de proposer d’autres questions : « non merci » y répond, ce n’est pas un refus commercial.
function invitesMoreQuestions(seyaText) {
  return /autres? questions?|une question vous vient|si vous avez (une |des )?questions?|besoin d['’]autre chose|autre chose (pour vous|à savoir|a savoir)|puis-je vous aider|je reste disponible|je suis là si/i.test(
    String(seyaText || ""),
  );
}

function declinesMoreQuestions(text) {
  const value = compactText(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\b(bonne (journee|soiree|fin de journee)|a bientot|au revoir)\b/g, "")
    .replace(/\b(merci|thanks|thank you)( (beaucoup|bcp|bien|a vous))?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (
    !value ||
    /^(non|no|nope|nan|non non|pas (d'autres?|de) questions?|aucune( question)?|non aucune|rien|non rien|rien d'autre|non c'est (bon|tout|ok|parfait)|c'est (bon|tout|ok|parfait|clair|note)|ca ira|non ca ira|tout est clair|pas pour (l'instant|le moment)|non pas pour (l'instant|le moment)|ok|d'accord|parfait|super|top)$/.test(
      value,
    )
  );
}

function isBareNo(text) {
  const value = compactText(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\b(merci|thanks)( (beaucoup|bcp|bien))?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^(non|no|nope|nan|non non|ca ira|non ca ira)$/.test(
    value,
  );
}

function lastSeyaQuestion(seyaText) {
  const questions = String(seyaText || "").match(/[^.!?]*\?/g) || [];
  return questions.length ? questions[questions.length - 1].trim() : "";
}

// Question fermée sur un fait (« Avez-vous déjà testé… ? ») : « non » y répond, ce n’est pas un refus.
function asksFactualYesNo(question) {
  const value = normalize(question);
  return (
    Boolean(value) &&
    !/\b(quel|quelle|quels|quelles|combien|comment|quand|pourquoi|lequel|laquelle)\b|^ou\b|\bd'ou\b/.test(value) &&
    !/souhaitez|voulez|preferez|aimeriez|je vous propose|vous irait|ca vous (dit|va|irait)|je (fasse|transmette|regarde|cherche|reserve|bloque)/.test(
      value,
    ) &&
    /\b(avez[- ]vous|vous avez|aviez[- ]vous|etes[- ]vous|vous etes|est[- ]ce que|faites[- ]vous|suivez[- ]vous|prenez[- ]vous|c'est (une|la|votre) premiere)\b/.test(
      value,
    )
  );
}

/**
 * Le prospect clôt poliment : « non merci » après « autre question ? », ou « non » à une proposition.
 * Retourne "thanks" | "declined" | "" — jamais un refus commercial.
 */
function closingKind(text, conversation) {
  if (!conversation) {
    return "";
  }
  const seyaText = lastSeyaText(conversation);
  if (invitesMoreQuestions(seyaText) && declinesMoreQuestions(text)) {
    return "thanks";
  }
  const question = lastSeyaQuestion(seyaText);
  if (question && isBareNo(text) && !asksFactualYesNo(question)) {
    return "declined";
  }
  return "";
}

function closesAfterOffer(text, conversation) {
  return Boolean(closingKind(text, conversation));
}

function politeCloseReply(now, kind = "thanks") {
  return kind === "declined"
    ? `Très bien, je n’insiste pas 😊 Si vous changez d’avis ou avez une question, écrivez-nous ici. Je vous souhaite ${greetingForTime(now)}.`
    : `Très bien, merci à vous 😊 Je vous souhaite ${greetingForTime(now)}.`;
}

/** Le prospect demande explicitement à être rappelé (pas « je vous rappellerai »). */
function asksForCallback(text) {
  const value = normalize(text);
  if (
    /(pas|plus) (besoin (d'|de )?)?(etre )?(rappel|appel)|ne (me )?(rappelez|appelez|contactez) pas|ne pas (me )?(rappeler|appeler)/.test(
      value,
    )
  ) {
    return false;
  }
  return /rappelez[- ]moi|appelez[- ]moi|me rappeler|m'appeler|etre rappelee?s?|qu'on me rappelle|qu'on m'appelle|qu'(une|un) (experte?|conseill[a-z]+|personne|operatrice) (me )?(rappelle|appelle)|un rappel|me recontacter|recontactez[- ]moi|par telephone/.test(
    value,
  );
}

function isLeadRefusal(text, conversation) {
  const raw = String(text || "").trim();
  const needle = normalize(raw).replace(/[!?.]+$/g, "");
  if (!needle) {
    return false;
  }
  if (closesAfterOffer(raw, conversation)) {
    return false;
  }
  if (/^(stop|stoppez|arrete|arretez|stop svp)$/.test(needle)) {
    return true;
  }
  if (/pas int[eé]ress/.test(needle)) {
    return true;
  }
  if (
    /(ne|n') ?m'interesse (pas|plus)|je ne suis (plus|pas) interess|ce n'est pas pour moi|c'est pas pour moi|plus besoin de vos services/.test(
      needle,
    )
  ) {
    return true;
  }
  if (/ne donne(rai)? pas (la )?suite|pas (la )?peine/.test(needle)) {
    return true;
  }
  if (
    /ne (me )?(plus )?(e[cç]rire|contacter|d[eé]ranger|appeler|relancer)/.test(
      needle,
    ) ||
    /ne (me |m')?(ecrivez|contactez|derangez|relancez|appelez|rappelez) plus|arretez de (me |m')(ecrire|contacter|relancer|appeler)/.test(
      needle,
    )
  ) {
    return true;
  }
  if (isWrongCenter(raw)) {
    return true;
  }
  if (/^plus jamais$/.test(needle)) {
    return true;
  }
  // « Non merci » sans question en cours (ex. réponse à une relance) reste un refus.
  return /^non merci$/.test(needle) && !lastSeyaQuestion(lastSeyaText(conversation));
}

function refusedInThread(conversation) {
  const messages = conversation?.messages || [];
  return messages.some(
    (item, index) =>
      item.author === "lead" &&
      isLeadRefusal(item.text || "", { messages: messages.slice(0, index) }),
  );
}

function crmUpdateFromLeadMessage(text, now, extras = {}) {
  if (isLeadRefusal(text, extras.conversation)) {
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

// Statut CRM à poser après un message du prospect (n’influence pas la réponse de Seya).
function crmStatusFromLeadMessage(text, now, extras = {}) {
  const update = crmUpdateFromLeadMessage(text, now, extras);
  if (update) {
    return update;
  }
  if (isThinkingItOver(text) && !isServiceAsk(text)) {
    return {
      status: "En réflexion",
      conversationStatus: null,
      reminderDate: null,
    };
  }
  return null;
}

function isThinkingItOver(text) {
  const value = normalize(text);
  if (/j[' ]?ai (bien |deja )?reflechi/.test(value)) {
    return false;
  }
  return /\breflechi(r|s|t)\b|\breflexion\b/.test(value);
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
  if (
    /\b(apm|aprem)['']?\b|apres[- ]?midi/.test(value) &&
    !/^(.* )?(bonne|bon) apres[- ]?midi( a vous)?$/.test(value)
  ) {
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
  if (
    /prix|tarif|combien|adresse|ou (etes|se trouve)|situe|situ[eé]/.test(value) &&
    !/dispo|creneau|horaire|vous avez (jeudi|lundi|mardi|mercredi|vendredi|samedi)/.test(value)
  ) {
    return false;
  }
  // Autre RDV perso (« demain j’ai également un rdv ») ≠ demande de créneau.
  if (
    /j[' ]ai .{0,40}(rdv|rendez-vous)|egalement un (rdv|rendez-vous)/.test(value) &&
    !/dispo|creneau|vous avez (jeudi|lundi|mardi|mercredi|vendredi|samedi)|quand (seriez|etes)|je (suis|serais) disponible/.test(
      value,
    )
  ) {
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
  return asksAgenda || (namesDay && !refusedDay) || hasDayOfMonthRequest(text);
}

function hasDayOfMonthRequest(text) {
  const value = ` ${normalize(text)} `;
  return /(?:a partir du|des le|(?:^|[\s,;])(?:le|du))\s+\d{1,2}(?:er|e)?(?!\s*(?:h|:|\/))/.test(
    value,
  );
}

function identityReply(seya) {
  const goal = pathGoal(seya);
  if (goal === "callback") {
    return "Je suis Seya, l’assistante virtuelle du centre. Je réponds à vos questions, et un expert ou une experte du centre peut vous rappeler pour organiser votre rendez-vous.";
  }
  if (goal === "none") {
    return "Je suis Seya, l’assistante virtuelle du centre. Je réponds à vos questions, et l’équipe peut reprendre la conversation si vous préférez.";
  }
  return "Je suis Seya, l’assistante virtuelle du centre. Je peux vous renseigner et organiser votre rendez-vous, et l’équipe peut reprendre la conversation si vous préférez.";
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
    if (/poignee/.test(part)) return "les poignées d’amour";
    if (/fess/.test(part)) return "les fesses";
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

function asksFeasibility(text) {
  return /je (peux|pourrais|pourrai) (faire|traiter|le faire)|est-ce (que c['’]est )?possible|c['’]est possible|(ça|ca) (marche|fonctionne)|c['’]est efficace|vous (pouvez|pourriez) (traiter|faire|m['’]aider)|possible de (les |le |la )?(traiter|faire|enlever|retirer)/i.test(
    String(text || ""),
  );
}

function minceurGoalLabel(text) {
  const value = normalize(text);
  const kilos = value.match(/(\d+)\s*(kg|kilos?)\b/);
  if (kilos && /perdre|en trop|maigrir|mincir|enlever/.test(value)) return `perdre ${kilos[1]} kilos`;
  if (/perdre du poids|maigrir|mincir|kilos? en trop|kilos? a perdre/.test(value)) return "perdre du poids";
  if (/cellulite|peau d['’ ]?orange/.test(value)) return "travailler la cellulite";
  if (/graisse|capiton|bourrelet/.test(value)) return "réduire les graisses localisées";
  if (/silhouette|affiner/.test(value)) return "affiner la silhouette";
  return "";
}

function offerPhrase(offer) {
  const value = String(offer || "")
    .trim()
    .replace(/^(?:(?:une|un|les|le|la|notre|nos)\s+|l['’]\s*)/i, "");
  if (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(value)) {
    return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
  }
  return value;
}

// Répond à « est-ce possible ? » sans promettre de résultat ni sortir de l’offre du centre.
function feasibilityAck(zoneLabel, conversation) {
  const offer = offerPhrase(conversation?.offerLabel);
  const subject = zoneLabel ? `Pour ${zoneLabel}, c’est` : "C’est";
  return offer
    ? `${subject} justement ce que l’on regarde avec vous pendant notre ${offer}.`
    : `${subject} justement ce que l’équipe regarde avec vous.`;
}

function needAck(family, zoneLabel, conversation, text) {
  return asksFeasibility(text) && !classifyHealthMessage(text).personal
    ? feasibilityAck(zoneLabel, conversation)
    : firstNeedAck(family, zoneLabel, conversation);
}

function firstNeedAck(family, zoneLabel, conversation) {
  if (zoneLabel) {
    return pickFresh(
      [`C’est noté pour ${zoneLabel}.`, `Je note ${zoneLabel}.`],
      conversation,
    );
  }
  if (family === "epilation") {
    return pickFresh(["C’est noté.", "Parfait, je note."], conversation);
  }
  if (family === "visage") {
    return pickFresh(["C’est noté.", "Parfait, je note."], conversation);
  }
  return pickFresh(["C’est noté.", "Parfait, je note."], conversation);
}

function lastSeyaAskedDistance(conversation) {
  return /quelle distance|moins de \d+\s*km|situ[ée]e? à quelle/i.test(
    lastSeyaText(conversation),
  );
}

function lastSeyaAskedTried(conversation) {
  return /technologies? (avez-vous )?(déjà )?(essay|test)|déjà (essayé|testé)|soins avec technologie|c['’]est une premi[eè]re/i.test(
    lastSeyaText(conversation),
  );
}

function looksLikeTriedAnswer(text) {
  const value = normalize(text);
  if (!value) {
    return false;
  }
  if (
    /quelle zone|quelles zones|objectif|distance|combien|prix|tarif|\?/.test(value) &&
    !/deja |jamais|rien|regime|sport|reequilibrage|essai|teste|essay/.test(value)
  ) {
    return false;
  }
  return (
    /regime|sport|reequilibrage|aliment|jamais|rien\b|aucune|premiere fois|deja (fait|essaye|teste)|cryo|laser|presso|cire|epil|methode|solution|soin|seance|techno/.test(
      value,
    ) || /a part /.test(value)
  );
}

function extractConsultativeFields(current, text, conversation) {
  const next = {
    distance: String(current?.distance || "").trim(),
    tried: String(current?.tried || "").trim(),
  };
  const raw = String(text || "").trim();
  if (
    !raw ||
    wantsSlots(text, conversation) ||
    classifyPriceQuestion(text) ||
    classifyHealthMessage(text).personal
  ) {
    return next;
  }
  if (!next.distance) {
    if (lastSeyaAskedDistance(conversation) || /\d+\s*km/i.test(raw) || /j['’]habite/i.test(raw)) {
      next.distance = raw.slice(0, 80);
    }
  }
  if (
    !next.tried &&
    (lastSeyaAskedTried(conversation) || looksLikeTriedAnswer(text))
  ) {
    next.tried = raw.slice(0, 120);
  }
  return next;
}

function availabilityCta(conversation, extras = {}) {
  const mission = extras.seyaMission || resolveSeyaMission(extras.seya || conversation?._seya);
  const dayPart = conversation?.bookingState?.dayPart;
  const partLabel =
    dayPart === "afternoon"
      ? "l’après-midi"
      : dayPart === "morning"
        ? "le matin"
        : dayPart === "evening"
          ? "en fin de journée"
          : "";
  if (mission === "qualify_callback" || extras.skipBookingCta) {
    return "";
  }
  if (partLabel) {
    return `Je note ${partLabel}. Quel jour vous conviendrait ? Je regarde un créneau.`;
  }
  return "Parfait. Dites-moi un ou deux jours où vous êtes disponible, je regarde un créneau.";
}

function firstNeedReply(text, conversation, qualification, extras = {}) {
  const mission = extras.seyaMission || resolveSeyaMission(extras.seya || conversation?._seya);
  if (isWelcomeRelanceOnly(mission)) {
    extras = { ...extras, skipBookingCta: true };
  }
  const family =
    resolveActiveFamily(
      extras.seya || conversation?._seya,
      { ...conversation, qualification },
      text,
    ) ||
    inferCareFamily(
      `${qualification?.need || ""} ${qualification?.zone || ""} ${text || ""} ${conversation?.treatment || ""}`,
    ) ||
    "";
  const zoneLabel =
    speakZoneList(qualification?.zone) || (family === "minceur" ? minceurGoalLabel(text) : "");
  const needKnown = Boolean(qualification?.need || family);
  // Le besoin peut avoir été donné plus tôt dans le fil, pas forcément dans l’ordre prévu.
  const threadLead = normalize(
    [...(conversation?.messages || []).filter((item) => item.author === "lead").map((item) => item.text), text].join(" "),
  );
  const detailKnown = Boolean(
    zoneLabel ||
      qualification?.detail ||
      (family === "minceur" && minceurGoalLabel(threadLead)) ||
      (family === "visage" &&
        /peau|visage|fermete|ride|ridule|acne|tache|eclat|relach|teint|cerne|pore/.test(threadLead)) ||
      (family === "epilation" && /\bpoil|pilosit/.test(threadLead)),
  );
  const extracted = extractConsultativeFields(qualification, text, conversation);
  const consultative = {
    ...qualification,
    distance: qualification?.distance || extracted.distance,
    tried: qualification?.tried || extracted.tried,
  };

  if (!needKnown) {
    const clarify = axisClarifyQuestion(extras.seya || conversation?._seya);
    if (alreadyTold(conversation, "soin minceur|soin visage|une épilation")) {
      return "";
    }
    return (
      clarify ||
      "Vous cherchez plutôt un soin minceur, un soin visage ou une épilation ?"
    );
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

  const goal = pathGoal(extras.seyaMission || extras.seya || conversation?._seya);
  const pathConversation = { ...conversation, _seya: extras.seya || conversation?._seya, qualification };
  const ack = needAck(family, zoneLabel, conversation, text);
  const step = (stepGoal) =>
    `${ack} ${pathStepReply({
      goal: stepGoal,
      family,
      seya: pathConversation._seya,
      conversation: pathConversation,
      withOffer: !/pendant notre/.test(ack),
    })}`
      .replace(/\s+/g, " ")
      .trim();

  if (isWelcomeRelanceOnly(mission)) {
    if (extras.skipConsultative || stepAsked(lastSeyaText(conversation)) || alreadyTold(conversation, "(bilan|diagnostic) permettra d'evaluer")) {
      return ack;
    }
    return step("none");
  }

  if (extras.skipConsultative) {
    return "";
  }

  // Parcours : besoin connu → transition + bilan → action de l’objectif (A réservation, B rappel).
  // Pas de question distance / historique : seules les consignes propres d’un centre peuvent les prévoir.
  const bookingSignal =
    wantsSlots(text, conversation) || isBookingThread(conversation) || consultative.availability;
  if (!(goal === "book" && bookingSignal)) {
    if (
      alreadyTold(conversation, "quand seriez-vous disponible|du centre vous rappelle pour") &&
      alreadyTold(conversation, "(bilan|diagnostic) permettra d'evaluer|faire le point sur votre objectif")
    ) {
      return "";
    }
    return step(goal);
  }

  if (
    alreadyTold(
      conversation,
      "quand seriez-vous disponible|dites-moi un ou deux jours|envoyez-moi vos disponibilites",
    )
  ) {
    return "";
  }
  return availabilityCta(conversation, extras);
}

function conversationalReply(text, conversation, qualification, now, extras = {}) {
  if (isCenterAffirmation(text)) {
    return "";
  }
  if (isIdentityQuestion(text)) {
    return identityReply(extras.seya || conversation?._seya);
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
  extractConsultativeFields,
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
  lastSeyaText,
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
  refusedInThread,
  asksForCallback,
  closesAfterOffer,
  closingKind,
  politeCloseReply,
  crmStatusFromLeadMessage,
  crmUpdateFromLeadMessage,
  lockedCrmStatuses,
  isShortYes,
  isCourtesyClose,
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
  hasDayOfMonthRequest,
};
