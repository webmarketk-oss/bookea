const OpenAI = require("openai");
const {
  agentSettings,
  applyLeadReply,
  asksLocation,
  asksPrice,
  hasMedicalFlag,
  humanSlotReply,
  isJunkTreatment,
  isOptOut,
  locationReply,
  pickSlotsForMessage,
  matchProposedSlot,
  mergeQualification,
  message,
  priceReply,
  resolveOfferLabel,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
  threadHasMedical,
} = require("./agent");

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
}) {
  const resolvedSlots = Array.isArray(appointments)
    ? pickSlotsForMessage(appointments, hours, conversation, text)
    : slots || [];
  const extras = { centerName, centerAddress };
  const fallback = applyLeadReply(conversation, text, seya, resolvedSlots, extras);
  if (!hasAiKey()) {
    return { ...fallback, via: "rules" };
  }

  try {
    const decision = await askSeyaModel({
      conversation,
      text,
      seya,
      slots: resolvedSlots,
      centerName,
      centerAddress,
    });
    return {
      ...applyAiDecision(conversation, text, seya, resolvedSlots, decision, extras),
      via: "ai",
    };
  } catch (error) {
    console.error("[seya/ai]", error);
    return { ...fallback, via: "rules" };
  }
}

async function askSeyaModel({ conversation, text, seya, slots, centerName, centerAddress }) {
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
    "Modèle : « Bonjour Alix, c’est Seya du centre :) On vient de recevoir votre demande. Vous êtes plutôt dispo en début ou fin de semaine ? Je ne veux pas vous relancer inutilement. »",
    "Si le créneau voulu n’existe pas : dis-le simplement et propose 2 alternatives réelles.",
    "Réponds UNIQUEMENT en JSON :",
    '{"reply":"texte WhatsApp 1 à 3 phrases","need":"","zone":"","delay":"","availability":"","action":"continue|propose_slots|book|handoff|stop","slotIndex":null}',
    "Règles :",
    "- Une seule question à la fois. Réponds d’abord à ce qu’ils viennent d’écrire.",
    "- Pacemaker, grossesse, doute médical : action=handoff. Ne booke pas. L’équipe vérifie.",
    "- S’ils donnent encore un horaire après un doute médical : handoff, « je transmets à l’équipe ».",
    "- Prix : tu n’en parles JAMAIS si elle n’en parle pas. Pas de 500€, pas de 10 fois, pas de « c’est offert », tant qu’elle n’a pas dit prix / tarif / combien.",
    "- Prix / combien : action=continue. Dis exactement : « Le bilan permet de faire une analyse corporelle pour vous établir un devis personnalisé. Je peux vous proposer un créneau pour ce bilan — quand seriez-vous disponible ? » Pas de créneaux chiffrés dans cette réponse.",
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
    (asksPrice(text) || asksLocation(text)) &&
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
        slots?.[decision.slotIndex - 1]
      : null) ||
    matchProposedSlot(text, conversation.proposedSlots) ||
    matchProposedSlot(text, slots);

  if (action === "stop") {
    return {
      conversation: withMessages(conversation, qualification, "Pas intéressé", text, decision.reply || "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous."),
      shouldBook: null,
    };
  }

  if (action === "handoff") {
    const medical = threadHasMedical(conversation, text);
    const alreadyFlagged = conversation.status === "À recontacter" && !hasMedicalFlag(text);
    const handoffReply = medical
      ? alreadyFlagged
        ? "Je transmets cette préférence à l’équipe, elle reviendra vers vous après vérification."
        : "Il faut que l’équipe vérifie votre situation avant de confirmer. Je leur transmets pour voir si c’est adapté."
      : "Parfait, je transmets à l’équipe, elle vous recontacte rapidement.";
    return {
      conversation: withMessages(
        conversation,
        qualification,
        "À recontacter",
        text,
        decision.reply && !medical ? decision.reply : handoffReply,
      ),
      shouldBook: null,
    };
  }

  if (action === "book" && chosenSlot && settings.bookAppointment && !threadHasMedical(conversation, text)) {
    return {
      conversation: {
        ...withMessages(
          conversation,
          qualification,
          "RDV pris",
          text,
          decision.reply ||
            `Parfait, je bloque ${chosenSlot.label}. Vous recevrez la confirmation du centre.`,
        ),
        bookedSlot: chosenSlot,
        proposedSlots: conversation.proposedSlots || slots || [],
      },
      shouldBook: chosenSlot,
    };
  }

  if (action === "propose_slots" && settings.bookAppointment && slots?.length) {
    const reply = humanSlotReply(slots);
    return {
      conversation: {
        ...withMessages(conversation, qualification, "RDV proposé", text, reply),
        proposedSlots: slots,
      },
      shouldBook: null,
    };
  }

  const fallbackReply = asksLocation(text)
    ? locationReply(extras.centerAddress, extras.centerName)
    : asksPrice(text)
      ? priceReply(seya, qualification, conversation)
      : "Merci. Dites-moi le soin ou la zone, je m’occupe de la suite.";
  const reply =
    asksLocation(text) || asksPrice(text)
      ? fallbackReply
      : decision.reply || fallbackReply;

  return {
    conversation: withMessages(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      reply,
    ),
    shouldBook: null,
  };
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
  generateSeyaReply,
  hasAiKey,
};
