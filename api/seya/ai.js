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
  locationReply,
  pickSlotsForState,
  matchProposedSlot,
  mergeQualification,
  message,
  priceReply,
  resolveOfferLabel,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
  threadHasMedical,
} = require("./agent");
const {
  enforceOutgoingText,
  shouldSearchSlots,
  slotAllowed,
} = require("./booking-state");
const { classifyHealthMessage, isAwaitingHealthReview } = require("./health");
const { classifyPriceQuestion, isPriceRepeatComplaint } = require("./price");
const { isHesitation, isIdentityQuestion, isThanks, refusesSlots, wantsSlots } = require("./conversation");

const ALLOWED_ACTIONS = new Set([
  "continue",
  "propose_slots",
  "book",
  "handoff",
  "stop",
]);

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
  const bookingState = applyBookingMessage(conversation.bookingState, text, {
    centerId: centerId || conversation.centerId,
    now,
  });
  const conversationWithState = {
    ...conversation,
    centerId: centerId || conversation.centerId || bookingState.centerId,
    bookingState,
  };
  const allowRepeat = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
    String(text || ""),
  );
  const health = classifyHealthMessage(text);
  const rawSlots =
    shouldSearchSlots(bookingState, text) &&
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
  };
  const fallback = applyLeadReply(conversationWithState, text, seya, resolvedSlots, extras);
  const priceIntent = classifyPriceQuestion(text);
  if (
    !hasAiKey() ||
    health.personal ||
    health.general ||
    isAwaitingHealthReview(conversation) ||
    priceIntent ||
    isPriceRepeatComplaint(text) ||
    isIdentityQuestion(text) ||
    isThanks(text) ||
    isHesitation(text) ||
    refusesSlots(text)
  ) {
    return { ...fallback, via: "rules" };
  }

  try {
    const decision = await askSeyaModel({
      conversation: conversationWithState,
      text,
      seya,
      slots: resolvedSlots,
      centerName,
      centerAddress,
      bookingState,
    });
    return {
      ...applyAiDecision(conversationWithState, text, seya, resolvedSlots, decision, extras),
      via: "ai",
    };
  } catch (error) {
    console.error("[seya/ai]", error);
    return { ...fallback, via: "rules" };
  }
}

async function askSeyaModel({ conversation, text, seya, slots, centerName, centerAddress, bookingState }) {
  const settings = agentSettings(seya);
  const careHint = `${conversation.qualification?.need || ""} ${conversation.qualification?.zone || ""} ${conversation.treatment || ""}`;
  const offer = resolveOfferLabel(
    seya,
    conversation.campaign,
    conversation.qualification?.need || conversation.treatment,
  );
  const brief = resolveTreatmentBrief(seya, careHint);
  const price = resolveTreatmentPrice(seya, careHint);
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 8000,
  });
  const history = (conversation.messages || []).slice(-12).map((item) => ({
    role: item.author === "lead" ? "user" : "assistant",
    content: String(item.text || "").slice(0, 500),
  }));

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({
          conversation,
          settings,
          seya,
          slots,
          centerName,
          offer,
          brief,
          price,
          centerAddress,
          bookingState,
        }),
      },
      ...history,
      { role: "user", content: String(text || "").slice(0, 800) },
    ],
  });

  return parseDecision(response.choices?.[0]?.message?.content);
}

