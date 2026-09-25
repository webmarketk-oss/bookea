const OpenAI = require("openai");
const {
  agentSettings,
  applyLeadReply,
  matchProposedSlot,
  mergeQualification,
  message,
  resolveOfferLabel,
  resolveTreatmentBrief,
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
}) {
  const fallback = applyLeadReply(conversation, text, seya, slots);
  if (!hasAiKey()) {
    return { ...fallback, via: "rules" };
  }

  try {
    const decision = await askSeyaModel({
      conversation,
      text,
      seya,
      slots,
      centerName,
    });
    return {
      ...applyAiDecision(conversation, text, seya, slots, decision),
      via: "ai",
    };
  } catch (error) {
    console.error("[seya/ai]", error);
    return { ...fallback, via: "rules" };
  }
}

async function askSeyaModel({ conversation, text, seya, slots, centerName }) {
  const settings = agentSettings(seya);
  const offer = resolveOfferLabel(
    seya,
    conversation.campaign,
    conversation.qualification?.need || conversation.treatment,
  );
  const brief = resolveTreatmentBrief(
    seya,
    conversation.qualification?.need || conversation.treatment,
  );
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
}) {
  const slotLines = (slots || [])
    .map((slot, index) => `${index + 1}) ${slot.label}`)
    .join("\n");

  return [
    "Tu es Seya, assistante WhatsApp d’un centre esthétique français.",
    "Tu vouvoies. Tu es chaleureuse, claire, jamais vendeuse agressive.",
    `Centre : ${centerName || "le centre"}.`,
    `Prospect : ${conversation.firstName || "le prospect"}.`,
    offer
      ? `Offre à dire : ${offer}. Ne dis jamais le code campagne ni « offre 99 ».`
      : "N’invente aucune offre, aucun prix, aucune promo.",
    conversation.treatment
      ? `Soin indiqué dans le CRM : ${conversation.treatment}.`
      : "Le soin n’est pas encore clair.",
    settings.brief || seya.brief
      ? `Consignes du centre : ${settings.brief || seya.brief}`
      : "",
    brief ? `Consignes pour ce soin : ${brief}` : "",
    `Qualifier le besoin : ${settings.qualifyOnSignup ? "oui" : "non"}.`,
    `Demander s’ils veulent un RDV : ${settings.askForAppointment ? "oui" : "non"}.`,
    `Poser le RDV dans l’agenda : ${settings.bookAppointment ? "oui" : "non"}.`,
    `Passer à une conseillère : ${settings.handoffToHuman ? "oui" : "non"}.`,
    slotLines
      ? `Créneaux RÉELS, seuls autorisés :\n${slotLines}`
      : "Aucun créneau libre à proposer.",
    "Réponds UNIQUEMENT en JSON :",
    '{"reply":"texte WhatsApp 1 à 4 phrases","need":"","zone":"","delay":"","availability":"","action":"continue|propose_slots|book|handoff|stop","slotIndex":null}',
    "Règles :",
    "- Une seule question à la fois.",
    "- Jamais inventer un prix, un résultat médical, un créneau ou un délai.",
    "- Si poserRDV est non : action jamais book ni propose_slots. Si le prospect veut un RDV → handoff.",
    "- book seulement si le prospect choisit un créneau de la liste (slotIndex 1, 2 ou 3).",
    "- stop si le prospect dit stop, pas intéressé, arrête.",
    "- propose_slots seulement si poserRDV est oui et qu’il y a des créneaux.",
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

function applyAiDecision(conversation, text, seya, slots, decision) {
  const settings = agentSettings(seya);
  const qualification = {
    ...mergeQualification(conversation.qualification, text, conversation.treatment),
    ...(decision.need ? { need: decision.need } : {}),
    ...(decision.zone ? { zone: decision.zone } : {}),
    ...(decision.delay ? { delay: decision.delay } : {}),
    ...(decision.availability ? { availability: decision.availability } : {}),
  };
  const refuses = /pas int[eé]ress|non merci|stop|ne plus|arr[eê]te/i.test(text);
  let action = refuses ? "stop" : decision.action;

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
    return {
      conversation: withMessages(
        conversation,
        qualification,
        "À recontacter",
        text,
        decision.reply ||
          "Parfait. Je transmets à une conseillère du centre, elle vous recontacte rapidement.",
      ),
      shouldBook: null,
    };
  }

  if (action === "book" && chosenSlot && settings.bookAppointment) {
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
    const list = slots.map((slot, index) => `${index + 1}) ${slot.label}`).join("\n");
    const reply = `${stripSlotList(decision.reply || "Voici les prochains créneaux libres.")}\n${list}\nRépondez 1, 2 ou 3, ou dites-moi un autre jour.`;
    return {
      conversation: {
        ...withMessages(conversation, qualification, "RDV proposé", text, reply),
        proposedSlots: slots,
      },
      shouldBook: null,
    };
  }

  return {
    conversation: withMessages(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      decision.reply || "Merci. Dites-moi le soin ou la zone, je m’occupe de la suite.",
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
  if (!text || /offre\s*\d+/i.test(text)) {
    return "";
  }
  return text.slice(0, 80);
}

module.exports = {
  generateSeyaReply,
  hasAiKey,
};
