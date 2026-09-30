const OpenAI = require("openai");
const {
  agentSettings,
  applyBookingMessage,
  applyLeadReply,
  asksLocation,
  asksPrice,
  emptySlotFallback,
  faqReply,
  guardSlots,
  hasMedicalFlag,
  humanSlotReply,
  isJunkTreatment,
  isOptOut,
  asksAccess,
  centerPlaceReply,
  formatCenterProfilePrompt,
  pickSlotsForState,
  matchProposedSlot,
  mergeQualification,
  message,
  priceReply,
  resolveOfferLabel,
  resolveOpeningOffer,
  resolveTreatmentUrl,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
  threadHasMedical,
} = require("./agent");
const {
  enforceOutgoingText,
  replyHasForbiddenSlots,
  shouldSearchSlots,
  slotAllowed,
} = require("./booking-state");
const { classifyHealthMessage, isAwaitingHealthReview } = require("./health");
const { classifyPriceQuestion, isPriceRepeatComplaint, isNearDuplicate } = require("./price");
const { asksOtherDay, isRereadAsk, offeredSlots, wantsSlots } = require("./conversation");

function seyaModel() {
  const requested = String(process.env.OPENAI_MODEL || "").trim();
  if (!requested || requested === "gpt-4o-mini") {
    return "gpt-4o";
  }
  return requested;
}

function hasAiKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

async function generateSeyaReply({
  conversation,
  text,
  seya,
  slots,
  centerName,
  appointments,
  hours,
  centerAddress,
  centerId,
  now,
}) {
  const previousLead = [...(conversation.messages || [])]
    .reverse()
    .find((item) => item.author === "lead")?.text;
  const intentText =
    isRereadAsk(text) && previousLead ? previousLead : text;
  const bookingState = applyBookingMessage(conversation.bookingState, intentText, {
    centerId: centerId || conversation.centerId,
    now,
    conversation,
  });
  const conversationWithState = {
    ...conversation,
    centerId: centerId || conversation.centerId || bookingState.centerId,
    bookingState,
  };
  const allowRepeat =
    asksOtherDay(intentText) ||
    /lundi|mardi|mercredi|jeudi|vendredi|samedi|debut de semaine|fin de semaine|fin de journee|soir|apres.?midi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
      String(intentText || ""),
    );
  const health = classifyHealthMessage(intentText);
  const rawSlots =
    shouldSearchSlots(bookingState, intentText, conversationWithState) &&
    !health.personal &&
    !health.general &&
    !isAwaitingHealthReview(conversationWithState)
      ? Array.isArray(appointments)
        ? pickSlotsForState(appointments, hours, bookingState, now)
        : slots || []
      : [];
  const guarded = guardSlots(rawSlots, bookingState, {
    centerId: conversationWithState.centerId,
    allowRepeat,
  });
  const resolvedSlots = guarded.slots;
  const extras = {
    centerName,
    centerAddress,
    centerId: conversationWithState.centerId,
    now,
    bookingState,
    guarded,
    appointments,
    centerProfile: agentSettings(seya).centerProfile,
  };
  const fallback = applyLeadReply(conversationWithState, text, seya, resolvedSlots, extras);
  const draft = lastSeyaText(fallback.conversation);
  const previousSeya = lastSeyaText(conversation);
  if (
    !hasAiKey() ||
    health.personal ||
    fallback.shouldBook ||
    asksPrice(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    /je vérifie le créneau|rendez-vous est confirmé/i.test(draft || "") ||
    (replyClosesThread(previousSeya) && !replyClosesThread(draft))
  ) {
    return { ...fallback, via: fallback.shouldBook ? "book" : "rules" };
  }

  try {
    const polishSlots = resolvedSlots.length
      ? resolvedSlots
      : offeredSlots(fallback.conversation, conversation.proposedSlots);
    const polished = await polishSeyaText({
      conversation: fallback.conversation,
      text,
      seya,
      slots: polishSlots,
      centerName,
      centerAddress,
      bookingState,
      draft,
    });
    return {
      ...withPolishedText(fallback, polished, bookingState),
      via: "ai",
    };
  } catch (error) {
    console.error("[seya/ai]", error);
    return { ...fallback, via: "rules" };
  }
}

