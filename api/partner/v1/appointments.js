const { createServiceClient, rateLimit } = require("../../appointments/service");
const {
  authenticatePartner,
  listPartnerAppointments,
  parseAppointmentFilters,
  rejectNonGet,
  sendError,
  PartnerApiError,
} = require("../_lib");

/**
 * GET /api/partner/v1/appointments — rendez-vous des agendas autorisés pour la clé partenaire.
 * Filtres : calendar_id, room_id, from, to, updated_since, limit, cursor.
 */
function createAppointmentsHandler({ createSupabase = createServiceClient, now = () => new Date() } = {}) {
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
      const filters = parseAppointmentFilters(req.query || {}, access, { now: now() });
      const result = await listPartnerAppointments(supabase, filters);
      return res.status(200).json(result);
    } catch (error) {
      if (!(error instanceof PartnerApiError)) {
        console.error("[partner/appointments]", error instanceof Error ? error.message : error);
      }
      return sendError(res, error);
    }
  };
}

module.exports = createAppointmentsHandler();
module.exports.createAppointmentsHandler = createAppointmentsHandler;
