const { createClient } = require("@supabase/supabase-js");
const {
  agentSettings,
  lastLeadAt,
  lastSeyaAt,
  message,
  persistableConversations,
  relanceCopy,
} = require("./agent");
const { isWelcomeDue, sendDueWelcomes } = require("./welcome");
const { backfillCenterConversations } = require("./conversation-mirror");
const { sendSharedWhatsApp } = require("./whatsapp");
const { isNearDuplicate } = require("./price");
const {
  closeConversationForCrmStatus,
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
  closesAfterOffer,
  refusedInThread,
} = require("./conversation");
const { isSeyaOff, readCenterSeya, writeSeyaConversations } = require("./store");
const { isSameSeyaConversation } = require("./conversation-key");
const { activeLeadPause, withLeadPause } = require("./lead-pause");
const { sendCallbackHandoff, teamHandoffRetryDue } = require("./center-notify");
const {
  conversationOnRelanceHold,
  crmRecallDayFor,
  loadRelanceHoldKeys,
  markMessagedNouveauLeads,
  markSeyaBookedLeads,
  syncCrmFromConversation,
  withCrmSnapshot,
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
      .select("id,name,email");
    if (error) {
      throw new Error(error.message);
    }

    const now = new Date();
    const fullPass = isFullRelancePass(now, req);
    const sent = [];
    for (const row of centers || []) {
      const latest = await readCenterSeya(supabase, row.id);
      const conversations = Array.isArray(latest.seya.conversations)
        ? latest.seya.conversations
        : [];
      if (conversations.length === 0) {
        continue;
      }
      await backfillCenterConversations(supabase, row.id, conversations);
      const center = { ...row, settings: latest.settings };
      const welcomeDue = conversations.some((item) => isWelcomeDue(item, now));
      const welcomed = welcomeDue
        ? await sendDueWelcomes(supabase, center, undefined, now, latest)
        : [];
      sent.push(...welcomed.map((item) => ({ ...item, kind: "welcome" })));
      if (!fullPass) {
        continue;
      }
      // Les messages d’accueil ont pu réécrire les conversations : relecture seulement dans ce cas.
      const result = await relanceCenter(supabase, center, now, welcomeDue ? null : latest);
      sent.push(...result);
    }

    return res
      .status(200)
      .json({ ok: true, fullPass, sent: sent.length, results: sent });
  } catch (error) {
    console.error("[seya/relance]", error);
    return res.status(500).json({ error: "relance_failed" });
  }
};

// Accueils chaque minute (délai de 4 min) ; relances et synchro CRM, à l’échelle du jour, toutes les 5 min.
const FULL_PASS_EVERY_MINUTES = 5;

function isFullRelancePass(now, req) {
  const forced = String(req?.query?.full || "") === "1";
  return forced || now.getUTCMinutes() % FULL_PASS_EVERY_MINUTES === 0;
}

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