async function polishSeyaText({
  conversation,
  text,
  seya,
  slots,
  centerName,
  centerAddress,
  bookingState,
  draft,
}) {
  const settings = agentSettings(seya);
  const careHint = `${conversation.qualification?.need || ""} ${conversation.qualification?.zone || ""} ${conversation.treatment || ""}`;
  const offer = resolveOpeningOffer(
    seya,
    conversation.campaign,
    conversation.qualification?.need || conversation.treatment,
  );
  const careUrl = resolveTreatmentUrl(
    seya,
    conversation.campaign,
    conversation.qualification?.need || conversation.treatment,
  );
  const brief = resolveTreatmentBrief(seya, careHint);
  const price = resolveTreatmentPrice(seya, careHint, conversation);
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 6000,
  });
  const history = (conversation.messages || [])
    .filter((item, index, list) => !(index === list.length - 1 && item.author === "seya"))
    .slice(-8)
    .map((item) => ({
      role: item.author === "lead" ? "user" : "assistant",
      content: String(item.text || "").slice(0, 400),
    }));

  const response = await client.chat.completions.create({
    model: seyaModel(),
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: polishPrompt({
          conversation,
          settings,
          seya,
          slots,
          centerName,
          offer,
          careUrl,
          brief,
          price,
          centerAddress,
          bookingState,
        }),
      },
      ...history,
      {
        role: "user",
        content: [
          `Dernier message de la cliente : ${String(text || "").slice(0, 800)}`,
          threadContext(conversation, text),
          `Faits Bookea autorisés (à utiliser, pas à recopier mot pour mot) : ${String(draft || "").slice(0, 700)}`,
        ].join("\n"),
      },
    ],
  });

  return sanitizeReply(response.choices?.[0]?.message?.content);
}