function buildSystemPrompt({
  conversation,
  settings,
  seya,
  slots,
  centerName,
  offer,
  brief,
  price,
  centerAddress,
  bookingState,
}) {
  const slotLines = (slots || [])
    .map((slot, index) => `${index + 1}) ${slot.label}`)
    .join("\n");

  return [
    "Tu es Seya, réceptionniste WhatsApp du centre. Tu parles comme un humain, jamais comme un formulaire.",
    "Tu vouvoies. Phrases courtes, naturelles. Un smiley max. Pas de liste 1) 2) 3).",
    `Centre : ${centerName || "le centre"}.`,
    `Prospect : ${conversation.firstName || "le prospect"}. Utilise le prénom si tu l’as.`,
    offer
      ? `Soin / offre à dire : ${offer}. Jamais « Lead Meta » ni le nom de campagne.`
      : "Jamais « Lead Meta » ni le nom de campagne. Déduis le soin des messages.",
    price
      ? `Tarif à dire UNIQUEMENT si elle demande le prix : ${price}`
      : "Aucun tarif paramétré. Si elle demande le prix : ne l’invente pas, propose le bilan ou un rappel.",
    conversation.treatment && !/lead meta|meta lead/i.test(conversation.treatment)
      ? `Soin CRM : ${conversation.treatment}.`
      : "Le CRM est flou (souvent un lead Meta). Ventre / poids = minceur.",
    settings.brief || seya.brief
      ? `Consignes du centre : ${settings.brief || seya.brief}`
      : "",
    brief ? `Consignes pour ce soin : ${brief}` : "",
    `Qualifier : ${settings.qualifyOnSignup ? "oui" : "non"}.`,
    `Demander un RDV : ${settings.askForAppointment ? "oui" : "non"}.`,
    `Poser le RDV : ${settings.bookAppointment ? "oui" : "non"}.`,
    `Passer à l’équipe : ${settings.handoffToHuman ? "oui" : "non"}.`,
    centerAddress
      ? `Adresse du centre : ${centerAddress}.`
      : "Adresse du centre inconnue : ne l’invente pas.",
    slotLines
      ? `Créneaux RÉELS pour SA demande (jour demandé uniquement) :\n${slotLines}\nDis-les en phrase. N’invente aucun autre jour.`
      : "Aucun créneau libre pour le jour demandé. Dis-le et demande un autre jour.",
    bookingState?.requestedDate
      ? `Date demandée (obligatoire) : ${bookingState.requestedDate}. Interdit de proposer un autre jour.`
      : "",
    bookingState?.requestedWeekday != null
      ? `Jour demandé : ${["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"][bookingState.requestedWeekday]}.`
      : "",
    bookingState?.rejectedDates?.length
      ? `Jours refusés : ${bookingState.rejectedDates.join(", ")}.`
      : "",
    "Tu n’imposes pas un tunnel bilan → créneaux. Tu réponds d’abord au message actuel.",
    "« Je ne veux pas vous relancer inutilement » uniquement dans une relance, jamais dans le premier échange.",
    "Si le créneau voulu n’existe pas : dis-le simplement et demande le jour suivant ou une autre journée. N’invente pas un lundi.",
    "Réponds UNIQUEMENT en JSON :",
    '{"reply":"texte WhatsApp 1 à 3 phrases","need":"","zone":"","delay":"","availability":"","action":"continue|propose_slots|book|handoff|stop","slotIndex":null}',
    "Règles :",
    "- Une seule question à la fois. Réponds d’abord à ce qu’ils viennent d’écrire.",
    "- Question générale sur les contre-indications : donne uniquement la fiche validée du soin demandé, jamais celle d’un autre soin.",
    "- Situation santé personnelle : ne dis jamais si le soin est possible ou impossible. Transmets à l’équipe. Ne demande pas plus de détails médicaux.",
    "- Pacemaker, grossesse, doute médical : action=handoff. Ne booke pas. L’équipe vérifie.",
    "- S’ils donnent encore un horaire après un doute médical : handoff, « je transmets à l’équipe ».",
    "- Prix : distingue bilan, séance découverte, séances suivantes et cure. « Continuer / ensuite / les séances » = séances après la découverte, pas le bilan.",
    "- Ne répète jamais mot pour mot ta dernière réponse. Si elle dit que tu répètes, reconnais l’erreur et réponds à la question restée sans réponse.",
    "- Prix : tu n’en parles JAMAIS si elle n’en parle pas.",
    "- « Combien de temps » n’est PAS une question prix. Réponds à la durée ou aux résultats.",
    "- « Le bilan est-il gratuit ? » ≠ « Combien les séances ensuite ? ». Réponds seulement à la partie demandée. Pas de créneau tant qu’elle n’en demande pas.",
    "- Si elle demande si tu es une IA : « Je suis SEYA, l’assistante virtuelle du centre. Je peux vous renseigner et organiser votre rendez-vous, et l’équipe peut reprendre la conversation si vous préférez. »",
    "- Ne termine pas chaque message par une question. Pas d’émoji à chaque tour.",
    "- Douleur : le bilan est indolore. Durée : 30 à 45 min. Résultats : expliqués au bilan.",
    "- « Lundi suivant » / « pas le 28, un autre lundi » : un autre lundi, jamais le même.",
    "- Où / adresse : action=continue, donne l’adresse. Pas de créneaux.",
    "- Si elle dit jeudi, propose UNIQUEMENT des jeudis. Jamais un lundi à la place.",
    "- Si elle refuse un jour (« pas lundi », « change de jour »), ne repropose jamais ces mêmes créneaux.",
    "- Si elle dit « arrête les créneaux, parle-moi des prix » : ce n’est pas un stop, réponds au tarif.",
    "- « Arrête de me parler des créneaux » n’est PAS un stop.",
    "- stop seulement si plus de contact (stop, pas intéressé, ne plus écrire).",
    "- Jamais inventer un prix, un résultat médical, un créneau.",
    "- book seulement s’ils choisissent un créneau réel (slotIndex 1, 2 ou 3).",
    "- propose_slots seulement s’ils parlent dispo / RDV, jamais pour éviter une question.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseDecision(raw) {
  const parsed = JSON.parse(String(raw || "{}"));
  const action = ALLOWED_ACTIONS.has(parsed.action) ? parsed.action : "continue";
  const slotIndex = Number(parsed.slotIndex);
  return {
    reply: sanitizeReply(parsed.reply),
    need: cleanField(parsed.need),
    zone: cleanField(parsed.zone),
    delay: cleanField(parsed.delay),
    availability: cleanField(parsed.availability),
    action,
    slotIndex: Number.isInteger(slotIndex) && slotIndex >= 1 && slotIndex <= 3
      ? slotIndex
      : null,
  };
}

function applyAiDecision(conversation, text, seya, slots, decision, extras = {}) {
  const settings = agentSettings(seya);
  const bookingState = extras.bookingState || applyBookingMessage(conversation.bookingState, text, {
    centerId: extras.centerId || conversation.centerId,
    now: extras.now,
  });
  const allowRepeat = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
    String(text || ""),
  );
  const guarded = extras.guarded || guardSlots(slots, bookingState, {
    centerId: extras.centerId || conversation.centerId,
    allowRepeat,
  });
  const safeSlots = shouldSearchSlots(bookingState, text) ? guarded.slots : [];
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
    (asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text) || asksLocation(text) || faqReply(text)) &&
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
    matchProposedSlot(text, conversation.proposedSlots) ||
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

  if (action === "propose_slots" && settings.bookAppointment && wantsSlots(text)) {
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
    (asksLocation(text)
      ? locationReply(extras.centerAddress, extras.centerName)
      : asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)
        ? priceReply(seya, qualification, { ...conversation, bookingState }, text)
        : "Merci. Dites-moi le soin ou la zone, je m’occupe de la suite.");
  const reply =
    faqReply(text) || asksLocation(text) || asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)
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
    .replace(/offre\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function stripSlotList(value) {
  return String(value || "")
    .replace(/(?:^|\n)\s*[123]\)[^\n]*/g, "")
    .trim();
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
};
