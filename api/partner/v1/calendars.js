const { createServiceClient, rateLimit } = require("../../appointments/service");
const {
  authenticatePartner,
  loadCenterTimezones,
  rejectNonGet,
  sendError,
  PartnerApiError,
} = require("../_lib");

/** GET /api/partner/v1/calendars — agendas (centres) et cabines autorisés pour la clé. */
function createCalendarsHandler({ createSupabase = createServiceClient, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (rejectNonGet(req, res)) {
      return;
    }
    try {
      const supabase = createSupabase();
      const access = await authenticatePartner(supabase, req, now());
      if (!rateLimit(`partner:${access.id}`, 120, 60_000)) {
        throw new PartnerApiError(429, "too_many_requests", "Trop de requêtes, réessayez dans une minute.");
      }
      const centers = await loadCenterTimezones(supabase, access.centerIds);
      let rooms = supabase
        .from("rooms")
        .select("id,center_id,name,is_active")
        .in("center_id", access.centerIds)
        .eq("is_active", true);
      if (access.roomIds) {
        rooms = rooms.in("id", access.roomIds);
      }
      const { data: roomRows, error } = await rooms.order("display_order", { ascending: true });
      if (error) {
        throw new PartnerApiError(500, "calendars_unavailable", "Agendas indisponibles.");
      }
      const data = access.centerIds
        .filter((id) => centers.has(id))
        .map((id) => ({
          id,
          name: centers.get(id).name,
          timezone: centers.get(id).timezone,
          rooms: (roomRows || [])
            .filter((room) => String(room.center_id) === id)
            .map((room) => ({ id: String(room.id), name: String(room.name || "") })),
        }));
      return res.status(200).json({ data });
    } catch (error) {
      if (!(error instanceof PartnerApiError)) {
        console.error("[partner/calendars]", error instanceof Error ? error.message : error);
      }
      return sendError(res, error);
    }
  };
}

module.exports = createCalendarsHandler();
module.exports.createCalendarsHandler = createCalendarsHandler;
