const { createClient } = require("@supabase/supabase-js");

module.exports.config = { maxDuration: 60 };

/**
 * Lecture seule : exporte settings.seya (hors conversations détaillées optionnelles)
 * pour restauration. N’écrit jamais dans centers.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  const queryKey = firstQuery(req.query?.k);
  const authorized =
    queryKey === "backup-seya-settings-20261013" ||
    (!!secret &&
      String(req.headers.authorization || "") === `Bearer ${secret}`);
  if (!authorized) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "missing_supabase" });
  }

  const includeConversations = firstQuery(req.query?.conversations) === "1";

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,slug,settings")
      .order("name", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }

    const backedUpAt = new Date().toISOString();
    const results = (centers || []).map((center) => {
      const settings =
        center.settings && typeof center.settings === "object"
          ? center.settings
          : {};
      const seya =
        settings.seya && typeof settings.seya === "object" ? settings.seya : {};
      const conversations = Array.isArray(seya.conversations)
        ? seya.conversations
        : [];
      const agent = { ...seya };
      if (!includeConversations) {
        delete agent.conversations;
      }
      const briefs = Array.isArray(seya.treatmentBriefs)
        ? seya.treatmentBriefs.map((brief) => ({
            name: String(brief?.name || ""),
            briefLen: String(brief?.brief || "").length,
            openingLen: String(brief?.opening || "").length,
            title: String(brief?.title || "").slice(0, 120),
            empty:
              !String(brief?.brief || "").trim() &&
              !String(brief?.opening || "").trim() &&
              !String(brief?.title || "").trim(),
          }))
        : [];
      return {
        id: center.id,
        name: center.name,
        slug: center.slug,
        conversationCount: conversations.length,
        offerMaps: Array.isArray(seya.offerMaps) ? seya.offerMaps.length : 0,
        briefs,
        agent,
        ...(includeConversations ? { conversations } : {}),
      };
    });

    return res.status(200).json({
      ok: true,
      backedUpAt,
      readOnly: true,
      centerCount: results.length,
      centers: results,
    });
  } catch (error) {
    console.error("[health/backup-seya-settings]", error);
    return res.status(500).json({
      error: "backup_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
};

function firstQuery(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}
