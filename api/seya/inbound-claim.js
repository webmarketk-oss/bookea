/* eslint-disable @typescript-eslint/no-require-imports */

const { asRecord, mutateCenterSettings } = require("./settings-write");

const RECEIPTS = "seya_inbound_receipts";
const PROCESSING_MS = 10 * 60 * 1000;
const CLAIM_KEEP_MS = 24 * 60 * 60 * 1000;
const CLAIM_KEEP_COUNT = 80;

function isUniqueViolation(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "23505" || /duplicate key/i.test(message);
}

function isClaimUnavailable(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    /does not exist|schema cache|could not find the table|relation .* does not exist/i.test(
      message,
    )
  );
}

function canTakeOver(current, now = Date.now()) {
  if (!current || typeof current !== "object") {
    return true;
  }
  if (current.status === "failed") {
    return true;
  }
  const at = Date.parse(current.at || "");
  if (!Number.isFinite(at)) {
    return true;
  }
  return current.status === "processing" && now - at >= PROCESSING_MS;
}

function pruneClaims(claims, now = Date.now()) {
  const entries = Object.entries(asRecord(claims)).filter(([, value]) => {
    const at = Date.parse(value?.at || "");
    return Number.isFinite(at) && now - at < CLAIM_KEEP_MS;
  });
  entries.sort((left, right) => Date.parse(right[1].at) - Date.parse(left[1].at));
  return Object.fromEntries(entries.slice(0, CLAIM_KEEP_COUNT));
}

async function claimInboundInSettings(supabase, { messageId, centerId }) {
  const id = String(messageId || "").trim();
  let decision = "duplicate";
  try {
    const result = await mutateCenterSettings(supabase, centerId, (settings) => {
      const seya = asRecord(settings.seya);
      const claims = pruneClaims(seya.inboundClaims);
      if (claims[id] && !canTakeOver(claims[id])) {
        decision = "duplicate";
        return settings;
      }
      decision = "claimed";
      return {
        ...settings,
        seya: {
          ...seya,
          inboundClaims: pruneClaims({
            ...claims,
            [id]: { status: "processing", at: new Date().toISOString() },
          }),
        },
      };
    });
    if (decision === "claimed" && result?.changed) {
      return { state: "claimed", via: "settings" };
    }
    return { state: "duplicate", via: "settings" };
  } catch (error) {
    console.error(
      "[seya/inbound] claim",
      error instanceof Error ? error.message : "claim_failed",
    );
    return { state: "unavailable" };
  }
}

async function finishSettingsClaim(supabase, centerId, messageId, status) {
  const id = String(messageId || "").trim();
  if (!id || !centerId) {
    return;
  }
  const next = status === "failed" ? "failed" : "sent";
  await mutateCenterSettings(supabase, centerId, (settings) => {
    const seya = asRecord(settings.seya);
    const claims = pruneClaims(seya.inboundClaims);
    if (!claims[id]) {
      return settings;
    }
    return {
      ...settings,
      seya: {
        ...seya,
        inboundClaims: {
          ...claims,
          [id]: { status: next, at: new Date().toISOString() },
        },
      },
    };
  });
}

async function claimInboundMessage(supabase, { messageId, centerId } = {}) {
  const id = String(messageId || "").trim();
  if (!id || !centerId || typeof supabase?.from !== "function") {
    return { state: "skip" };
  }
  const now = new Date().toISOString();
  const inserted = await supabase
    .from(RECEIPTS)
    .insert({
      message_id: id,
      center_id: centerId,
      status: "processing",
      created_at: now,
      updated_at: now,
    })
    .select("message_id")
    .maybeSingle();

  if (!inserted?.error) {
    return { state: "claimed", via: "table" };
  }
  if (isClaimUnavailable(inserted.error)) {
    return claimInboundInSettings(supabase, { messageId: id, centerId });
  }
  if (!isUniqueViolation(inserted.error)) {
    return claimInboundInSettings(supabase, { messageId: id, centerId });
  }

  const existing = await supabase
    .from(RECEIPTS)
    .select("message_id,status,updated_at")
    .eq("message_id", id)
    .maybeSingle();
  if (existing?.error || !existing?.data) {
    return { state: "duplicate" };
  }

  const status = String(existing.data.status || "");
  const updatedAt = Date.parse(existing.data.updated_at || "");
  const stale =
    status === "failed" ||
    (status === "processing" &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt >= PROCESSING_MS);
  if (!stale) {
    return { state: "duplicate", via: "table" };
  }

  const taken = await supabase
    .from(RECEIPTS)
    .update({ status: "processing", updated_at: now })
    .eq("message_id", id)
    .eq("status", status)
    .select("message_id");
  if (taken?.error || !Array.isArray(taken.data) || !taken.data.length) {
    return { state: "duplicate", via: "table" };
  }
  return { state: "claimed", via: "table" };
}

async function finishInboundClaim(supabase, messageId, status) {
  const id = String(messageId || "").trim();
  if (!id || typeof supabase?.from !== "function") {
    return;
  }
  const next = status === "failed" ? "failed" : "sent";
  await supabase
    .from(RECEIPTS)
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("message_id", id);
}

async function settleInboundClaim(supabase, trace) {
  if (!trace || trace.inboundClaim !== "claimed" || trace.claimSettled) {
    return;
  }
  trace.claimSettled = true;
  const status = trace.sentTexts?.length || trace.claimHandled ? "sent" : "failed";
  const finish =
    trace.claimVia === "settings"
      ? finishSettingsClaim(supabase, trace.centerId, trace.claimMessageId, status)
      : finishInboundClaim(supabase, trace.claimMessageId, status);
  await finish.catch((error) => {
    console.error(
      "[seya/inbound] claim settle",
      error instanceof Error ? error.message : "settle_failed",
    );
  });
}

module.exports = {
  claimInboundMessage,
  finishInboundClaim,
  settleInboundClaim,
};
