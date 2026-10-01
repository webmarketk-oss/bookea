const OpenAI = require("openai");
const {
  agentSettings,
  formatCenterProfilePrompt,
  message,
  pickSlotsForMessage,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
} = require("./agent");
const {
  applyPlanningReply,
  formatPlanningHours,
  isPlanningProspectTone,
} = require("./planning-rules");

function seyaPlanningModel() {
  const requested = String(process.env.OPENAI_MODEL || "").trim();
  if (!requested || requested === "gpt-4o-mini") {
    return "gpt-4o";
  }
  return requested;
}

function hasAiKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

function lastSeyaText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function allBriefs(settings) {
  return (settings.treatmentBriefs || [])
    .map((item) => {
      const parts = [
        item?.name ? `Soin ${item.name}` : "",
        item?.title ? `titre ${item.title}` : "",
        item?.price ? `tarif ${item.price}` : "",
        item?.brief ? item.brief : "",
        item?.health?.contraindications
          ? `contre-indications ${item.health.contraindications}`
          : "",
        item?.health?.precautions ? `précautions ${item.health.precautions}` : "",
      ].filter(Boolean);
      return parts.join(" — ");
    })
    .filter(Boolean)
    .join("\n");
}

function planningPrompt({
  settings,
  seya,
  slots,
  hoursText,
  centerName,
  centerAddress,
  brief,
  price,
  draft,
}) {
  const allowedSlots = (slots || [])
    .map((slot) => slot.label)
    .filter(Boolean)
    .join(" · ");
  const centerCard = formatCenterProfilePrompt(settings.centerProfile);
  const briefs = allBriefs(settings);

  return [
    "Tu es Seya Planning, l’assistante interne du planning Bookea.",
    "Tu parles UNIQUEMENT à l’équipe du centre. Tu n’es pas Seya WhatsApp. Tu ne parles jamais comme à un prospect.",
    "Interdit : « c’est Seya », qualification zone/délai, « lequel vous irait », « je vous laisse revenir », « écrivez-moi quand », « vous recevrez la confirmation », ton réceptionniste WhatsApp.",
    "Tu suis STRICTEMENT toutes les consignes, briefs, tarifs, horaires et créneaux fournis. Tu n’inventes ni prix, ni horaire, ni adresse, ni règle santé.",
    "Réponds en 1 à 3 phrases, vouvoiement d’équipe, factuel. Donne le créneau, le tarif fiche ou la règle demandée.",
    `Centre : ${centerName || "le centre"}.`,
    settings.brief || seya.brief
      ? `Consignes générales du centre : ${settings.brief || seya.brief}`
      : "",
    briefs ? `Tous les briefs soins à respecter :\n${briefs}` : "",
    brief ? `Brief du soin demandé : ${brief}` : "",
    price ? `Tarif fiche du soin demandé : ${price}` : "Aucun tarif fiche pour ce soin.",
    centerCard ? `Fiche centre :\n${centerCard}` : "",
    centerAddress ? `Adresse : ${centerAddress}.` : "",
    hoursText ? `Horaires : ${hoursText}.` : "",
    allowedSlots
      ? `Seuls créneaux citables : ${allowedSlots}. Aucun autre.`
      : "Aucun créneau libre à proposer.",
    `Faits Bookea déjà établis (à reformuler en langage équipe, sans ton prospect) : ${String(draft || "").slice(0, 700)}`,
    "Réponds uniquement avec le texte à afficher à l’équipe, sans guillemets ni JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function polishPlanningText({
  conversation,
  text,
  seya,
  slots,
  hoursText,
  centerName,
  centerAddress,
  draft,
}) {
  const settings = agentSettings(seya);
  const careHint = `${text} ${conversation.qualification?.need || ""} ${conversation.treatment || ""}`;
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 6000,
  });
  const history = (conversation.messages || [])
    .filter((item, index, list) => !(index === list.length - 1 && item.author === "seya"))
    .slice(-8)
    .map((item) => ({
      role: item.author === "seya" ? "assistant" : "user",
      content: String(item.text || "").slice(0, 400),
    }));

  const response = await client.chat.completions.create({
    model: seyaPlanningModel(),
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: planningPrompt({
          settings,
          seya,
          slots,
          hoursText,
          centerName,
          centerAddress,
          brief: resolveTreatmentBrief(seya, careHint),
          price: resolveTreatmentPrice(seya, careHint, conversation),
          draft,
        }),
      },
      ...history,
      {
        role: "user",
        content: `Message de l’équipe : ${String(text || "").slice(0, 800)}`,
      },
    ],
  });

  return String(response.choices?.[0]?.message?.content || "")
    .replace(/^["«]|["»]$/g, "")
    .trim();
}

function withPlanningText(result, text) {
  const messages = [...(result.conversation.messages || [])];
  const last = messages.length - 1;
  if (last >= 0 && messages[last]?.author === "seya") {
    messages[last] = { ...messages[last], text };
  } else {
    messages.push(message("seya", text));
  }
  return {
    ...result,
    conversation: { ...result.conversation, messages },
  };
}

async function generatePlanningReply({
  conversation,
  text,
  seya,
  slots,
  appointments,
  hours,
  centerName,
  centerAddress,
}) {
  const resolvedSlots = Array.isArray(appointments)
    ? pickSlotsForMessage(appointments, hours, conversation, text)
    : [];
  const usableSlots = resolvedSlots.length ? resolvedSlots : slots || [];
  const settings = agentSettings(seya);
  const fallback = applyPlanningReply(conversation, text, settings, usableSlots, {
    hours,
    centerName,
  });
  const draft = lastSeyaText(fallback.conversation);

  if (!hasAiKey() || fallback.shouldBook) {
    return { ...fallback, via: fallback.shouldBook ? "book" : "rules" };
  }

  try {
    const polished = await polishPlanningText({
      conversation: fallback.conversation,
      text,
      seya,
      slots: usableSlots,
      hoursText: formatPlanningHours(hours || []),
      centerName,
      centerAddress,
      draft,
    });
    if (!polished || isPlanningProspectTone(polished)) {
      return { ...fallback, via: "rules" };
    }
    return { ...withPlanningText(fallback, polished), via: "ai" };
  } catch (error) {
    console.error("[seya/planning-ai]", error);
    return { ...fallback, via: "rules" };
  }
}

module.exports = {
  generatePlanningReply,
  hasAiKey,
  isPlanningProspectTone,
  planningPrompt,
};
