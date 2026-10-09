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
const {
  isOutOfZone,
  isWillCallBack,
  isWillComeBack,
  isThreadComplaint,
  isCentrePause,
  threadIsPaused,
  threadHasConfirmedVisit,
} = require("./conversation");
const { isSeyaOff, readCenterSeya, writeSeyaConversations } = require("./store");
const {
  conversationOnRelanceHold,
  loadRelanceHoldKeys,
  markMessagedNouveauLeads,
  syncCrmFromConversation,
} = require("./crm-sync");

const MIN_RELANCE_GAP_HOURS = 12;
const RELANCE_QUIET_START_HOUR = 20;
const RELANCE_QUIET_END_HOUR = 7;
const DEFAULT_RELANCE_DAYS = [1, 5, 14];

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
    const synced = await syncCrmFromConversation(
      supabase,
      center.id,
      conversation,
      crmHold,
    );
    const updated = { ...synced };
    if (updated.status !== conversation.status) {
      closed = true;
    }
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
    const round = pickRelanceRound(conversation, now, {
      crmHold,
      relances: agent.relances,
    });
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
  const messages = conversation?.messages || [];
  const lastHuman = [...messages]
    .reverse()
    .find((item) => item.author === "lead" || item.author === "centre");
  if (lastHuman?.author === "centre") {
    return true;
  }
  if (threadIsPaused(conversation) || isCentrePause(lastHuman?.text || "")) {
    return true;
  }
  if (
    lastHuman?.author === "lead" &&
    (isWillComeBack(lastHuman.text || "") ||
      isWillCallBack(lastHuman.text || "") ||
      isOutOfZone(lastHuman.text || "") ||
      isThreadComplaint(lastHuman.text || ""))
  ) {
    return true;
  }
  const leadTexts = messages.filter((item) => item.author === "lead");
  if (leadTexts.some((item) => isOptOut(item.text || "") || isOutOfZone(item.text || ""))) {
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
    /rdv pris|rdv confirm|terminé|termine|ferm[eé]|pas int[eé]ress|hors[- ]?zone|reviendra vers nous|intraitable|contre[- ]?indication|recontacter|revue santé/i.test(
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

function firstSeyaAt(conversation) {
  const first = (conversation?.messages || []).find((item) => item.author === "seya");
  return first?.at || conversation?.updatedAt || null;
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

function relanceAfterDays(extras = {}) {
  const rows = Array.isArray(extras.relances) ? extras.relances : [];
  return [0, 1, 2].map((index) => {
    const day = Math.floor(Number(rows[index]?.afterDays));
    return Number.isFinite(day) && day > 0 ? Math.min(365, day) : DEFAULT_RELANCE_DAYS[index];
  });
}

function parisHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((item) => item.type === "hour")?.value || 0);
}

function isRelanceQuietHours(now = new Date()) {
  const hour = parisHour(now);
  return hour >= RELANCE_QUIET_START_HOUR || hour < RELANCE_QUIET_END_HOUR;
}

function pickRelanceRound(conversation, now = new Date(), extras = {}) {
  if (isRelanceQuietHours(now) || shouldSkipRelance(conversation, extras)) {
    return 0;
  }

  const lastLead = lastLeadAt(conversation);
  const lastRelance = conversation.lastRelanceAt;
  const repliedAfterRelance =
    lastLead && lastRelance && new Date(lastLead).getTime() > new Date(lastRelance).getTime();
  const already = repliedAfterRelance ? 0 : Number(conversation.relanceCount || 0);
  const origin = lastLead || firstSeyaAt(conversation) || lastSeyaAt(conversation);
  const idleDays = hoursSince(origin, now) / 24;
  const sinceRelance = hoursSince(lastRelance, now);
  const days = relanceAfterDays(extras);

  if (!repliedAfterRelance && lastRelance && sinceRelance < MIN_RELANCE_GAP_HOURS) {
    return 0;
  }

  if (already >= 3) {
    return 0;
  }

  if (already === 0 && idleDays >= days[0]) {
    return 1;
  }
  if (already === 1 && idleDays >= days[1]) {
    return 2;
  }
  if (already === 2 && idleDays >= days[2]) {
    return 3;
  }
  return 0;
}

module.exports.shouldSkipRelance = shouldSkipRelance;
module.exports.pickRelanceRound = pickRelanceRound;
module.exports.hoursSince = hoursSince;
module.exports.isRelanceQuietHours = isRelanceQuietHours;
module.exports.parisHour = parisHour;
