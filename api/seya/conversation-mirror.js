/**
 * Copie des conversations Seya des réglages du centre vers la table seya_conversations.
 * Phase 1 : les réglages restent la source lue par Seya ; la copie ne doit jamais bloquer une écriture.
 */
const {
  last9Phone,
  lastActivityAt,
  persistableConversation,
} = require("./conversation-key");

const TABLE = "seya_conversations";
const BACKFILLS = "seya_conversation_backfills";
const BATCH_SIZE = 100;
const UNAVAILABLE_RETRY_MS = 10 * 60 * 1000;

let unavailableUntil = 0;
const backfilledCenters = new Set();

function isTableMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

// Même identité que la fusion des conversations : le numéro d'abord, puis le prospect, puis l'id.
function mirrorConversationKey(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const phone = last9Phone(item.phone);
  if (phone.length >= 9) {
    return `phone:${phone}`;
  }
  const leadId = String(item.leadId || "").trim();
  if (leadId) {
    return `lead:${leadId}`;
  }
  const id = String(item.id || "").trim();
  return id ? `id:${id}` : "";
}

function belongsToCenter(item, centerId) {
  const owner = String(item?.centerId || "").trim();
  return !owner || owner === String(centerId);
}

function validTimestamp(value) {
  const at = Date.parse(String(value || ""));
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function toMirrorRow(centerId, item) {
  const data = { ...persistableConversation(item), centerId: String(centerId) };
  const phone = last9Phone(data.phone);
  return {
    center_id: String(centerId),
    conversation_key: mirrorConversationKey(data),
    lead_id: String(data.leadId || "").trim() || null,
    phone_last9: phone.length >= 9 ? phone : null,
    first_name: String(data.firstName || "").trim() || null,
    last_name: String(data.lastName || "").trim() || null,
    status: String(data.status || "").trim() || null,
    message_count: asList(data.messages).length,
    last_activity_at: validTimestamp(lastActivityAt(data)),
    data,
    updated_at: new Date().toISOString(),
  };
}

// Une seule ligne par clé dans un même envoi : la plus récente l'emporte.
function uniqueRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (!row.conversation_key) {
      continue;
    }
    const current = byKey.get(row.conversation_key);
    if (
      !current ||
      String(row.last_activity_at || "") >= String(current.last_activity_at || "")
    ) {
      byKey.set(row.conversation_key, row);
    }
  }
  return [...byKey.values()];
}

function changedConversations(centerId, previousList, nextList) {
  const previous = new Map();
  for (const item of asList(previousList)) {
    if (belongsToCenter(item, centerId)) {
      previous.set(mirrorConversationKey(item), JSON.stringify(persistableConversation(item)));
    }
  }
  return asList(nextList).filter((item) => {
    if (!belongsToCenter(item, centerId)) {
      return false;
    }
    const key = mirrorConversationKey(item);
    return key && previous.get(key) !== JSON.stringify(persistableConversation(item));
  });
}

async function upsertMirrorRows(supabase, rows) {
  if (!rows.length || Date.now() < unavailableUntil || typeof supabase?.from !== "function") {
    return { ok: false, written: 0 };
  }
  let written = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const table = supabase.from(TABLE);
    if (typeof table?.upsert !== "function") {
      return { ok: false, written };
    }
    const { error } = await table.upsert(batch, { onConflict: "center_id,conversation_key" });
    if (error) {
      if (isTableMissing(error)) {
        unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
      } else {
        console.error("[seya/mirror] upsert", error.message);
      }
      return { ok: false, written };
    }
    written += batch.length;
  }
  return { ok: true, written };
}

/**
 * Centre lu dans la table : écrit chaque conversation modifiée sur sa ligne.
 * Une ligne déjà connue n'est remplacée que si personne ne l'a modifiée depuis la lecture
 * (versions = clé → updated_at lu) ; sinon { conflict: true } pour relire et recommencer.
 */
async function writeConversationRows(supabase, centerId, versions, changed) {
  const rows = uniqueRows(changed.map((item) => toMirrorRow(centerId, item)));
  for (const row of rows) {
    const known = versions.get(row.conversation_key);
    if (known) {
      const { data, error } = await supabase
        .from(TABLE)
        .update(row)
        .eq("center_id", String(centerId))
        .eq("conversation_key", row.conversation_key)
        .eq("updated_at", known)
        .select("id");
      if (error) {
        return { ok: false, conflict: false, error };
      }
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, conflict: true };
      }
      continue;
    }
    const { error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: "center_id,conversation_key" });
    if (error) {
      return { ok: false, conflict: false, error };
    }
  }
  return { ok: true, conflict: false, written: rows.length };
}

/** Après une écriture des réglages : copie seulement les conversations modifiées. */
async function mirrorConversationChanges(supabase, centerId, previousList, nextList) {
  try {
    const changed = changedConversations(centerId, previousList, nextList);
    if (!changed.length) {
      return { ok: true, written: 0 };
    }
    return await upsertMirrorRows(
      supabase,
      uniqueRows(changed.map((item) => toMirrorRow(centerId, item))),
    );
  } catch (error) {
    console.error("[seya/mirror]", error instanceof Error ? error.message : error);
    return { ok: false, written: 0 };
  }
}

/** Copie initiale de toutes les conversations d'un centre, une seule fois (marquée dans seya_conversation_backfills). */
async function backfillCenterConversations(supabase, centerId, conversations) {
  try {
    if (backfilledCenters.has(String(centerId))) {
      return { done: true, skipped: "already_done" };
    }
    if (Date.now() < unavailableUntil || typeof supabase?.from !== "function") {
      return { done: false, skipped: "unavailable" };
    }
    const { data: marker, error: markerError } = await supabase
      .from(BACKFILLS)
      .select("center_id")
      .eq("center_id", centerId)
      .maybeSingle();
    if (markerError) {
      if (isTableMissing(markerError)) {
        unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
      } else {
        console.error("[seya/mirror] backfill marker", markerError.message);
      }
      return { done: false, skipped: "marker_error" };
    }
    if (marker?.center_id) {
      backfilledCenters.add(String(centerId));
      return { done: true, skipped: "already_done" };
    }
    const rows = uniqueRows(
      asList(conversations)
        .filter((item) => belongsToCenter(item, centerId))
        .map((item) => toMirrorRow(centerId, item)),
    );
    const result = await upsertMirrorRows(supabase, rows);
    if (!result.ok && rows.length) {
      return { done: false, skipped: "write_failed" };
    }
    const { error: doneError } = await supabase
      .from(BACKFILLS)
      .upsert(
        { center_id: centerId, conversation_count: rows.length, done_at: new Date().toISOString() },
        { onConflict: "center_id" },
      );
    if (doneError) {
      console.error("[seya/mirror] backfill done", doneError.message);
      return { done: false, skipped: "marker_write_failed" };
    }
    backfilledCenters.add(String(centerId));
    return { done: true, written: rows.length };
  } catch (error) {
    console.error("[seya/mirror] backfill", error instanceof Error ? error.message : error);
    return { done: false, skipped: "error" };
  }
}

function resetMirrorAvailability() {
  unavailableUntil = 0;
  backfilledCenters.clear();
}

module.exports = {
  backfillCenterConversations,
  changedConversations,
  mirrorConversationChanges,
  mirrorConversationKey,
  resetMirrorAvailability,
  toMirrorRow,
  uniqueRows,
  writeConversationRows,
};
