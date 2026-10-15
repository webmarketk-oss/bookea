/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { generateSeyaReply, hasAiKey } = require("./ai");
const { inferCareFamily, pickApprovedTemplate, resolveActiveFamily } = require("./care-family");
const { pickBookingResources } = require("./axis-resources");
const { notifyCenterSeyaAction, sendCallbackHandoff } = require("./center-notify");
const { withoutTeamQuestion } = require("./center-knowledge");
const { prospectText } = require("./vocabulary");
const { isNearDuplicate } = require("./price");
const {
  BILAN_DURATION_MINUTES,
  visitDurationMinutes,
  confirmedAppointmentReply,
  humanSlotReply,
  isSlotBusy,
  message,
  persistableConversations,
  pickSlotsForState,
  remainingOfferedSlots,
  readHours,
  startConversation,
  pickSlotsForMessage,
} = require("./agent");
const { dbStatusWhenSlotPositioned } = require("./booking-state");
const { isSameSeyaConversation } = require("./conversation-key");
const {
  resolveCenterFromPhone,
  rehomePhoneThread,
} = require("./center-route");
const { findOwnSeyaAppointment, slotDate, slotTime } = require("./own-appointment");
const { appointmentSlot } = require("../appointments/token-utils");
const {
  alreadyBookedReply,
  crmStatusFromLeadMessage,
  isAlreadyBookedElsewhere,
} = require("./conversation");
const { canSeyaSetCrmStatus } = require("./crm-sync");
const { withCrmStatus } = require("./booking-close");
const {
  isNewSeyaConversationBlocked,
  isSeyaOff,
  readCenterSeya,
  writeSeyaConversations,
} = require("./store");
const { activeLeadPause, stripBookingPush } = require("./lead-pause");

const GRAPH_VERSION = "v21.0";
const inboundLocks = new Map();
const EMPTY_SEYA_REPLY =
  "Je suis là. Dites-moi ce dont vous avez besoin, je vous réponds.";
const CALLBACK_NOTED_REPLY = "Votre demande de rappel est bien notée 😊";
const UNREADABLE_MEDIA_REPLY =
  "Je n’arrive pas à lire ce message. Pouvez-vous m’écrire en texte ce dont vous avez besoin ?";

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const mode = firstQueryValue(req.query["hub.mode"]);
    const token = firstQueryValue(req.query["hub.verify_token"]);
    const challenge = firstQueryValue(req.query["hub.challenge"]);
    const accepted = new Set(
      [process.env.WHATSAPP_VERIFY_TOKEN, process.env.META_VERIFY_TOKEN].filter(
        Boolean,
      ),
    );

    if (mode === "subscribe" && challenge && accepted.has(token)) {
      return res.status(200).send(challenge);
    }

    if (firstQueryValue(req.query.templates)) {
      const listed = await listTemplates().catch(() => ({ templates: [], error: true }));
      return res.status(200).json({
        ok: !listed.error,
        templates: listed.templates.map((item) => ({
          name: item.name,
          status: String(item.status || "").toUpperCase(),
          language: item.language || "",
          variables: templateVarCount(item),
          body:
            (item.components || []).find(
              (part) => String(part.type || "").toUpperCase() === "BODY",
            )?.text || "",
        })),
      });
    }

    let graph = null;
    try {
      graph = await diagnoseGraph();
    } catch {
      graph = { reachable: false, error: "probe_failed", diagnosis: "probe_failed" };
    }
    return res.status(200).json({
      ok: true,
      sharedNumber: true,
      number: displayNumber(),
      connected: Boolean(
        process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
      ),
      webhook: "/api/seya/whatsapp",
      graph,
      ai: hasAiKey(),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = parseBody(req.body);
    if (payload.action === "send" || payload.type === "outbound") {
      const result = await sendSharedWhatsApp(payload.phone, payload.text, {
        firstName: payload.firstName,
        centerName: payload.centerName,
        treatment: payload.treatment,
        campaign: payload.campaign,
        offerLabel: payload.offerLabel,
        family: payload.family,
        templateName: payload.templateName,
        preferTemplate: Boolean(payload.preferTemplate),
      });
      return res.status(result.sent ? 200 : 409).json(result);
    }

    const incoming = coalesceIncoming(extractIncomingMessages(payload));
    if (incoming.length === 0) {
      return res.status(200).json({ received: true, handled: 0 });
    }

    const supabase = createServiceClient();
    const results = [];

    for (const message of incoming) {
      results.push(await handleIncomingQueued(supabase, message));
    }

    return res.status(200).json({ received: true, handled: results.length, results });
  } catch (error) {
    console.error("[seya/whatsapp]", error);
    return res.status(500).json({ error: "Unable to handle WhatsApp message" });
  }
};