function polishPrompt({
  conversation,
  settings,
  seya,
  slots,
  centerName,
  offer,
  careUrl,
  brief,
  price,
  centerAddress,
  bookingState,
}) {
  const allowedSlots = (slots || [])
    .map((slot) => slot.label)
    .filter(Boolean)
    .join(" · ");
  const centerCard = formatCenterProfilePrompt(settings.centerProfile);

  return [
    "Tu es Seya, au standard WhatsApp. Chaleureuse, naturelle, claire, vouvoiement. Tu parles comme une réceptionniste au téléphone, 1 à 3 phrases.",
    "Ton objectif est d’accompagner jusqu’à la prise de rendez-vous, sans insister et sans coller deux fois la même réponse.",
    "Avant de répondre, tu tiens compte de tout le fil : ce que le prospect a demandé, les infos déjà données, les disponibilités déjà évoquées.",
    "Tu réponds au dernier message, dans ce contexte. Interdit de reposer une question déjà traitée. Interdit de recoller le dernier message Seya.",
    "Le texte Bookea est une fiche de faits autorisés, pas un script. Si Bookea propose un créneau ou pose une question alors que la cliente n’a pas demandé ça, tu ne le recopies pas.",
    "Tu ne mets jamais fin à la conversation. Interdit : « écrivez-moi quand vous voulez reprendre », « je vous prie », « je reviendrai vers vous », « une conseillère vous recontacte », sauf si elle demande clairement à parler à quelqu’un.",
    "Si elle dit aujourd’hui, un jour, 9h, oui merci, oui toujours, fin de journée, après-midi, ou « relis ce que je t’ai demandé », tu réponds à ÇA : un horaire déjà proposé, ou de nouveaux créneaux autorisés. Tu ne redemandes pas la zone.",
    "Tu ne dis jamais qu’il n’y a plus de créneau si des horaires autorisés sont listés plus bas.",
    "Si elle choisit 9h / 9h00 alors que 09h00 a été proposé, tu confirmes ce créneau.",
    "Si elle dit oui toujours après « l’horaire vous convient », tu confirmes l’horaire déjà vu. Tu ne clôtures pas.",
    "Si elle dit oui, ok, d’accord ou merci après qu’on lui a proposé de regarder les disponibilités, tu proposes des créneaux autorisés. Tu ne répètes pas « plus de place ».",
    "Si elle dit fin de journée, tu proposes des horaires en fin de journée parmi les créneaux autorisés, pas 12h.",
    "Si elle dit qu’elle ne veut pas qu’on la recontacte mais demande un créneau, une proposition ou un prix, tu réponds à ÇA. Tu ne clôtures pas.",
    "Si elle a réfléchi et demande le prix, tu donnes le tarif autorisé. Tu n’envoies pas « écrivez-moi quand vous voulez reprendre ».",
    "Si elle préfère recontacter elle-même, sans autre demande, tu dis seulement : « D’accord, aucun souci, je vous laisse revenir vers nous quand ça sera le moment pour vous. Je vous souhaite une belle journée / une bonne soirée :) ». Pas de créneau, pas de jour.",
    "Si Bookea cite des horaires ou demande un jour, tu gardes cette étape. Tu ne remplaces jamais ça par un au revoir.",
    "Tu ne changes aucun fait. Tu n’inventes ni jour, ni heure, ni prix, ni adresse, ni résultat médical.",
    "Pas de liste 1) 2) 3). Pas de « Lead Meta ». Un smiley au plus, pas à chaque message. Tu ne termines pas chaque phrase par une question.",
    `Centre : ${centerName || "le centre"}.`,
    `Prospect : ${conversation.firstName || "le prospect"}.`,
    offer ? `Offre à nommer : ${offer}.` : "Ne nomme pas une offre inventée.",
    careUrl
      ? `Lien du soin (seulement si on te le demande, jamais dans le premier message) : ${careUrl}`
      : "",
    settings.brief || seya.brief ? `Consignes du centre : ${settings.brief || seya.brief}` : "",
    centerCard
      ? `Fiche de CE centre uniquement (jamais JFG Clinic ni un autre établissement) :\n${centerCard}`
      : "Aucune fiche centre : tu ne parles que du nom et de l’adresse fournis. Interdit d’inventer une enseigne, un parking, un concept ou une autre clinique.",
    "Tu n’énumères pas cette fiche. Tu t’en sers seulement si on te pose une question sur le centre, l’accès, le concept, ou pour rassurer avant le rendez-vous.",
    brief ? `Consignes pour ce soin : ${brief}` : "",
    price ? `Tarif autorisé (seulement si le brouillon en parle) : ${price}` : "Aucun tarif. N’en invente pas.",
    centerAddress
      ? `Adresse autorisée (seulement si le brouillon en parle) : ${centerAddress}.`
      : "Adresse inconnue : ne l’invente pas.",
    allowedSlots
      ? `Seuls créneaux citables : ${allowedSlots}. Aucun autre jour ni aucune autre heure.`
      : "Aucun créneau à proposer. N’invente pas d’horaire.",
    bookingState?.requestedDate
      ? `Jour demandé : ${bookingState.requestedDate}. Interdit d’en proposer un autre.`
      : "",
    bookingState?.rejectedDates?.length
      ? `Jours refusés : ${bookingState.rejectedDates.join(", ")}.`
      : "",
    "Si le brouillon ne cite pas de créneau, tu n’en cites pas non plus.",
    "Réponds uniquement avec le texte WhatsApp, sans guillemets ni JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

function threadContext(conversation, text) {
  const qualification = conversation?.qualification || {};
  const state = conversation?.bookingState || {};
  const previousSeya = previousSeyaText(conversation);
  const known = [
    qualification.need ? `soin ${qualification.need}` : "",
    qualification.zone ? `zone ${qualification.zone}` : "",
    state.weekHalf === "end"
      ? "fin de semaine"
      : state.weekHalf === "start"
        ? "début de semaine"
        : "",
    state.dayPart === "evening"
      ? "fin de journée"
      : state.dayPart === "afternoon"
        ? "après-midi"
        : state.dayPart === "morning"
          ? "matin"
          : "",
  ].filter(Boolean);
  const offered = offeredSlots(conversation)
    .map((slot) => slot.label)
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  return [
    previousSeya
      ? `Dernier message Seya (ne pas le recoller, ne pas reposer la même question) : ${String(previousSeya).slice(0, 400)}`
      : "",
    known.length ? `Déjà établi dans ce fil : ${known.join(" · ")}.` : "",
    offered ? `Disponibilités déjà évoquées : ${offered}.` : "",
    `Réponds à : ${String(text || "").slice(0, 400)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function previousSeyaText(conversation) {
  const texts = (conversation?.messages || [])
    .filter((item) => item.author === "seya")
    .map((item) => String(item.text || "").trim())
    .filter(Boolean);
  if (texts.length >= 2) {
    return texts[texts.length - 2];
  }
  return "";
}

function lastSeyaText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function pickSafeReply(draft, polished, bookingState, conversation) {
  const candidate = sanitizeReply(polished);
  if (!candidate || candidate.length < 8) {
    return draft;
  }
  if (replyHasForbiddenSlots(candidate, bookingState)) {
    console.error("[seya/ai] polish_blocked", {
      centerId: bookingState?.centerId,
      requestedDate: bookingState?.requestedDate,
      preview: candidate.slice(0, 160),
    });
    return draft;
  }
  if (replyClosesThread(candidate) && !replyClosesThread(draft)) {
    return draft;
  }
  if (replyDropsBooking(draft, candidate)) {
    return draft;
  }
  if (replyPushesAfterPause(draft, candidate)) {
    return draft;
  }
  if (
    /quelle zone|zone souhaitez/i.test(candidate) &&
    !/quelle zone|zone souhaitez/i.test(draft) &&
    /\d{1,2}\s*h|semaine|jour|creneau|créneau/i.test(draft)
  ) {
    return draft;
  }
  if (
    /pas de (creneau|disponib)|reprendre contact/i.test(candidate) &&
    !/pas de (creneau|disponib)|reprendre contact/i.test(draft)
  ) {
    return draft;
  }
  const previous = previousSeyaText(conversation);
  if (previous && isNearDuplicate(candidate, previous) && !isNearDuplicate(draft, previous)) {
    return draft;
  }
  return candidate;
}

function replyClosesThread(text) {
  return /reviendrai vers vous|vous recontacte|je vous laisse|je clos le sujet|une conseill[eè]re du centre, elle|ecrivez[- ]moi quand|reprendre (la conversation|contact)|quand vous (voulez|souhaitez) reprendre|je vous prie[,.]|pas de creneaux disponibles|ravie que cela vous convienne|reste disponible si vous avez|d['’]autres questions/i.test(
    String(text || ""),
  );
}

function replyDropsBooking(draft, polished) {
  const draftBooks = /\d{1,2}\s*h\d{0,2}|quel jour vous irait|debut de semaine|je peux vous proposer/i.test(
    String(draft || ""),
  );
  const polishedBooks = /\d{1,2}\s*h\d{0,2}|quel jour vous irait|debut de semaine|je peux vous proposer/i.test(
    String(polished || ""),
  );
  return draftBooks && !polishedBooks;
}

function replyPushesAfterPause(draft, polished) {
  const draftPauses = /aucun souci|prenez le temps|n['’]avance pas|je reste disponible|c['’]est note|on vous attend|pas de probleme/i.test(
    String(draft || ""),
  );
  const polishedPushes = /quel jour|dites-moi un jour|je vous r[eé]serve|on fixe|creneau|créneau|pas besoin d['’]etre sur place/i.test(
    String(polished || ""),
  );
  return draftPauses && polishedPushes;
}

function withPolishedText(result, polished, bookingState) {
  const conversation = result.conversation;
  const messages = [...(conversation.messages || [])];
  const index = [...messages].map((item) => item.author).lastIndexOf("seya");
  if (index < 0) {
    return result;
  }
  const draft = messages[index].text;
  const safe = pickSafeReply(draft, polished, bookingState, conversation);
  if (safe === draft) {
    return result;
  }
  messages[index] = { ...messages[index], text: safe };
  return {
    ...result,
    conversation: { ...conversation, messages },
  };
}

function applyAiDecision(conversation, text, seya, slots, decision, extras = {}) {
  const settings = agentSettings(seya);
  const bookingState = extras.bookingState || applyBookingMessage(conversation.bookingState, text, {
    centerId: extras.centerId || conversation.centerId,
    now: extras.now,
    conversation,
  });
  const allowRepeat =
    asksOtherDay(text) ||
    /lundi|mardi|mercredi|jeudi|vendredi|samedi|debut de semaine|fin de semaine|fin de journee|soir|apres.?midi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
      String(text || ""),
    );
  const guarded = extras.guarded || guardSlots(slots, bookingState, {
    centerId: extras.centerId || conversation.centerId,
    allowRepeat,
  });
  const safeSlots = shouldSearchSlots(bookingState, text, conversation) ? guarded.slots : [];
  const qualification = {
    ...mergeQualification(conversation.qualification, text, conversation.treatment),
    ...(decision.need && !isJunkTreatment(decision.need) ? { need: decision.need } : {}),
    ...(decision.zone ? { zone: decision.zone } : {}),
    ...(decision.delay ? { delay: decision.delay } : {}),
    ...(decision.availability ? { availability: decision.availability } : {}),
  };
  const refuses = isOptOut(text);
  let action = refuses ? "stop" : decision.action;
  if (threadHasMedical(conversation, text) || hasMedicalFlag(text)) {
    action = "handoff";
  }
  if (
    (asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text) || asksLocation(text) || asksAccess(text) || faqReply(text)) &&
    (action === "stop" || action === "propose_slots" || action === "book")
  ) {
    action = "continue";
  }

  if ((action === "book" || action === "propose_slots") && !settings.bookAppointment) {
    action = settings.askForAppointment || settings.handoffToHuman ? "handoff" : "continue";
  }

  const chosenSlot =
    (action === "book" && decision.slotIndex
      ? conversation.proposedSlots?.[decision.slotIndex - 1] ||
        safeSlots?.[decision.slotIndex - 1]
      : null) ||
    matchProposedSlot(text, conversation.proposedSlots, { confirmYes: true }) ||
    matchProposedSlot(text, conversation.bookingState?.lastOfferedSlots, {
      confirmYes: true,
    }) ||
    matchProposedSlot(text, safeSlots);

  if (action === "stop") {
    return sealAiResult(
      withMessages(conversation, qualification, "Pas intéressé", text, decision.reply || "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous."),
      bookingState,
    );
  }

  if (action === "handoff") {
    const medical = threadHasMedical(conversation, text);
    const alreadyFlagged = conversation.status === "À recontacter" && !hasMedicalFlag(text);
    const handoffReply = medical
      ? alreadyFlagged
        ? "Je transmets cette préférence à l’équipe, elle reviendra vers vous après vérification."
        : "Il faut que l’équipe vérifie votre situation avant de confirmer. Je leur transmets pour voir si c’est adapté."
      : "Parfait, je transmets à l’équipe, elle vous recontacte rapidement.";
    return sealAiResult(
      withMessages(
        conversation,
        qualification,
        "À recontacter",
        text,
        decision.reply && !medical ? decision.reply : handoffReply,
      ),
      bookingState,
    );
  }

  if (
    action === "book" &&
    chosenSlot &&
    settings.bookAppointment &&
    !threadHasMedical(conversation, text) &&
    slotAllowed(chosenSlot, bookingState)
  ) {
    return sealAiResult(
      {
        ...withMessages(
          conversation,
          qualification,
          "RDV pris",
          text,
          `Je vérifie le planning et je vous confirme ${chosenSlot.label}.`,
        ),
        bookedSlot: chosenSlot,
        proposedSlots: conversation.proposedSlots || safeSlots || [],
      },
      { ...bookingState, appointmentStatus: "proposed" },
      chosenSlot,
    );
  }

  if (action === "propose_slots" && settings.bookAppointment && wantsSlots(text, conversation)) {
    if (!safeSlots.length) {
      return sealAiResult(
        withMessages(
          conversation,
          qualification,
          "Qualifié",
          text,
          guarded.fallback || emptySlotFallback(bookingState),
        ),
        { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" },
      );
    }
    return sealAiResult(
      {
        ...withMessages(conversation, qualification, "RDV proposé", text, humanSlotReply(safeSlots)),
        proposedSlots: safeSlots,
      },
      {
        ...bookingState,
        lastOfferedSlots: safeSlots,
        appointmentStatus: "proposed",
        pendingQuestion: null,
      },
    );
  }

  const fallbackReply =
    faqReply(text) ||
    (asksLocation(text) || asksAccess(text)
      ? centerPlaceReply(text, extras, seya)
      : asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)
        ? priceReply(seya, qualification, { ...conversation, bookingState }, text)
        : "Merci. Dites-moi le soin ou la zone, je m’occupe de la suite.");
  const reply =
    faqReply(text) || asksLocation(text) || asksAccess(text) || asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)
      ? fallbackReply
      : decision.reply || fallbackReply;

  return sealAiResult(
    withMessages(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      reply,
    ),
    bookingState,
  );
}

function withMessages(conversation, qualification, status, leadText, seyaText) {
  return {
    ...conversation,
    qualification,
    status,
    messages: [
      ...(conversation.messages || []),
      message("lead", leadText),
      message("seya", seyaText),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function sealAiResult(conversationOrResult, bookingState, shouldBook = null) {
  const conversation = conversationOrResult.messages
    ? conversationOrResult
    : conversationOrResult.conversation;
  const messages = [...(conversation.messages || [])];
  const last = messages[messages.length - 1];
  if (last?.author === "seya") {
    const safe = enforceOutgoingText(last.text, bookingState);
    if (safe !== last.text) {
      messages[messages.length - 1] = { ...last, text: safe };
      return {
        conversation: {
          ...conversation,
          messages,
          status: conversation.status === "RDV proposé" ? "Qualifié" : conversation.status,
          proposedSlots: [],
          bookingState: { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" },
        },
        shouldBook: null,
      };
    }
  }
  return {
    conversation: {
      ...conversation,
      messages,
      bookingState,
    },
    shouldBook: shouldBook && slotAllowed(shouldBook, bookingState) ? shouldBook : null,
  };
}

function sanitizeReply(value) {
  return String(value || "")
    .replace(/^["«\s]+|["»\s]+$/g, "")
    .replace(/offre\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function cleanField(value) {
  const text = String(value || "").trim();
  if (!text || /offre\s*\d+|lead meta|meta lead/i.test(text)) {
    return "";
  }
  return text.slice(0, 80);
}

module.exports = {
  applyAiDecision,
  generateSeyaReply,
  hasAiKey,
  pickSafeReply,
};
