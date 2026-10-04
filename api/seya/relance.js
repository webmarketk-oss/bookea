const { createClient } = require("@supabase/supabase-js");
const {
  agentSettings,
  isOptOut,
  lastLeadAt,
  lastSeyaAt,
  message,
  persistableConversations,
  relanceCopy,
} = require("./agent");
const { sendDueWelcomes } = require("./welcome");
const { sendSharedWhatsApp } = require("./whatsapp");
const { isNearDuplicate } = require("./price");
const {
  conversationHasStaffBooking,
  conversationMatchesBookedVisit,
  bookedVisitKeysFromAppointments,
  sealConfirmedConversation,
} = require("./booking-close");
const { threadHasConfirmedVisit } = require("./conversation");
const { isSeyaOff, readCenterSeya, writeSeyaConversations } = require("./store");
const {
  conversationOnRelanceHold,
  loadRelanceHoldKeys,
  markMessagedNouveauLeads,
} = require("./crm-sync");

const FIRST_RELANCE_HOURS = 15;
const FIRST_RELANCE_UNTIL_HOURS = 27;
const SECOND_RELANCE_HOURS = 24;
const SECOND_RELANCE_UNTIL_HOURS = 36;
const THIRD_RELANCE_HOURS = 5 * 24;
const THIRD_RELANCE_UNTIL_HOURS = 6 * 24;
const MIN_RELANCE_GAP_HOURS = 20;

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const supabase = createServiceClient();
    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,settings");
    if (error) {
      throw new Error(error.message);
    }

    const sent = [];
    for (const center of centers || []) {
      const welcomed = await sendDueWelcomes(supabase, center);
      sent.push(...welcomed.map((item) => ({ ...item, kind: "welcome" })));
      const result = await relanceCenter(supabase, center);
      sent.push(...result);
    }

    return res.status(200).json({ ok: true, sent: sent.length, results: sent });
  } catch (error) {
    console.error("[seya/relance]", error);
    return res.status(500).json({ error: "relance_failed" });
  }
};

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }
  return String(req.headers.authorization || "") === `Bearer ${secret}`;
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

async function relanceCenter(supabase, center) {
  const latest = await readCenterSeya(supabase, center.id);
  const seya = latest.seya;
  const agent = agentSettings(seya);
  if (!agent.relanceEnabled || isSeyaOff(seya)) {
    return [];
  }

  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  await markMessagedNouveauLeads(supabase, center.id, conversations);
  const nextConversations = [];
  const sent = [];
  const now = new Date();
  const bookedKeys = await loadBookedVisitKeys(supabase, center.id);
  const crmHold = await loadRelanceHoldKeys(supabase, center.id);
  let closed = false;

  for (const conversation of conversations) {
    const updated = { ...conversation };
    const bookedVisit = conversationMatchesBookedVisit(conversation, bookedKeys);
    if (conversationHasStaffBooking(conversation) || bookedVisit) {
      const shouldSeal =
        bookedVisit ||
        threadHasConfirmedVisit(conversation) ||
        conversation?.bookingState?.appointmentStatus === "confirmed" ||
        Boolean(conversation?.bookedSlot);
      const sealed = shouldSeal
        ? sealConfirmedConversation(conversation)
        : updated;
      if (sealed !== conversation) {
        closed = true;
      }
      nextConversations.push(sealed);
      continue;
    }
    const round = pickRelanceRound(conversation, now, { crmHold });
    if (!round) {
      nextConversations.push(updated);
      continue;
    }

    const current = await readCenterSeya(supabase, center.id);
    if (isSeyaOff(current.seya)) {
      nextConversations.push(updated);
      continue;
    }

    const text = relanceCopy(conversation, round, center.name, current.seya);
    const lastSeya = [...(conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text;
    if (!text || isNearDuplicate(text, lastSeya || "")) {
      nextConversations.push(updated);
      continue;
    }
    const result = await sendSharedWhatsApp(conversation.phone, text, {
      firstName: conversation.firstName,
      centerName: center.name,
      treatment:
        conversation.offerLabel ||
        conversation.qualification?.need ||
        conversation.treatment ||
        "",
      campaign: conversation.campaign || "",
      offerLabel: conversation.offerLabel || "",
    });

    if (result.sent) {
      updated.messages = [...(updated.messages || []), message("seya", text)];
      updated.lastRelanceAt = now.toISOString();
      updated.relanceCount = round;
      updated.updatedAt = updated.lastRelanceAt;
      const keepOffered = /horaire vu ensemble|convient toujours/.test(text);
      if (!keepOffered) {
        updated.proposedSlots = [];
        updated.bookingState = {
          ...(updated.bookingState || {}),
          lastOfferedSlots: [],
          weekHalf: null,
          dayPart: null,
          requestedDate: null,
          requestedWeekday: null,
          pendingQuestion: "offer_slots",
        };
      }
      sent.push({
        centerId: center.id,
        leadId: conversation.leadId,
        round,
        via: result.via || "whatsapp",
      });
    }

    nextConversations.push(updated);
  }

  if (sent.length > 0 || closed) {
    await writeSeyaConversations(
      supabase,
      center.id,
      persistableConversations(nextConversations),
    );
  }

  return sent;
}

function shouldSkipRelance(conversation, extras = {}) {
  const status = String(conversation?.status || "");
  if (conversationOnRelanceHold(conversation, extras.crmHold)) {
    return true;
  }
  const leadTexts = (conversation?.messages || []).filter(
    (item) => item.author === "lead",
  );
  if (leadTexts.some((item) => isOptOut(item.text || ""))) {
    return true;
  }
  const seyaTexts = (conversation?.messages || [])
    .filter((item) => item.author === "seya")
    .map((item) => String(item.text || ""));
  if (
    seyaTexts.length >= 2 &&
    isNearDuplicate(seyaTexts[seyaTexts.length - 1], seyaTexts[seyaTexts.length - 2])
  ) {
    return true;
  }
  if (conversationHasStaffBooking(conversation)) {
    return true;
  }
  return (
    conversation?.healthReview?.status === "awaiting_human_health_review" ||
    conversation?.bookingState?.pendingQuestion === "no_slots" ||
    /rdv pris|rdv confirm|terminé|termine|ferm[eé]|pas int[eé]ress|hors[- ]?zone|reviendra vers nous|recontacter|revue santé/i.test(
      status,
    )
  );
}

async function loadBookedVisitKeys(supabase, centerId) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("lead_id,status,appointment_date,clients(phone)")
      .eq("center_id", centerId)
      .gte("appointment_date", today);
    if (error) {
      throw new Error(error.message);
    }
    return bookedVisitKeysFromAppointments(data);
  } catch (error) {
    console.error("[seya/relance] booked visits lookup skipped", error);
    return new Set();
  }
}

