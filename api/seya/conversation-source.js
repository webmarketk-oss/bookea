/**
 * Source des conversations Seya, centre par centre : les réglages (par défaut) ou la table seya_conversations.
 * Un centre passe sur la table quand seya_conversation_backfills.read_source = 'table'.
 * En cas d'erreur de lecture de la table, on revient toujours aux réglages.
 */
const TABLE = "seya_conversations";
const MODES = "seya_conversation_backfills";
const MODE_CACHE_MS = 30 * 1000;
const TABLE_READ_LIMIT = 2000;

const modeCache = new Map();

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function readsFromTable(supabase, centerId) {
  const id = String(centerId || "");
  if (!id || typeof supabase?.from !== "function") {
    return false;
  }
  const cached = modeCache.get(id);
  if (cached && Date.now() - cached.at < MODE_CACHE_MS) {
    return cached.table;
  }
  let table = false;
  try {
    const query = supabase.from(MODES);
    if (typeof query?.select !== "function") {
      return false;
    }
    const { data, error } = await query
      .select("read_source")
      .eq("center_id", id)
      .maybeSingle();
    table = !error && data?.read_source === "table";
  } catch {
    table = false;
  }
  modeCache.set(id, { at: Date.now(), table });
  return table;
}

async function loadTableConversations(supabase, centerId, { limit = TABLE_READ_LIMIT } = {}) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("center_id", String(centerId))
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error("[seya/source] table read", error.message);
      return null;
    }
    return (data || [])
      .map((row) => asRecord(row?.data))
      .filter((item) => Object.keys(item).length > 0)
      .map((item) => ({ ...item, centerId: String(centerId) }));
  } catch (error) {
    console.error("[seya/source] table read", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Remplace seya.conversations par la table si le centre est basculé ; sinon renvoie seya tel quel. */
async function withConversationSource(supabase, centerId, seya) {
  const record = asRecord(seya);
  if (!(await readsFromTable(supabase, centerId))) {
    return record;
  }
  const conversations = await loadTableConversations(supabase, centerId);
  if (!conversations) {
    return record;
  }
  return { ...record, conversations };
}

/** Conversation la plus récente pour ce numéro, tous centres confondus (routage d'un contact inconnu du CRM). */
async function latestThreadForPhone(supabase, last9) {
  if (String(last9 || "").length < 9 || typeof supabase?.from !== "function") {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("center_id,data,last_activity_at")
      .eq("phone_last9", String(last9))
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error || !data?.length) {
      return null;
    }
    return {
      centerId: String(data[0].center_id),
      conversation: asRecord(data[0].data),
      at: String(data[0].last_activity_at || ""),
    };
  } catch {
    return null;
  }
}

/** Conversation déplacée vers un autre centre : sa copie ne doit plus apparaître dans le centre d'origine. */
async function removeMovedThreads(supabase, moved) {
  for (const item of moved || []) {
    const phone = String(item?.phone || "");
    if (phone.length < 9 || !item?.from || item.from === item.to) {
      continue;
    }
    try {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("center_id", String(item.from))
        .eq("phone_last9", phone);
      if (error) {
        console.error("[seya/source] moved thread cleanup", error.message);
      }
    } catch (error) {
      console.error("[seya/source] moved thread cleanup", error instanceof Error ? error.message : error);
    }
  }
}

function clearConversationSourceCache() {
  modeCache.clear();
}

module.exports = {
  clearConversationSourceCache,
  latestThreadForPhone,
  loadTableConversations,
  readsFromTable,
  removeMovedThreads,
  withConversationSource,
};