async function relanceCenter(supabase, center, now = new Date(), preloaded = null) {
  const latest = preloaded || (await readCenterSeya(supabase, center.id));
  const seya = latest.seya;
  const agent = agentSettings(seya);
  const retried = await retryTeamHandoffs(
    center,
    seya,
    Array.isArray(seya.conversations) ? seya.conversations : [],
    now,
  );
  const conversations = retried.conversations;
  if (!agent.relanceEnabled || isSeyaOff(seya)) {
    await syncCrmStatusOnly(supabase, center.id, conversations, now, retried.changed);
    return [];
  }

  await markMessagedNouveauLeads(supabase, center.id, conversations);
  const nextConversations = [];
  const sent = [];
  const bookedKeys = await loadBookedVisitKeys(supabase, center.id);
  const crmHold = await loadRelanceHoldKeys(supabase, center.id, now);
  await markSeyaBookedLeads(supabase, center.id, crmHold, now);
  let closed = retried.changed;

  for (const conversation of conversations) {
    const synced = await syncCrmFromConversation(
      supabase,
      center.id,
      conversation,
      crmHold,
    );
    let updated = { ...synced };
    if (
      updated.status !== conversation.status ||
      crmSnapshotChanged(updated, conversation)
    ) {
      closed = true;
    }
    const pause = activeLeadPause(conversation);
    if (pause && !conversation.leadPause) {
      updated = withLeadPause(updated, pause);
      closed = true;
    }
    const bookedVisit = conversationMatchesBookedVisit(conversation, bookedKeys);
    if (conversationHasStaffBooking(conversation) || bookedVisit) {
      const shouldSeal =
        bookedVisit ||
        threadHasConfirmedVisit(conversation) ||
        conversation?.bookingState?.appointmentStatus === "confirmed" ||
        Boolean(conversation?.bookedSlot);
      const sealed = withCrmSnapshot(
        shouldSeal ? sealConfirmedConversation(conversation) : updated,
        crmHold,
      );
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
    if (isSeyaOff(current.seya) || !stillDueForRelance(current.seya, conversation, crmHold)) {
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

function crmSnapshotChanged(next, previous) {
  return (
    next.crmStatus !== previous.crmStatus ||
    (next.crmRecallDate || null) !== (previous.crmRecallDate || null)
  );
}

async function retryTeamHandoffs(center, seya, conversations, now = new Date()) {
  let changed = false;
  const next = [];
  for (const conversation of conversations) {
    if (!teamHandoffRetryDue(conversation, now)) {
      next.push(conversation);
      continue;
    }
    next.push(await sendCallbackHandoff({ center, seya, conversation, now }));
    changed = true;
  }
  return { conversations: next, changed };
}

async function syncCrmStatusOnly(supabase, centerId, conversations, now = new Date(), force = false) {
  const crmHold = await loadRelanceHoldKeys(supabase, centerId, now);
  await markSeyaBookedLeads(supabase, centerId, crmHold, now);
  if (!conversations.length) {
    return;
  }
  let changed = force;
  const next = conversations.map((conversation) => {
    const stamped = withCrmSnapshot(conversation, crmHold);
    const closed = closeConversationForCrmStatus(stamped, stamped?.crmStatus);
    if (closed !== conversation) {
      changed = true;
    }
    return closed;
  });
  if (changed) {
    await writeSeyaConversations(supabase, centerId, persistableConversations(next));
  }
}

function leadMessageCount(conversation) {
  return (conversation?.messages || []).filter((item) => item.author === "lead").length;
}

function stillDueForRelance(seya, conversation, crmHold) {
  const fresh = (Array.isArray(seya?.conversations) ? seya.conversations : []).find((item) =>
    isSameSeyaConversation(item, conversation),
  );
  if (!fresh) {
    return true;
  }
  return (
    leadMessageCount(fresh) === leadMessageCount(conversation) &&
    !shouldSkipRelance(fresh, { crmHold })
  );
}

const HEALTH_REVIEWED_NOTE = /^Vérification santé faite\. Seya peut reprendre la conversation\.$/;

function shouldSkipRelance(conversation, extras = {}) {
  const status = String(conversation?.status || "");
  if (activeLeadPause(conversation)) {
    return true;
  }
  if (conversation?.teamHandoff?.status === "failed") {
    return true;
  }
  if (conversationOnRelanceHold(conversation, extras.crmHold)) {
    return true;
  }
  const messages = conversation?.messages || [];
  const lastHuman = [...messages]
    .reverse()
    .find(
      (item) =>
        item.author === "lead" ||
        (item.author === "centre" && !HEALTH_REVIEWED_NOTE.test(String(item.text || ""))),
    );
  if (lastHuman?.author === "centre") {
    return true;
  }
  if (threadIsPaused(conversation) || isCentrePause(lastHuman?.text || "")) {
    return true;
  }
  const lastLeadIndex = messages.lastIndexOf(lastHuman);
  if (
    lastHuman?.author === "lead" &&
    (closesAfterOffer(lastHuman.text || "", { messages: messages.slice(0, lastLeadIndex) }) ||
      isWillComeBack(lastHuman.text || "") ||
      isWillCallBack(lastHuman.text || "") ||
      isOutOfZone(lastHuman.text || "") ||
      isThreadComplaint(lastHuman.text || ""))
  ) {
    return true;
  }
  const leadTexts = messages.filter((item) => item.author === "lead");
  if (refusedInThread(conversation) || leadTexts.some((item) => isOutOfZone(item.text || ""))) {
    return true;
  }
  if (
    conversation?.bookingState?.pendingQuestion === "callback" ||
    conversation?.teamNotes?.handedOffAt ||
    conversation?.teamHandoff?.status === "sent"
  ) {
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

function roundAfterRecall(conversation, now, recallStart, days) {
  const lastRelance = Date.parse(conversation.lastRelanceAt || "");
  const sentAfter =
    Number.isFinite(lastRelance) && lastRelance >= recallStart
      ? Number(conversation.relanceCount || 0)
      : 0;
  const sinceRecall = (now.getTime() - recallStart) / 86400000;
  const due = days.filter((day) => sinceRecall >= day).length;
  return due === sentAfter + 1 ? due : 0;
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

  const recall = crmRecallDayFor(conversation, extras.crmHold);
  const recallStart = recall ? Date.parse(`${recall}T00:00:00Z`) : NaN;
  if (Number.isFinite(recallStart) && !(lastLead && Date.parse(lastLead) >= recallStart)) {
    return roundAfterRecall(conversation, now, recallStart, days);
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

module.exports.isFullRelancePass = isFullRelancePass;
module.exports.shouldSkipRelance = shouldSkipRelance;
module.exports.relanceCenter = relanceCenter;
module.exports.stillDueForRelance = stillDueForRelance;
module.exports.pickRelanceRound = pickRelanceRound;
module.exports.hoursSince = hoursSince;
module.exports.isRelanceQuietHours = isRelanceQuietHours;
module.exports.parisHour = parisHour;
