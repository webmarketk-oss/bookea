/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { generateSeyaReply, hasAiKey } = require("./ai");
const { inferCareFamily, pickApprovedTemplate } = require("./care-family");
const { isNearDuplicate } = require("./price");
const { sanitizePersonName } = require("../../lib/seya-person-name");
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
const { findOwnSeyaAppointment, slotDate, slotTime } = require("./own-appointment");
const { appointmentSlot } = require("../appointments/token-utils");
const {
  crmUpdateFromLeadMessage,
  lockedCrmStatuses,
} = require("./conversation");
const { isCrmRelanceHold } = require("./crm-sync");
const {
  isNewSeyaConversationBlocked,
  isSeyaOff,
  writeSeyaConversations,
} = require("./store");

const GRAPH_VERSION = "v21.0";
const inboundLocks = new Map();
const EMPTY_SEYA_REPLY =
  "Je suis là. Dites-moi ce dont vous avez besoin, je vous réponds.";
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
    () => handleIncoming(supabase, incoming),
    () => handleIncoming(supabase, incoming),
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

async function generateSeyaReplyWithRetry(args) {
  try {
    return await generateSeyaReply(args);
  } catch (error) {
    console.error("[seya/whatsapp] generate retry", error);
    return generateSeyaReply(args);
  }
}