function parseBody(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function displayNumber() {
  return (
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    process.env.WHATSAPP_DISPLAY_NUMBER ||
    "0629926249"
  ).trim();
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readCenterAddress(center) {
  const settings = center?.settings && typeof center.settings === "object" ? center.settings : {};
  const publicSettings = settings.public && typeof settings.public === "object" ? settings.public : {};
  const fromJson = publicSettings.center && typeof publicSettings.center === "object"
    ? publicSettings.center
    : settings.center && typeof settings.center === "object"
      ? settings.center
      : {};
  return [
    center.address_line1 || fromJson.address || fromJson.address_line1,
    center.postal_code || fromJson.postalCode,
    center.city || fromJson.city,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
}

function last9Phone(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function toWhatsAppIntl(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("66") && digits.length >= 10) {
    return digits;
  }
  if (digits.startsWith("33") && digits.length >= 11) {
    return digits;
  }
  if (/^0[67]\d{8}$/.test(digits)) {
    return `33${digits.slice(1)}`;
  }
  if (digits.length >= 11) {
    return digits;
  }
  const last9 = digits.slice(-9);
  return last9.length === 9 ? `33${last9}` : digits;
}

function alreadyHandledInbound(conversation, incoming) {
  const ids = conversation?.lastInboundIds || [];
  const knownId = Boolean(incoming.messageId && ids.includes(incoming.messageId));
  if (conversation?.sendError) {
    return false;
  }
  if (knownId) {
    return true;
  }
  const messages = conversation?.messages || [];
  const lastLeadIndex = [...messages]
    .map((item, index) => ({ item, index }))
    .reverse()
    .find(
      ({ item }) =>
        item.author === "lead" &&
        String(item.text || "").trim() === String(incoming.text || "").trim(),
    )?.index;
  if (lastLeadIndex == null) {
    return false;
  }
  const at = Date.parse(messages[lastLeadIndex].at || "");
  if (!Number.isFinite(at) || Date.now() - at >= 120000) {
    return false;
  }
  return messages
    .slice(lastLeadIndex + 1)
    .some((item) => item.author === "seya" && String(item.text || "").trim());
}

function outgoingWhatsAppTexts(followUps, draftedReply, previousSeya, inboundText) {
  const outgoing = followUps.length ? [...followUps] : draftedReply ? [draftedReply] : [];
  const inboundNeedsAnswer = Boolean(String(inboundText || "").trim());
  return outgoing.filter((text, index) => {
    if (!text) {
      return false;
    }
    if (/rendez-vous est confirmé/i.test(text)) {
      return outgoing.findIndex((item) => item === text) === index;
    }
    const sameAsPrevious = String(text).trim() === String(previousSeya || "").trim();
    if (sameAsPrevious && !inboundNeedsAnswer) {
      return false;
    }
    return outgoing.findIndex((item) => isNearDuplicate(item, text)) === index;
  });
}

function leadMessageCount(conversation) {
  return (conversation?.messages || []).filter((item) => item.author === "lead").length;
}

function holdOutgoingAfterPause(fresh, answered, texts) {
  if (!fresh || leadMessageCount(fresh) <= leadMessageCount(answered)) {
    return texts;
  }
  const pause = activeLeadPause(fresh);
  return pause ? texts.map(stripBookingPush).filter(Boolean) : texts;
}

async function readFreshConversation(supabase, centerId, conversation) {
  const { seya } = await readCenterSeya(supabase, centerId);
  return (Array.isArray(seya?.conversations) ? seya.conversations : []).find((item) =>
    isSameSeyaConversation(item, conversation),
  );
}

function markDelivery(messages, sendResults) {
  const list = [...(messages || [])];
  let cursor = list.length - 1;
  for (let index = sendResults.length - 1; index >= 0; index -= 1) {
    while (cursor >= 0 && list[cursor]?.author !== "seya") {
      cursor -= 1;
    }
    if (cursor < 0) {
      break;
    }
    const result = sendResults[index];
    list[cursor] = {
      ...list[cursor],
      delivery: result?.sent ? "sent" : "failed",
      waId: result?.id || null,
    };
    cursor -= 1;
  }
  return list;
}

function replaceDraftWithSent(conversation, sentTexts) {
  const outgoing = (sentTexts || []).filter(Boolean);
  if (!outgoing.length) {
    return conversation;
  }
  const messages = [...(conversation?.messages || [])];
  const lastSeyaIndex = [...messages].map((item) => item.author).lastIndexOf("seya");
  if (lastSeyaIndex >= 0) {
    messages.splice(lastSeyaIndex, 1);
  }
  return {
    ...conversation,
    messages: [
      ...messages,
      ...outgoing.map((text) => message("seya", text)),
    ],
  };
}

function inboundTextFromWhatsApp(message) {
  const text = String(message?.text?.body || "").trim();
  if (text) {
    return { text, kind: "text" };
  }
  const button = String(
    message?.button?.text ||
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      "",
  ).trim();
  if (button) {
    return { text: button, kind: "button" };
  }
  const caption = String(
    message?.image?.caption ||
      message?.video?.caption ||
      message?.document?.caption ||
      "",
  ).trim();
  if (caption) {
    return { text: caption, kind: "caption" };
  }
  if (message?.image) {
    return { text: "[photo]", kind: "image" };
  }
  if (message?.audio || message?.voice) {
    return { text: "[message vocal]", kind: "audio" };
  }
  if (message?.video) {
    return { text: "[vidéo]", kind: "video" };
  }
  if (message?.document) {
    return { text: "[document]", kind: "document" };
  }
  if (message?.sticker) {
    return { text: "[sticker]", kind: "sticker" };
  }
  if (message?.location) {
    return { text: "[localisation]", kind: "location" };
  }
  return { text: "", kind: "" };
}

function extractIncomingMessages(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.flatMap((entry) =>
    (Array.isArray(entry.changes) ? entry.changes : []).flatMap((change) =>
      (Array.isArray(change?.value?.messages) ? change.value.messages : [])
        .map((item) => {
          const parsed = inboundTextFromWhatsApp(item);
          if (!item?.from || !parsed.text) {
            return null;
          }
          return {
            phone: item.from,
            text: parsed.text,
            kind: parsed.kind,
            messageId: item.id,
          };
        })
        .filter(Boolean),
    ),
  );
}

function coalesceIncoming(messages) {
  const groups = new Map();
  for (const item of messages || []) {
    const key = last9Phone(item.phone) || String(item.phone || "");
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => {
    const last = group[group.length - 1];
    const texts = group.map((item) => String(item.text || "").trim()).filter(Boolean);
    return {
      ...last,
      text: texts.join("\n"),
      kind: group.every((item) => item.kind === last.kind) ? last.kind : "text",
      messageIds: group.map((item) => item.messageId).filter(Boolean),
    };
  });
}

function isUnreadableMedia(kind) {
  return Boolean(kind) && !["text", "button", "caption"].includes(kind);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSend(result) {
  if (!result || result.sent) {
    return false;
  }
  const reason = String(result.reason || "");
  if (reason === "not_connected" || reason === "template_required") {
    return false;
  }
  const code = Number(result.code);
  if (code === 190 || code === 131026 || code === 131030) {
    return false;
  }
  return true;
}

async function sendWithRetry(phone, text, extras, attempts = 3) {
  let last = { sent: false, reason: "send_failed" };
  for (let round = 0; round < attempts; round += 1) {
    try {
      last = await sendSharedWhatsApp(phone, text, extras);
    } catch (error) {
      last = {
        sent: false,
        reason: "send_failed",
        error: error instanceof Error ? error.message : "send_failed",
      };
    }
    if (last?.sent) {
      return last;
    }
    if (!isRetryableSend(last) || round === attempts - 1) {
      return last;
    }
    await wait(400 * (round + 1));
  }
  return last;
}

function deliveryAlert(stage, detail) {
  const reason = String(detail || "").trim();
  if (stage === "generate") {
    return reason
      ? `Seya n’a pas pu répondre (${reason}). Reprenez la conversation.`
      : "Seya n’a pas pu répondre. Reprenez la conversation.";
  }
  return reason
    ? `Seya n’a pas pu envoyer sa réponse WhatsApp : ${reason}. Reprenez la conversation.`
    : "Seya n’a pas pu envoyer sa réponse WhatsApp. Reprenez la conversation.";
}

async function handleIncomingQueued(supabase, incoming) {
  const key = last9Phone(incoming.phone) || String(incoming.phone || "");
  const run = (inboundLocks.get(key) || Promise.resolve()).then(
    () => processInbound(supabase, incoming),
    () => processInbound(supabase, incoming),
  );
  inboundLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function inboundLogFields(incoming) {
  const digits = String(incoming?.phone || "").replace(/\D/g, "");
  return {
    phone: digits ? `…${digits.slice(-4)}` : "",
    messageIds: incoming?.messageIds?.length
      ? incoming.messageIds
      : [incoming?.messageId].filter(Boolean),
  };
}

function logInbound(incoming, result) {
  const outcome = result?.sent
    ? "replied"
    : result?.skipped || result?.error || "no_reply";
  console.info(
    "[seya/inbound]",
    JSON.stringify({
      ...inboundLogFields(incoming),
      centerId: result?.centerId || null,
      route: result?.route || null,
      outcome,
      status: result?.status || null,
      stage: result?.stage || null,
      error: result?.errorDetail || null,
    }),
  );
}

async function processInbound(supabase, incoming, deps = {}) {
  const handle = deps.handleIncoming || handleIncoming;
  const attempts = deps.attempts ?? 2;
  const trace = { stage: "start", centerId: null, sentTexts: [] };
  let lastError = null;
  for (let round = 0; round < attempts; round += 1) {
    try {
      const result = await handle(supabase, incoming, trace);
      logInbound(incoming, result);
      return result;
    } catch (error) {
      lastError = error;
      console.error(
        "[seya/inbound] failed",
        JSON.stringify({
          ...inboundLogFields(incoming),
          stage: trace.stage,
          round,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (trace.sentTexts.length || round === attempts - 1) {
        break;
      }
      await wait(deps.retryDelayMs ?? 800);
    }
  }
  const recorded = await recordFailedInbound(supabase, incoming, trace, lastError).catch(
    (recordError) => {
      console.error("[seya/inbound] record failed", recordError);
      return null;
    },
  );
  const result = {
    phone: incoming.phone,
    routed: Boolean(recorded),
    centerId: recorded?.centerId || trace.centerId,
    error: "inbound_failed",
    stage: trace.stage,
    errorDetail: lastError instanceof Error ? lastError.message : String(lastError || ""),
    sent: trace.sentTexts.length > 0,
  };
  logInbound(incoming, result);
  return result;
}

async function contextFromSeyaThread(supabase, phone) {
  const key = last9Phone(phone);
  if (key.length < 9) {
    return null;
  }
  const { data, error } = await supabase.from("centers").select("id,settings");
  if (error) {
    throw new Error(error.message);
  }
  let best = null;
  for (const center of data || []) {
    const list = asRecord(asRecord(center.settings).seya).conversations;
    for (const item of Array.isArray(list) ? list : []) {
      if (last9Phone(item?.phone) !== key) {
        continue;
      }
      const at = String(
        item.updatedAt || [...(item.messages || [])].reverse()[0]?.at || "",
      );
      if (!best || at > best.at) {
        best = { at, centerId: center.id, conversation: item };
      }
    }
  }
  if (!best) {
    return null;
  }
  const thread = best.conversation;
  return {
    centerId: best.centerId,
    clientId: null,
    leadId: thread.leadId || null,
    firstName: thread.firstName || "bonjour",
    lastName: thread.lastName || "",
    phone: thread.phone || phone,
    treatment: thread.treatment || "",
    campaign: thread.campaign || "",
    status: "Nouveau",
    recall_date: "",
  };
}

async function resolveInboundContext(supabase, phone) {
  try {
    const context = await resolveCenterFromPhone(supabase, phone);
    if (context) {
      return { context, route: "crm" };
    }
  } catch (error) {
    console.error("[seya/inbound] crm route failed", error);
  }
  const fromThread = await contextFromSeyaThread(supabase, phone);
  return fromThread
    ? { context: fromThread, route: "thread" }
    : { context: null, route: "none" };
}

async function recordFailedInbound(supabase, incoming, trace, error) {
  const centerId =
    trace.centerId || (await contextFromSeyaThread(supabase, incoming.phone))?.centerId;
  if (!centerId) {
    return null;
  }
  const { seya } = await readCenterSeya(supabase, centerId);
  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  const key = last9Phone(incoming.phone);
  const thread = conversations.find((item) => last9Phone(item.phone) === key);
  if (!thread) {
    return null;
  }
  const ids = [incoming.messageId, ...(incoming.messageIds || [])].filter(Boolean);
  const messages = [...(thread.messages || [])];
  const known = ids.some((id) => (thread.lastInboundIds || []).includes(id));
  if (!known) {
    messages.push(message("lead", incoming.text));
  }
  for (const text of trace.sentTexts) {
    messages.push({ ...message("seya", text), delivery: "sent" });
  }
  const detail = error instanceof Error ? error.message : "erreur technique";
  const next = {
    ...thread,
    messages,
    lastInboundIds: [...new Set([...(thread.lastInboundIds || []), ...ids])].slice(-40),
    sendError: trace.sentTexts.length ? null : deliveryAlert("generate", detail),
    updatedAt: new Date().toISOString(),
  };
  await writeSeyaConversations(supabase, centerId, [
    next,
    ...conversations.filter((item) => !isSameSeyaConversation(item, next)),
  ]);
  return { centerId };
}

async function generateSeyaReplyWithRetry(args) {
  try {
    return await generateSeyaReply(args);
  } catch (error) {
    console.error("[seya/whatsapp] generate retry", error);
    return generateSeyaReply(args);
  }
}

async function handleIncoming(
  supabase,
  incoming,
  trace = { stage: "start", centerId: null, sentTexts: [] },
) {
  trace.stage = "route";
  const { context, route } = await resolveInboundContext(supabase, incoming.phone);
  if (!context) {
    return {
      phone: incoming.phone,
      routed: false,
      route,
      skipped: "unknown_contact",
    };
  }
  trace.centerId = context.centerId;
  await rehomePhoneThread(supabase, incoming.phone, context.centerId).catch(
    (error) => {
      console.error("[seya/whatsapp] rehome", error);
    },
  );

  trace.stage = "load_center";
  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,email,settings,address_line1,city,postal_code")
    .eq("id", context.centerId)
    .maybeSingle();

  if (error || !center) {
    throw new Error(error?.message || "Center not found");
  }

  const publicSettings = asRecord(asRecord(center.settings).public);
  const seya = {
    ...asRecord(asRecord(center.settings).seya),
    catalogServices: Array.isArray(publicSettings.services)
      ? publicSettings.services
      : [],
    centerName: center.name,
  };
  if (isSeyaOff(seya)) {
    return {
      phone: incoming.phone,
      routed: true,
      centerId: center.id,
      skipped: "agent_disabled",
    };
  }

  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  const phoneKey = last9Phone(incoming.phone);
  let existing =
    conversations.find((item) => item.leadId === context.leadId) ||
    conversations.find((item) => last9Phone(item.phone) === phoneKey);
  if (!existing) {
    if (isNewSeyaConversationBlocked(center.settings, conversations)) {
      return {
        phone: incoming.phone,
        routed: true,
        centerId: center.id,
        skipped: "conversation_cap",
      };
    }
    existing = startConversation(
      { ...context, centerId: center.id },
      center.name,
      seya,
    );
  }
  existing.centerId = center.id;
  if (context.crmLoaded) {
    existing = withCrmStatus(existing, context.status, context.recall_date);
  }
  const inboundIds = [
    ...(existing.lastInboundIds || []),
    incoming.messageId,
    ...((incoming.messageIds || [])),
  ]
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(-40);

  const knownInboundId = Boolean(
    incoming.messageId && (existing.lastInboundIds || []).includes(incoming.messageId),
  );
  if (alreadyHandledInbound(existing, incoming) && !existing.sendError) {
    return {
      phone: incoming.phone,
      routed: true,
      centerId: center.id,
      skipped: "duplicate",
    };
  }

  const sendExtras = {
    firstName: context.firstName,
    centerName: center.name,
    treatment: existing.qualification?.need || context.treatment || "",
  };

  const lastMessage = [...(existing.messages || [])].reverse()[0];
  let recordedLead = null;
  if (
    existing.sendError &&
    knownInboundId &&
    lastMessage?.author === "lead" &&
    String(lastMessage.text || "").trim() === String(incoming.text || "").trim()
  ) {
    recordedLead = lastMessage;
    existing.messages = (existing.messages || []).slice(0, -1);
    existing.sendError = null;
  }
  if (existing.sendError && knownInboundId) {
    const lastSeya =
      lastMessage?.author === "seya" && String(lastMessage.text || "").trim()
        ? lastMessage
        : null;
    if (lastSeya?.text) {
      trace.stage = "send";
      const retried = await sendWithRetry(incoming.phone, lastSeya.text, sendExtras);
      if (retried.sent) {
        trace.sentTexts.push(lastSeya.text);
        existing.sendError = null;
        existing.lastInboundIds = inboundIds;
        await writeSeyaConversations(supabase, center.id, [
          existing,
          ...conversations.filter((item) => !isSameSeyaConversation(item, existing)),
        ]);
        return {
          phone: incoming.phone,
          routed: true,
          centerId: center.id,
          skipped: "retried_send",
          sent: true,
        };
      }
      return {
        phone: incoming.phone,
        routed: true,
        centerId: center.id,
        skipped: "send_failed",
        sent: false,
        error: existing.sendError,
      };
    }
  }

  existing.lastInboundIds = inboundIds;
  const previousSeya = [...(existing.messages || [])]
    .reverse()
    .find((item) => item.author === "seya")?.text || "";

  if (isUnreadableMedia(incoming.kind)) {
    const next = {
      ...existing,
      relanceCount: 0,
      welcomeSendAt: null,
      sendError: null,
      messages: [
        ...(existing.messages || []),
        message("lead", incoming.text),
        message("seya", UNREADABLE_MEDIA_REPLY),
      ],
      updatedAt: new Date().toISOString(),
    };
    trace.stage = "send";
    const sent = await sendWithRetry(incoming.phone, UNREADABLE_MEDIA_REPLY, sendExtras);
    if (sent.sent) {
      trace.sentTexts.push(UNREADABLE_MEDIA_REPLY);
    }
    next.sendError = sent.sent ? null : deliveryAlert("send", sent.error || sent.reason);
    trace.stage = "save";
    await writeSeyaConversations(supabase, center.id, [
      next,
      ...conversations.filter((item) => !isSameSeyaConversation(item, next)),
    ]);
    return {
      phone: incoming.phone,
      routed: true,
      centerId: center.id,
      leadId: context.leadId,
      status: next.status,
      skipped: "unreadable_media",
      sent: Boolean(sent.sent),
    };
  }

  const hours = readHours(center.settings);
  let appointments = [];
  try {
    const [{ data: rooms }] = await Promise.all([
      supabase.from("rooms").select("id,name").eq("center_id", center.id),
    ]);
    seya.agendaRooms = rooms || [];
    appointments = await loadCenterAppointments(supabase, center.id);
  } catch (loadError) {
    console.error("[seya/whatsapp] appointments failed", loadError);
  }

  let result;
  trace.stage = "generate";
  try {
    result = await generateSeyaReplyWithRetry({
      conversation: existing,
      text: incoming.text,
      seya,
      slots: pickSlotsForMessage(
        appointments,
        hours,
        existing,
        incoming.text,
        undefined,
        seya,
      ),
      appointments,
      hours,
      centerName: center.name,
      centerAddress: readCenterAddress(center),
      centerId: center.id,
    });
  } catch (generateError) {
    console.error("[seya/whatsapp] generate failed", generateError);
    const next = {
      ...existing,
      relanceCount: 0,
      welcomeSendAt: null,
      sendError: deliveryAlert(
        "generate",
        generateError instanceof Error ? generateError.message : "erreur technique",
      ),
      messages: [...(existing.messages || []), message("lead", incoming.text)],
      updatedAt: new Date().toISOString(),
    };
    const fallbackSent = await sendWithRetry(
      incoming.phone,
      EMPTY_SEYA_REPLY,
      sendExtras,
    );
    if (fallbackSent.sent) {
      trace.sentTexts.push(EMPTY_SEYA_REPLY);
      next.messages = [
        ...next.messages,
        { ...message("seya", EMPTY_SEYA_REPLY), delivery: "sent" },
      ];
      next.sendError = null;
    }
    trace.stage = "save";
    await writeSeyaConversations(supabase, center.id, [
      next,
      ...conversations.filter((item) => !isSameSeyaConversation(item, next)),
    ]);
    return {
      phone: incoming.phone,
      routed: true,
      centerId: center.id,
      leadId: context.leadId,
      status: next.status,
      error: "generate_failed",
      sent: Boolean(fallbackSent.sent),
    };
  }

  const next = result.conversation;
  if (recordedLead) {
    const leadIndex = (next.messages || [])
      .map((item) => item.author)
      .lastIndexOf("lead");
    if (leadIndex >= 0) {
      next.messages[leadIndex] = {
        ...next.messages[leadIndex],
        id: recordedLead.id,
        at: recordedLead.at,
      };
    }
  }
  next.lastRelanceAt = next.lastRelanceAt || existing.lastRelanceAt;
  next.relanceCount = 0;
  next.welcomeSendAt = null;
  next.lastInboundIds = inboundIds;

  let draftedReply =
    [...(result.conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || "";
  const recentLeadTexts = (next.messages || [])
    .filter((item) => item.author === "lead")
    .slice(-4)
    .map((item) => String(item.text || ""));
  const declaredElsewhere = recentLeadTexts.some((item) =>
    isAlreadyBookedElsewhere(item),
  );
  if (
    declaredElsewhere &&
    (result.shouldBook ||
      /je (vous )?propose|lequel vous irait|début de semaine|fin de semaine|\d{1,2}h\d{2}/i.test(
        draftedReply,
      ))
  ) {
    const note = alreadyBookedReply(incoming.text);
    draftedReply = note;
    result.shouldBook = null;
    next.status = next.qualification?.need ? "Qualifié" : next.status || "En cours";
    next.proposedSlots = [];
    next.bookingState = {
      ...(next.bookingState || {}),
      pendingQuestion: "no_slots",
      lastOfferedSlots: [],
      appointmentStatus: "declared_elsewhere",
    };
    next.teamNotes = {
      ...(next.teamNotes || {}),
      bookedElsewhere: {
        text: String(incoming.text || "").trim().slice(0, 200),
        at: new Date().toISOString(),
      },
    };
    const seyaIndex = (next.messages || []).map((item) => item.author).lastIndexOf("seya");
    if (seyaIndex >= 0) {
      next.messages[seyaIndex] = { ...next.messages[seyaIndex], text: note };
    }
  }
  const followUps = [];
  const wantedSlot = result.shouldBook;
  if (wantedSlot) {
    try {
      const booking = await bookSeyaAppointment(
        supabase,
        center.id,
        context,
        next,
        wantedSlot,
        seya,
        existing.bookedSlot,
      );
      if (booking?.leadId) {
        next.leadId = next.leadId || booking.leadId;
        if (booking.leadStatus) {
          Object.assign(next, withCrmStatus(next, booking.leadStatus, null));
        }
      }
      next.status = "RDV confirmé";
      next.bookedSlot = wantedSlot;
      next.proposedSlots = [];
      if (next.bookingState) {
        next.bookingState.lastOfferedSlots = [];
        next.bookingState.appointmentStatus = "confirmed";
        next.bookingState.pendingQuestion = null;
      }
      followUps.push(
        confirmedAppointmentReply({
          slot: wantedSlot,
          centerName: center.name,
          centerAddress: readCenterAddress(center),
          brief: seya.brief,
        }),
      );
      const bookedMail = await notifyCenterSeyaAction({
        center,
        seya,
        conversation: next,
        kind: "booked",
        slot: wantedSlot,
        previousSlot: existing.bookedSlot?.date && existing.bookedSlot?.time ? existing.bookedSlot : null,
      }).catch((error) => {
        console.error("[seya/whatsapp] center notify booked", error);
        return { conversation: next };
      });
      if (bookedMail?.conversation?.centerNotifyKey) {
        next.centerNotifyKey = bookedMail.conversation.centerNotifyKey;
      }
    } catch (bookError) {
      console.error("[seya/whatsapp] book failed", bookError);
      result.shouldBook = null;
      if (existing.bookedSlot) {
        next.status = existing.status || "RDV confirmé";
        next.bookedSlot = existing.bookedSlot;
      } else {
        next.status = "RDV proposé";
        next.bookedSlot = undefined;
      }
      const latestOccupancy = await loadCenterAppointments(supabase, center.id);
      const remaining = remainingOfferedSlots(
        existing.proposedSlots || existing.bookingState?.lastOfferedSlots || [],
        latestOccupancy,
        wantedSlot,
      );
      const alternatives = remaining.length
        ? remaining.slice(0, 2)
        : pickSlotsForState(
            latestOccupancy,
            hours,
            {
              ...(next.bookingState || {}),
              lastOfferedSlots: [],
              requestedDate: wantedSlot.date,
              rejectedSlots: [
                ...((next.bookingState && next.bookingState.rejectedSlots) || []),
                { date: wantedSlot.date, time: wantedSlot.time },
              ],
            },
            new Date(),
            visitDurationMinutes(seya, next, ""),
          );
      if (next.bookingState) {
        next.bookingState.appointmentStatus = "proposed";
        next.bookingState.lastOfferedSlots = alternatives;
        next.bookingState.requestedDate = wantedSlot.date;
        next.bookingState.rejectedSlots = [
          ...(next.bookingState.rejectedSlots || []),
          { date: wantedSlot.date, time: wantedSlot.time },
        ];
      }
      next.proposedSlots = alternatives;
      followUps.push(
        alternatives.length
          ? `Ce créneau n’est plus disponible. ${humanSlotReply(alternatives, next.bookingState)}`
          : "Ce créneau n’est plus disponible. Souhaitez-vous que je regarde un autre horaire ?",
      );
    }
  }

  if (
    !wantedSlot &&
    next.status === "À recontacter" &&
    next.bookingState?.pendingQuestion === "callback" &&
    existing.bookingState?.pendingQuestion !== "callback"
  ) {
    Object.assign(next, await sendCallbackHandoff({ center, seya, conversation: next }));
    if (next.teamHandoff?.status !== "sent") {
      draftedReply = CALLBACK_NOTED_REPLY;
      const seyaIndex = (next.messages || []).map((item) => item.author).lastIndexOf("seya");
      if (seyaIndex >= 0) {
        next.messages[seyaIndex] = { ...next.messages[seyaIndex], text: draftedReply };
      }
    }
  } else if (
    !wantedSlot &&
    existing.teamHandoff?.status === "sent" &&
    next.teamNotes?.handedOffAt &&
    (next.teamNotes?.preferences || []).length > (existing.teamNotes?.preferences || []).length
  ) {
    const update = await notifyCenterSeyaAction({
      center,
      seya,
      conversation: next,
      kind: "callback_update",
    }).catch((error) => {
      console.error("[seya/whatsapp] center notify callback update", error);
      return { sent: false };
    });
    next.teamHandoff = {
      ...(next.teamHandoff || {}),
      lastUpdate: { status: update?.sent ? "sent" : "failed", at: new Date().toISOString() },
    };
  } else if (next.teamHandoff?.status === "failed" && next.status === "À recontacter") {
    next.status = next.qualification?.need ? "Qualifié" : "En cours";
  }

  const teamQuestion = next.teamNotes?.question;
  if (teamQuestion?.status === "pending" && teamQuestion.at !== existing.teamNotes?.question?.at) {
    const asked = await notifyCenterSeyaAction({
      center,
      seya,
      conversation: next,
      kind: "question",
    }).catch((error) => {
      console.error("[seya/whatsapp] center notify question", error);
      return { sent: false };
    });
    next.teamNotes = {
      ...next.teamNotes,
      question: { ...teamQuestion, status: asked?.sent ? "sent" : "failed" },
    };
    if (!asked?.sent) {
      draftedReply = withoutTeamQuestion(draftedReply);
      const seyaIndex = (next.messages || []).map((item) => item.author).lastIndexOf("seya");
      if (seyaIndex >= 0) {
        next.messages[seyaIndex] = { ...next.messages[seyaIndex], text: draftedReply };
      }
    }
  }

  let uniqueOutgoing = outgoingWhatsAppTexts(
    followUps,
    draftedReply,
    previousSeya,
    incoming.text,
  );
  if (!uniqueOutgoing.length && incoming.text) {
    uniqueOutgoing = [String(draftedReply || "").trim() || EMPTY_SEYA_REPLY];
  }
  const fresh = await readFreshConversation(supabase, center.id, existing).catch((freshError) => {
    console.error("[seya/whatsapp] fresh read", freshError);
    return null;
  });
  const heldOutgoing = holdOutgoingAfterPause(fresh, existing, uniqueOutgoing);
  if (heldOutgoing !== uniqueOutgoing) {
    uniqueOutgoing = heldOutgoing;
    const pause = activeLeadPause(fresh);
    next.leadPause = pause;
    next.proposedSlots = [];
    next.bookingState = { ...(next.bookingState || {}), pendingQuestion: "no_slots", lastOfferedSlots: [] };
    if (!uniqueOutgoing.length) {
      const lastSeyaIndex = (next.messages || []).map((item) => item.author).lastIndexOf("seya");
      next.messages = (next.messages || []).filter((_, index) => index !== lastSeyaIndex);
    }
  }
  Object.assign(next, replaceDraftWithSent(next, uniqueOutgoing));

  trace.stage = "send";
  const sendResults = [];
  for (const text of uniqueOutgoing) {
    const sent = await sendWithRetry(incoming.phone, text, {
      ...sendExtras,
      treatment: next.qualification?.need || sendExtras.treatment,
    });
    sendResults.push(sent);
    if (sent?.sent) {
      trace.sentTexts.push(text);
    }
  }
  next.messages = markDelivery(next.messages, sendResults);
  const failed = sendResults.find((item) => !item?.sent);
  next.sendError = failed
    ? deliveryAlert("send", failed.error || failed.reason)
    : null;
  if (!result.shouldBook) {
    const crmPatch = await syncCrmFromSeyaIntent(
      supabase,
      center.id,
      context,
      incoming.text,
      existing,
    ).catch((crmError) => {
      console.error("[seya/whatsapp] crm intent failed", crmError);
      return null;
    });
    if (crmPatch && context.crmLoaded) {
      Object.assign(
        next,
        withCrmStatus(next, crmPatch.status, crmPatch.recall_date || context.recall_date),
      );
    }
  }

  trace.stage = "save";

  const saved = persistableConversations([
    next,
    ...conversations.filter((item) => !isSameSeyaConversation(item, next)),
  ]);

  await writeSeyaConversations(supabase, center.id, saved);

  return {
    phone: incoming.phone,
    routed: true,
    centerId: center.id,
    centerName: center.name,
    leadId: context.leadId,
    status: next.status,
    route,
    booked: Boolean(result.shouldBook),
    sent: sendResults.length ? sendResults.every((item) => item?.sent) : false,
    skipped: uniqueOutgoing.length ? undefined : "lead_pause",
    error: next.sendError || null,
  };
}

async function loadCenterAppointments(supabase, centerId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date,starts_at,duration_minutes,status,room_id")
    .eq("center_id", centerId)
    .gte("appointment_date", new Date().toISOString().slice(0, 10));

  if (error) {
    console.error("[seya/whatsapp] appointments", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    date: row.appointment_date,
    start: row.starts_at,
    duration: row.duration_minutes,
    status: row.status || "",
    cabinId: row.room_id || "",
    room_id: row.room_id || "",
  }));
}

async function syncCrmFromSeyaIntent(supabase, centerId, context, text, conversation) {
  const update = crmStatusFromLeadMessage(text, new Date(), { conversation });
  if (!update || !context.leadId) {
    return;
  }
  const current = String(context.status || "");
  if (
    !context.crmLoaded ||
    !canSeyaSetCrmStatus({ status: current, recall_date: context.recall_date }, update)
  ) {
    return;
  }

  const patch = {
    status: update.status,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    next_action: update.reminderDate
      ? `Recontacter le ${update.reminderDate}`
      : update.status,
  };
  if (update.reminderDate) {
    patch.recall_date = update.reminderDate;
  }

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", context.leadId)
    .eq("center_id", centerId);
  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("lead_events").insert({
    center_id: centerId,
    lead_id: context.leadId,
    event_type: "status",
    from_value: current,
    to_value: update.status,
    note: update.reminderDate
      ? `Seya WhatsApp · à recontacter le ${update.reminderDate}.`
      : "Seya WhatsApp.",
  });
  return patch;
}

// Mêmes statuts que lib/appointment-lead-status.ts : un RDV ne fait pas reculer ces fiches.
function shouldMarkLeadAsBooked(status) {
  return ![
    "RDV pris",
    "RDV confirmé",
    "Acompte envoyé",
    "Acompte reçu",
    "Acompte en attente",
    "Devis",
    "Vendu",
    "Client converti",
  ].includes(status);
}

async function resolveBookingLead(supabase, centerId, context, conversation) {
  const ids = [...new Set([conversation?.leadId, context.leadId].filter(Boolean).map(String))];
  if (ids.length) {
    const { data, error } = await supabase
      .from("leads")
      .select("id,client_id,status")
      .eq("center_id", centerId)
      .in("id", ids);
    if (error) {
      console.error("[seya/whatsapp] booking lead", error.message);
    }
    for (const id of ids) {
      const row = (data || []).find((item) => String(item.id) === id);
      if (row && !/^doublon$/i.test(String(row.status || "").trim())) {
        return row;
      }
    }
  }
  if (!context.clientId) {
    return null;
  }
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id,client_id,status,created_at")
    .eq("center_id", centerId)
    .eq("client_id", context.clientId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error("[seya/whatsapp] booking lead by client", error.message);
    return null;
  }
  return (rows || []).find((row) => !/^doublon$/i.test(String(row.status || "").trim())) || null;
}

async function markLeadBookedBySeya(supabase, centerId, lead, slot, moved) {
  if (!lead?.id) {
    return null;
  }
  const current = String(lead.status || "").trim();
  const status = shouldMarkLeadAsBooked(current) ? "RDV pris" : current;
  if (status !== current) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("leads")
      .update({
        status,
        next_action: "RDV Seya à confirmer",
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", lead.id)
      .eq("center_id", centerId)
      .select("id");
    if (error || !data?.length) {
      console.error(
        "[seya/whatsapp] lead RDV pris non enregistré",
        lead.id,
        error?.message || "aucune ligne",
      );
      return null;
    }
  }
  await supabase.from("lead_events").insert({
    center_id: centerId,
    lead_id: lead.id,
    event_type: "status",
    from_value: current,
    to_value: status,
    note: moved ? `RDV Seya décalé au ${slot.label}.` : `RDV Seya posé le ${slot.label}.`,
  });
  return status;
}

/** `previousSlot` : créneau déjà confirmé avant ce message (déplacement), jamais le créneau demandé. */
async function bookSeyaAppointment(supabase, centerId, context, conversation, slot, seya, previousSlot) {
  const previous = previousSlot?.date && previousSlot?.time ? previousSlot : null;
  const bookingLead = await resolveBookingLead(supabase, centerId, context, conversation).catch(
    (error) => {
      console.error("[seya/whatsapp] booking lead", error);
      return null;
    },
  );
  const [{ data: rooms }, { data: practitioners }, { data: services }] = await Promise.all([
    supabase.from("rooms").select("id,name").eq("center_id", centerId),
    supabase.from("practitioners").select("id,first_name,last_name").eq("center_id", centerId),
    supabase.from("services").select("id,name,duration_minutes").eq("center_id", centerId),
  ]);
  const family = resolveActiveFamily(seya, conversation, "");
  const resources = pickBookingResources({
    rooms: rooms || [],
    practitioners: practitioners || [],
    services: services || [],
    seya,
    family,
  });

  const start = slotTime(slot.time);
  const duration =
    Number(slot?.duration) > 0
      ? Number(slot.duration)
      : Number(previous?.duration) > 0
        ? Number(previous.duration)
        : visitDurationMinutes(seya, conversation, "") ||
          Number(resources.service?.duration_minutes) ||
          resources.durationMinutes;
  const [hours, minutes] = start.split(":").map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + duration;
  const endsAt = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const bookedDate = slotDate(previous?.date);
  const today = new Date().toISOString().slice(0, 10);
  const fromDate =
    bookedDate && bookedDate < today ? bookedDate : today;

  const { data: existing } = await supabase
    .from("appointments")
    .select(
      "id,lead_id,client_id,starts_at,duration_minutes,status,appointment_date,notes,cancelled_at,status_history,room_id",
    )
    .eq("center_id", centerId)
    .gte("appointment_date", fromDate);
  const own = findOwnSeyaAppointment(existing, context, { ...conversation, bookedSlot: previous });
  const durationMinutes = Number(own?.duration_minutes) > 0 ? Number(own.duration_minutes) : duration;
  const ownEndsAt =
    Number(own?.duration_minutes) > 0
      ? `${String(Math.floor((startMinutes + durationMinutes) / 60)).padStart(2, "0")}:${String((startMinutes + durationMinutes) % 60).padStart(2, "0")}`
      : endsAt;
  const busy = (existing || [])
    .filter((row) => row.id !== own?.id)
    .filter((row) => slotDate(row.appointment_date) === slotDate(slot.date))
    .map((row) => ({
      date: slotDate(slot.date),
      start: slotTime(row.starts_at),
      duration: row.duration_minutes,
      status: row.status || "",
      cabinId: row.room_id || "",
      room_id: row.room_id || "",
    }));
  if (isSlotBusy(busy, slot.date, start, durationMinutes, resources.cabinId)) {
    throw new Error("slot_taken");
  }

  if (own?.id) {
    const now = new Date().toISOString();
    const history = Array.isArray(own.status_history) ? own.status_history : [];
    const { data, error } = await supabase
      .from("appointments")
      .update({
        appointment_date: slotDate(slot.date),
        starts_at: start,
        ends_at: ownEndsAt,
        duration_minutes: durationMinutes,
        status: dbStatusWhenSlotPositioned(slot.date, start),
        notes: `RDV Seya décalé · ${conversation.qualification?.need || context.treatment || "soin"}`,
        confirmation_token_slot: appointmentSlot(slot.date, start),
        status_history: [
          ...history,
          {
            at: now,
            source: "seya",
            action: "move",
            from: `${slotDate(own.appointment_date)}|${slotTime(own.starts_at)}`,
            to: `${slotDate(slot.date)}|${start}`,
          },
        ].slice(-30),
        updated_at: now,
      })
      .eq("id", own.id)
      .eq("center_id", centerId)
      .select("id,starts_at,appointment_date")
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data || slotTime(data.starts_at) !== start) {
      throw new Error("slot_update_empty");
    }
  } else if (previous) {
    throw new Error("slot_missing");
  } else {
    const { error } = await supabase.from("appointments").insert({
      center_id: centerId,
      client_id: context.clientId || bookingLead?.client_id || null,
      lead_id: bookingLead?.id || null,
      service_id: resources.service?.id || null,
      room_id: resources.room?.id || rooms?.[0]?.id || null,
      practitioner_id: resources.practitioner?.id || practitioners?.[0]?.id || null,
      appointment_date: slotDate(slot.date),
      starts_at: start,
      ends_at: endsAt,
      duration_minutes: durationMinutes,
      status: dbStatusWhenSlotPositioned(slot.date, start),
      origin: "seya",
      notes: `RDV Seya WhatsApp · ${conversation.qualification?.need || context.treatment || "soin"}`,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  const leadStatus = await markLeadBookedBySeya(
    supabase,
    centerId,
    bookingLead,
    slot,
    Boolean(own?.id),
  ).catch((error) => {
    console.error("[seya/whatsapp] lead RDV pris", error);
    return null;
  });
  return { leadId: bookingLead?.id || null, leadStatus };
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function wabaId() {
  return (
    process.env.WHATSAPP_WABA_ID ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    "20162664690279331"
  ).trim();
}

async function graphGet(path) {
  const token = process.env.WHATSAPP_TOKEN;
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function graphError(result) {
  return {
    ok: Boolean(result?.ok),
    code: result?.data?.error?.code || null,
    error: result?.data?.error?.message || null,
    type: result?.data?.error?.type || null,
  };
}

function idSuffix(value) {
  const text = String(value || "");
  return text ? text.slice(-4) : null;
}

async function debugAccessToken(token) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { available: false, reason: "no_app_secret" };
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(
      token,
    )}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
  );
  const data = await response.json().catch(() => ({}));
  const info = data?.data || {};
  if (!response.ok || data?.error) {
    return {
      available: true,
      ok: false,
      error: data?.error?.message || "debug_token_failed",
      code: data?.error?.code || null,
    };
  }

  return {
    available: true,
    ok: Boolean(info.is_valid),
    isValid: Boolean(info.is_valid),
    type: info.type || null,
    appId: info.app_id || null,
    expiresAt: info.expires_at || 0,
    scopes: Array.isArray(info.scopes) ? info.scopes : [],
    granularScopes: Array.isArray(info.granular_scopes)
      ? info.granular_scopes.map((item) => item.scope).filter(Boolean)
      : [],
  };
}

function diagnoseFromParts({ me, debug, phone, waba, phones }) {
  if (me.code === 190 || debug.code === 190 || debug.isValid === false) {
    return "token_invalide_ou_expire";
  }
  if (waba.ok === false && (waba.code === 100 || waba.code === 10)) {
    return "jeton_sans_acces_waba";
  }
  if (phone.ok === false && (phone.code === 100 || phone.code === 10)) {
    if (phones.length === 0) {
      return "jeton_sans_whatsapp";
    }
    return "mauvais_phone_number_id";
  }
  if (phone.ok && waba.ok) {
    return "ok";
  }
  return "graph_partiel";
}

async function diagnoseGraph() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { reachable: false, reason: "not_connected", diagnosis: "not_connected" };
  }

  const waba = wabaId();
  const [me, debug, phone, wabaInfo, phoneList] = await Promise.all([
    graphGet("me?fields=id,name"),
    debugAccessToken(token),
    graphGet(
      `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
    ),
    graphGet(
      `${waba}?fields=id,name,currency,ownership_type,account_review_status`,
    ),
    graphGet(
      `${waba}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
    ),
  ]);

  const phonesOnWaba = Array.isArray(phoneList.data?.data)
    ? phoneList.data.data.map((item) => ({
        idSuffix: idSuffix(item.id),
        displayPhoneNumber: item.display_phone_number || null,
        verifiedName: item.verified_name || null,
        matchesConfigured: String(item.id) === String(phoneNumberId),
      }))
    : [];

  const phonePart = graphError(phone);
  const wabaPart = graphError(wabaInfo);
  const diagnosis = diagnoseFromParts({
    me: graphError(me),
    debug,
    phone: phonePart,
    waba: wabaPart,
    phones: phonesOnWaba,
  });

  const templates = phone.ok
    ? await graphGet(
        `${waba}/message_templates?limit=80&fields=name,status,language,category`,
      )
    : { ok: false, data: {} };

  return {
    reachable: Boolean(phone.ok),
    diagnosis,
    phoneNumberIdSuffix: idSuffix(phoneNumberId),
    wabaIdSuffix: idSuffix(waba),
    token: {
      ok: Boolean(me.ok),
      name: me.data?.name || null,
      idSuffix: idSuffix(me.data?.id),
      ...graphError(me),
    },
    debug,
    phone: {
      ...phonePart,
      displayPhoneNumber: phone.data?.display_phone_number || null,
      verifiedName: phone.data?.verified_name || null,
      qualityRating: phone.data?.quality_rating || null,
      codeVerificationStatus: phone.data?.code_verification_status || null,
    },
    waba: {
      ...wabaPart,
      name: wabaInfo.data?.name || null,
      review: wabaInfo.data?.account_review_status || null,
    },
    phonesOnWaba,
    phonesOnWabaError: phoneList.ok
      ? null
      : phoneList.data?.error?.message || "phones_failed",
    templates: Array.isArray(templates.data?.data)
      ? templates.data.data.map((item) => ({
          name: item.name,
          status: item.status,
          language: item.language,
          category: item.category,
        }))
      : [],
    templatesError: templates.ok
      ? null
      : templates.data?.error?.message || null,
    error: phonePart.error,
    code: phonePart.code,
  };
}

function welcomeTemplateVars(extras) {
  const offer = String(extras?.offerLabel || extras?.treatment || "").trim();
  return {
    firstName: String(extras?.firstName || "").trim() || "bonjour",
    centerName: String(extras?.centerName || "").trim() || "notre centre",
    treatment: offer || "votre soin",
  };
}

function templateVarCount(template) {
  const body = (template.components || []).find(
    (item) => String(item.type || "").toUpperCase() === "BODY",
  );
  const counted = ((body?.text || "").match(/\{\{\d+\}\}/g) || []).length;
  if (counted > 0) {
    return counted;
  }
  if (/^seya_accueil/i.test(String(template.name || ""))) {
    return 3;
  }
  return 0;
}

function isTemplateRequired(error) {
  const code = error?.code;
  const message = `${error?.message || ""} ${error?.error_data?.details || ""}`;
  return (
    code === 131047 ||
    code === 131051 ||
    /template|24 hour|re-engagement|must be a template/i.test(message)
  );
}

function frenchSendError(error, fallback) {
  const code = error?.code;
  const message = error?.message || fallback || "WhatsApp send failed";
  if (code === 190) {
    return "Le jeton WhatsApp a expiré. Il faut en recréer un dans Meta.";
  }
  if (
    code === 10 ||
    (code === 100 && /permission|does not exist|unsupported/i.test(message))
  ) {
    return "Le jeton n’a pas le droit d’envoyer depuis ce numéro Bookea.";
  }
  if (code === 133010 || /not registered|hors ligne|offline/i.test(message)) {
    return "Le numéro Bookea n’est pas encore en ligne sur l’API Cloud.";
  }
  if (code === 131030) {
    return "Ce numéro destinataire n’est pas autorisé (mode test Meta).";
  }
  if (code === 131026) {
    return "Ce numéro n’a pas WhatsApp, ou le format est invalide.";
  }
  if (isTemplateRequired(error)) {
    return "Meta bloque le premier message tant qu’un modèle WhatsApp n’est pas approuvé.";
  }
  return message;
}

async function sendGraphMessage(phoneNumberId, token, body) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[seya/whatsapp] graph send", {
      status: response.status,
      code: data?.error?.code || null,
      message: data?.error?.message || null,
    });
  }
  return { ok: response.ok, data };
}

async function listTemplates() {
  const listed = await graphGet(
    `${wabaId()}/message_templates?limit=80&fields=name,status,language,category,components`,
  );
  if (!listed.ok) {
    return { templates: [], error: listed.data?.error || { message: "templates_failed" } };
  }
  return {
    templates: Array.isArray(listed.data?.data) ? listed.data.data : [],
    error: null,
  };
}

async function ensureSeyaTemplate() {
  const { templates, error } = await listTemplates();
  if (error) {
    return { template: null, error };
  }

  const approved = templates.find(
    (item) =>
      item.name === "seya_accueil" &&
      String(item.status || "").toUpperCase() === "APPROVED",
  );
  if (approved) {
    return { template: approved, error: null };
  }

  const existing = templates.find((item) => item.name === "seya_accueil");
  if (existing) {
    return { template: existing, error: null };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId()}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "seya_accueil",
        language: "fr",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "Bonjour {{1}}, merci pour votre inscription chez {{2}}. Je suis Seya. Vous avez indiqué {{3}}. Répondez-moi ici pour que je vous propose un créneau.",
            example: {
              body_text: [["Sam", "le centre", "votre soin"]],
            },
          },
        ],
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { template: null, error: data?.error || { message: "template_create_failed" } };
  }
  return {
    template: {
      name: "seya_accueil",
      status: data.status || "PENDING",
      language: "fr",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: "Bonjour {{1}}, merci pour votre inscription chez {{2}}. Je suis Seya. Vous avez indiqué {{3}}.",
        },
      ],
    },
    error: null,
  };
}

