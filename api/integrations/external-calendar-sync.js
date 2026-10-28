const { createServiceClient } = require("../appointments/service");
const { runConnectionSync } = require("./_external-calendar/sync");

/**
 * POST /api/integrations/external-calendar-sync — lit les rendez-vous des agendas partenaires
 * pour les connexions activées. Réservé au serveur (Authorization: Bearer CRON_SECRET).
 * Optionnel : ?connection_id=… pour une seule connexion.
 */
function createSyncHandler({ createSupabase = createServiceClient, env = process.env, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const secret = String(env.CRON_SECRET || "");
    if (!secret || String(req.headers?.authorization || "") !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const supabase = createSupabase();
    let query = supabase
      .from("external_calendar_connections")
      .select("id,center_id,provider,base_url,secret_env,mode,enabled,last_synced_at")
      .eq("enabled", true);
    const connectionId = String(req.query?.connection_id || "").trim();
    if (connectionId) {
      query = query.eq("id", connectionId);
    }
    const { data: connections, error } = await query;
    if (error) {
      console.error("[integrations/external-calendar-sync]", error.message);
      return res.status(500).json({ error: "connections_unavailable" });
    }

    const results = [];
    for (const connection of connections || []) {
      try {
        results.push({ ok: true, ...(await runConnectionSync(supabase, connection, { env, now: now() })) });
      } catch (syncError) {
        const code = syncError?.code || "sync_failed";
        const message = syncError instanceof Error ? syncError.message : String(syncError);
        await supabase
          .from("external_calendar_connections")
          .update({ last_error: `${code}: ${message}`.slice(0, 500), updated_at: now().toISOString() })
          .eq("id", connection.id);
        results.push({
          ok: false,
          connectionId: connection.id,
          error: code,
          ...(syncError?.details?.pending ? { pending: syncError.details.pending } : {}),
        });
      }
    }
    return res.status(200).json({ ok: true, results });
  };
}

module.exports = createSyncHandler();
module.exports.createSyncHandler = createSyncHandler;