async function handleIncoming(supabase, incoming) {
  const context = await resolveCenterFromPhone(supabase, incoming.phone);
  if (!context) {
    return { phone: incoming.phone, routed: false, reason: "unknown_contact" };
  }

  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,settings,address_line1,city,postal_code")
    .eq("id", context.centerId)
    .maybeSingle();

  if (error || !center) {
    throw new Error(error?.message || "Center not found");
  }

  const seya = asRecord(asRecord(center.settings).seya);
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
  existing.centerId = existing.centerId || center.id;
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

  if (existing.sendError && knownInboundId) {
    const lastSeya = [...(existing.messages || [])]
      .reverse()
      .find((item) => item.author === "seya" && String(item.text || "").trim());
    if (lastSeya?.text) {
      const retried = await sendWithRetry(incoming.phone, lastSeya.text, sendExtras);
      if (retried.sent) {
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
    const sent = await sendWithRetry(incoming.phone, UNREADABLE_MEDIA_REPLY, sendExtras);
    next.sendError = sent.sent ? null : deliveryAlert("send", sent.error || sent.reason);
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
    appointments = await loadCenterAppointments(supabase, center.id);
  } catch (loadError) {
    console.error("[seya/whatsapp] appointments failed", loadError);
  }

  let result;
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
      next.messages = [...next.messages, message("seya", EMPTY_SEYA_REPLY)];
      next.sendError = null;
    }
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
  next.lastRelanceAt = next.lastRelanceAt || existing.lastRelanceAt;
  next.relanceCount = 0;
  next.welcomeSendAt = null;
  next.lastInboundIds = inboundIds;

  const draftedReply =
    [...(result.conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || "";
  const followUps = [];
  const wantedSlot = result.shouldBook;
  if (wantedSlot) {
    try {
      await bookSeyaAppointment(supabase, center.id, context, next, wantedSlot);
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

  let uniqueOutgoing = outgoingWhatsAppTexts(
    followUps,
    draftedReply,
    previousSeya,
    incoming.text,
  );
  if (!uniqueOutgoing.length && incoming.text) {
    uniqueOutgoing = [String(draftedReply || "").trim() || EMPTY_SEYA_REPLY];
  }
  Object.assign(next, replaceDraftWithSent(next, uniqueOutgoing));

  const sendResults = [];
  for (const text of uniqueOutgoing) {
    sendResults.push(await sendWithRetry(incoming.phone, text, {
      ...sendExtras,
      treatment: next.qualification?.need || sendExtras.treatment,
    }));
  }
  const failed = sendResults.find((item) => !item?.sent);
  next.sendError = failed
    ? deliveryAlert("send", failed.error || failed.reason)
    : null;

  const saved = persistableConversations([
    next,
    ...conversations.filter((item) => !isSameSeyaConversation(item, next)),
  ]);

  await writeSeyaConversations(supabase, center.id, saved);

  if (!result.shouldBook) {
    await syncCrmFromSeyaIntent(
      supabase,
      center.id,
      context,
      incoming.text,
    ).catch((crmError) => {
      console.error("[seya/whatsapp] crm intent failed", crmError);
    });
  }

  return {
    phone: incoming.phone,
    routed: true,
    centerId: center.id,
    centerName: center.name,
    leadId: context.leadId,
    status: next.status,
    booked: Boolean(result.shouldBook),
    sent: sendResults.length ? sendResults.every((item) => item?.sent) : false,
    error: next.sendError || null,
  };
}

async function resolveCenterFromLeadPhone(supabase, phone, last9) {
  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id,center_id,client_id,status,next_action,recall_date,service_id,updated_at,last_activity_at,phone,campaigns(name)",
    )
    .or(`phone.eq.${phone},phone.eq.0${last9},phone.ilike.%${last9}%`)
    .order("last_activity_at", { ascending: false })
    .limit(12);

  if (error || !leads?.length) {
    return null;
  }

  const matched = leads.filter((row) => last9Phone(row.phone) === last9);
  const lead = matched[0] || leads[0];
  if (!lead?.id || !lead.center_id) {
    return null;
  }

  let firstName = "bonjour";
  let lastName = "";
  let clientPhone = lead.phone || phone;
  if (lead.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("first_name,last_name,phone")
      .eq("id", lead.client_id)
      .maybeSingle();
    if (client) {
      const person = sanitizePersonName(client.first_name, client.last_name);
      firstName = person.firstName || firstName;
      lastName = person.lastName;
      clientPhone = client.phone || clientPhone;
    }
  }

  const { data: service } = lead.service_id
    ? await supabase
        .from("services")
        .select("name")
        .eq("id", lead.service_id)
        .maybeSingle()
    : { data: null };

  return {
    centerId: lead.center_id,
    clientId: lead.client_id,
    leadId: lead.id,
    firstName,
    lastName,
    phone: clientPhone,
    treatment: service?.name || "",
    campaign: Array.isArray(lead.campaigns)
      ? lead.campaigns[0]?.name || ""
      : lead.campaigns?.name || "",
    status: lead.status || "Nouveau",
    recall_date: lead.recall_date || "",
  };
}

async function resolveCenterFromPhone(supabase, phone) {
  const last9 = last9Phone(phone);
  if (last9.length < 9) {
    return null;
  }

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id,center_id,first_name,last_name,phone,updated_at")
    .or(`phone.eq.${phone},phone.eq.0${last9},phone.ilike.%${last9}%`)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(error.message);
  }

  const matched = (clients ?? []).filter(
    (row) => last9Phone(row.phone) === last9,
  );
  if (matched.length === 0) {
    const fromLead = await resolveCenterFromLeadPhone(supabase, phone, last9);
    if (fromLead) {
      return fromLead;
    }
    return null;
  }

  const ranked = [];
  for (const client of matched) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id,status,next_action,recall_date,latest_comment,service_id,updated_at,last_activity_at,campaigns(name)")
      .eq("center_id", client.center_id)
      .eq("client_id", client.id)
      .order("last_activity_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ranked.push({
      client,
      lead,
      at: lead?.last_activity_at || lead?.updated_at || client.updated_at || "",
    });
  }
  ranked.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const chosen = ranked.find((item) => item.lead?.id) || ranked[0];
  if (chosen?.lead?.id) {
    const client = chosen.client;
    const lead = chosen.lead;
    const { data: service } = lead.service_id
      ? await supabase
          .from("services")
          .select("name")
          .eq("id", lead.service_id)
          .maybeSingle()
      : { data: null };

    const person = sanitizePersonName(client.first_name, client.last_name);
    return {
      centerId: client.center_id,
      clientId: client.id,
      leadId: lead.id,
      firstName: person.firstName || "bonjour",
      lastName: person.lastName,
      phone: client.phone || phone,
      treatment: service?.name || "",
      campaign: Array.isArray(lead.campaigns)
        ? lead.campaigns[0]?.name || ""
        : lead.campaigns?.name || "",
      status: lead.status || "Nouveau",
      recall_date: lead.recall_date || "",
    };
  }

  const client = chosen?.client || matched[0];
  const person = sanitizePersonName(client.first_name, client.last_name);
  return {
    centerId: client.center_id,
    clientId: client.id,
    leadId: client.id,
    firstName: person.firstName || "bonjour",
    lastName: person.lastName,
    phone: client.phone || phone,
    treatment: "",
    status: "Nouveau",
  };
}

async function loadCenterAppointments(supabase, centerId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date,starts_at,duration_minutes,status")
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
  }));
}