function normalizeTemplateLanguage(value) {
  const code = String(value || "fr").trim().toLowerCase();
  if (code === "fr" || code.startsWith("fr_")) {
    return code === "fr" ? "fr" : code;
  }
  if (code.startsWith("en")) {
    return code === "en" ? "en_US" : code;
  }
  return code || "fr";
}

function pickWelcomeTemplate(templates, extras) {
  const family =
    extras.family ||
    inferCareFamily(
      `${extras.treatment || ""} ${extras.campaign || ""} ${extras.offerLabel || ""}`,
    );
  return pickApprovedTemplate(templates, family, extras.templateName);
}

function templateParameters(template, vars) {
  const count = templateVarCount(template);
  const parameters = [vars.firstName, vars.centerName, vars.treatment]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [
    parameters[0] || "bonjour",
    parameters[1] || "notre centre",
    parameters[2] || "votre soin",
  ].slice(0, Math.max(count, 0));
}

function renderTemplateText(template, vars) {
  const body = (template?.components || []).find(
    (item) => String(item.type || "").toUpperCase() === "BODY",
  );
  const params = templateParameters(template, vars);
  return String(body?.text || "").replace(
    /\{\{(\d+)\}\}/g,
    (match, index) => params[Number(index) - 1] ?? match,
  );
}