function hoursSince(iso, now = new Date()) {
  if (!iso) {
    return 9999;
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return 9999;
  }
  return (now.getTime() - then) / 3600000;
}

function inWindow(hours, start, end) {
  return hours >= start && hours < end;
}

function pickRelanceRound(conversation, now = new Date(), extras = {}) {
  if (shouldSkipRelance(conversation, extras)) {
    return 0;
  }

  const lastLead = lastLeadAt(conversation);
  const lastRelance = conversation.lastRelanceAt;
  const repliedAfterRelance =
    lastLead && lastRelance && new Date(lastLead).getTime() > new Date(lastRelance).getTime();
  const already = repliedAfterRelance ? 0 : Number(conversation.relanceCount || 0);
  const anchor = lastLead || lastSeyaAt(conversation);
  const idle = hoursSince(anchor, now);
  const sinceRelance = hoursSince(lastRelance, now);

  if (!repliedAfterRelance && lastRelance && sinceRelance < MIN_RELANCE_GAP_HOURS) {
    return 0;
  }

  if (already >= 3) {
    return 0;
  }

  if (already === 0) {
    if (inWindow(idle, FIRST_RELANCE_HOURS, FIRST_RELANCE_UNTIL_HOURS)) {
      return 1;
    }
    if (inWindow(idle, THIRD_RELANCE_HOURS, THIRD_RELANCE_UNTIL_HOURS)) {
      return 3;
    }
    return 0;
  }

  if (already === 1) {
    if (inWindow(sinceRelance, SECOND_RELANCE_HOURS, SECOND_RELANCE_UNTIL_HOURS)) {
      return 2;
    }
    if (inWindow(idle, THIRD_RELANCE_HOURS, THIRD_RELANCE_UNTIL_HOURS)) {
      return 3;
    }
    return 0;
  }

  if (inWindow(idle, THIRD_RELANCE_HOURS, THIRD_RELANCE_UNTIL_HOURS)) {
    return 3;
  }
  return 0;
}

module.exports.shouldSkipRelance = shouldSkipRelance;
module.exports.pickRelanceRound = pickRelanceRound;
module.exports.hoursSince = hoursSince;