async function syncCrmFromSeyaIntent(supabase, centerId, context, text) {
  const update = crmUpdateFromLeadMessage(text, new Date());
  if (!update || !context.leadId) {
    return;
  }
  const current = String(context.status || "");
  if (
    lockedCrmStatuses().some(
      (status) => status.toLowerCase() === current.toLowerCase(),
    ) ||
    isCrmRelanceHold({
      status: current,
      recall_date: context.recall_date,
    })
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
}

async function bookSeyaAppointment(supabase, centerId, context, conversation, slot) {
  const [{ data: rooms }, { data: practitioners }] = await Promise.all([
    supabase.from("rooms").select("id").eq("center_id", centerId).limit(1),
    supabase.from("practitioners").select("id").eq("center_id", centerId).limit(1),
  ]);

  const start = slotTime(slot.time);
  const duration =
    Number(slot?.duration) > 0
      ? Number(slot.duration)
      : Number(conversation?.bookedSlot && conversation.bookedSlot.duration) > 0
        ? Number(conversation.bookedSlot.duration)
        : visitDurationMinutes(null, conversation, "");
  const [hours, minutes] = start.split(":").map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + duration;
  const endsAt = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const bookedDate = slotDate(conversation?.bookedSlot?.date);
  const today = new Date().toISOString().slice(0, 10);
  const fromDate =
    bookedDate && bookedDate < today ? bookedDate : today;

  const { data: existing } = await supabase
    .from("appointments")
    .select(
      "id,lead_id,client_id,starts_at,duration_minutes,status,appointment_date,notes,cancelled_at,status_history",
    )
    .eq("center_id", centerId)
    .gte("appointment_date", fromDate);
  const own = findOwnSeyaAppointment(existing, context, conversation);
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
    }));
  if (isSlotBusy(busy, slot.date, start, durationMinutes)) {
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
  } else if (conversation?.bookedSlot?.date && conversation?.bookedSlot?.time) {
    throw new Error("slot_missing");
  } else {
    const { error } = await supabase.from("appointments").insert({
      center_id: centerId,
      client_id: context.clientId || null,
      lead_id: context.leadId || null,
      room_id: rooms?.[0]?.id || null,
      practitioner_id: practitioners?.[0]?.id || null,
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

  if (context.leadId) {
    await supabase
      .from("leads")
      .update({
        status: "RDV pris",
        next_action: "RDV Seya à confirmer",
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.leadId);

    await supabase.from("lead_events").insert({
      center_id: centerId,
      lead_id: context.leadId,
      event_type: "status",
      from_value: context.status || "",
      to_value: "RDV pris",
      note: own?.id
        ? `RDV Seya décalé au ${slot.label}.`
        : `RDV Seya posé le ${slot.label}.`,
    });
  }
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
  return pickApprovedTemplate(templates, family);
}

async function sendTemplateMessage(phoneNumberId, token, intl, template, vars) {
  const count = templateVarCount(template);
  const parameters = [vars.firstName, vars.centerName, vars.treatment]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const padded = [
    parameters[0] || "bonjour",
    parameters[1] || "notre centre",
    parameters[2] || "votre soin",
  ].slice(0, Math.max(count, 0));

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

async function sendSharedWhatsApp(phone, text, extras = {}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { sent: false, reason: "not_connected" };
  }

  const intl = toWhatsAppIntl(phone);
  const vars = welcomeTemplateVars(extras);

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
handler.outgoingWhatsAppTexts = outgoingWhatsAppTexts;
handler.replaceDraftWithSent = replaceDraftWithSent;
handler.isTemplateRequired = isTemplateRequired;
handler.welcomeTemplateVars = welcomeTemplateVars;
handler.extractIncomingMessages = extractIncomingMessages;
handler.coalesceIncoming = coalesceIncoming;
handler.alreadyHandledInbound = alreadyHandledInbound;
handler.inboundTextFromWhatsApp = inboundTextFromWhatsApp;
handler.sendWithRetry = sendWithRetry;
handler.isRetryableSend = isRetryableSend;
module.exports = handler;