async function sendTemplateMessage(phoneNumberId, token, intl, template, vars) {
  const count = templateVarCount(template);
  const padded = templateParameters(template, vars);

  const body = {
    messaging_product: "whatsapp",
    to: intl,
    type: "template",
    template: {
      name: template.name,
      language: { code: normalizeTemplateLanguage(template.language) },
    },
  };
  if (count > 0) {
    body.template.components = [
      {
        type: "body",
        parameters: padded.slice(0, count).map((text) => ({ type: "text", text })),
      },
    ];
  }

  return sendGraphMessage(phoneNumberId, token, body);
}

async function previewWelcomeTemplateText(extras = {}) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return "";
  }
  const listed = await listTemplates();
  const template = pickWelcomeTemplate(listed.templates, extras);
  return template ? renderTemplateText(template, welcomeTemplateVars(extras)).trim() : "";
}

async function sendSharedWhatsApp(phone, text, extras = {}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { sent: false, reason: "not_connected" };
  }

  const intl = toWhatsAppIntl(phone);
  text = prospectText(text);
  const vars = Object.fromEntries(
    Object.entries(welcomeTemplateVars(extras)).map(([key, value]) => [
      key,
      typeof value === "string" ? prospectText(value) : value,
    ]),
  );

  let textError = {};
  if (!extras.preferTemplate) {
    const textResult = await sendGraphMessage(phoneNumberId, token, {
      messaging_product: "whatsapp",
      to: intl,
      type: "text",
      text: { body: String(text || "").trim() },
    });
    if (textResult.ok) {
      return { sent: true, id: textResult.data?.messages?.[0]?.id || null, via: "text" };
    }

    textError = textResult.data?.error || {};
    if (!isTemplateRequired(textError)) {
      return {
        sent: false,
        reason: "send_failed",
        code: textError.code || null,
        error: frenchSendError(textError),
        to: intl,
      };
    }
  }

  const listed = await listTemplates();
  let template = pickWelcomeTemplate(listed.templates, extras);
  if (!template) {
    const ensured = await ensureSeyaTemplate();
    if (ensured.template && String(ensured.template.status || "").toUpperCase() === "APPROVED") {
      template = ensured.template;
    } else {
      return {
        sent: false,
        reason: "template_required",
        code: textError.code || null,
        error:
          ensured.template
            ? "Le premier message part via le modèle générique seya_accueil (prénom, centre, offre). Il doit être Approuvé une fois dans Meta — pas besoin d’y coller le texte de chaque campagne."
            : frenchSendError(ensured.error || textError),
        templateStatus: ensured.template?.status || null,
        to: intl,
      };
    }
  }

  const templateResult = await sendTemplateMessage(
    phoneNumberId,
    token,
    intl,
    template,
    vars,
  );
  if (templateResult.ok) {
    return {
      sent: true,
      id: templateResult.data?.messages?.[0]?.id || null,
      via: "template",
      template: template.name,
      text: renderTemplateText(template, vars),
      to: intl,
    };
  }

  return {
    sent: false,
    reason: "template_failed",
    code: templateResult.data?.error?.code || null,
    error: frenchSendError(templateResult.data?.error, textError.message),
    template: template.name,
    to: intl,
  };
}

handler.sendSharedWhatsApp = sendSharedWhatsApp;
handler.handleIncoming = handleIncoming;
handler.processInbound = processInbound;
handler.contextFromSeyaThread = contextFromSeyaThread;
handler.markDelivery = markDelivery;
handler.previewWelcomeTemplateText = previewWelcomeTemplateText;
handler.outgoingWhatsAppTexts = outgoingWhatsAppTexts;
handler.replaceDraftWithSent = replaceDraftWithSent;
handler.holdOutgoingAfterPause = holdOutgoingAfterPause;
handler.isTemplateRequired = isTemplateRequired;
handler.welcomeTemplateVars = welcomeTemplateVars;
handler.extractIncomingMessages = extractIncomingMessages;
handler.coalesceIncoming = coalesceIncoming;
handler.alreadyHandledInbound = alreadyHandledInbound;
handler.inboundTextFromWhatsApp = inboundTextFromWhatsApp;
handler.sendWithRetry = sendWithRetry;
handler.isRetryableSend = isRetryableSend;
handler.resolveBookingLead = resolveBookingLead;
handler.markLeadBookedBySeya = markLeadBookedBySeya;
module.exports = handler;
