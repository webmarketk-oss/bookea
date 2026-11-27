const { createServiceClient, parsePayload } = require("../appointments/service");
const {
  buildClientCard,
  isMissingSchema,
  loadEvents,
  loadProgram,
  movementLabel,
  redeemStoredReward,
  saveProgram,
  syncStoredAppointment,
} = require("./loyalty-store");

function bearer(req) {
  return String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function access(supabase, req, centerId) {
  const token = bearer(req);
  if (!token || !centerId) {
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) {
    return null;
  }
  const [{ data: admin }, { data: member }] = await Promise.all([
    supabase
      .from("bookea_admins")
      .select("profile_id")
      .eq("profile_id", userId)
      .maybeSingle(),
    supabase
      .from("center_members")
      .select("profile_id,role,is_active")
      .eq("center_id", centerId)
      .eq("profile_id", userId)
      .maybeSingle(),
  ]);
  if (admin?.profile_id) {
    return { userId, manager: true };
  }
  if (!member?.profile_id || member.is_active === false) {
    return null;
  }
  return {
    userId,
    manager: member.role === "owner" || member.role === "manager",
  };
}

function searchText(value) {
  return String(value || "")
    .replace(/[%_,.()"'\\]/g, " ")
    .trim()
    .slice(0, 60);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const supabase = createServiceClient();
    const payload = req.method === "GET" ? req.query || {} : parsePayload(req.body);
    const centerId = String(payload.centerId || "").trim();
    const member = await access(supabase, req, centerId);
    if (!member) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    if (req.method === "GET") {
      const loaded = await loadProgram(supabase, centerId);
      const clientId = String(payload.clientId || "").trim();
      const query = searchText(payload.q);
      if (clientId) {
        const { data: client } = await supabase
          .from("clients")
          .select("id,first_name,last_name")
          .eq("id", clientId)
          .eq("center_id", centerId)
          .maybeSingle();
        if (!client) {
          return res.status(404).json({ ok: false, error: "client_not_found" });
        }
        const events = await loadEvents(supabase, centerId, clientId);
        return res.status(200).json({
          ok: true,
          program: loaded.program,
          client,
          history: [...events].reverse().map((event) => ({
            id: event.id,
            at: event.at,
            points: event.points,
            label: event.kind
              ? movementLabel(event)
              : `${event.reason} ${event.points > 0 ? `+${event.points}` : event.points}`,
          })),
        });
      }
      let clients = [];
      if (query.length >= 2) {
        const { data } = await supabase
          .from("clients")
          .select("id,first_name,last_name,phone")
          .eq("center_id", centerId)
          .or(
            `first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`,
          )
          .limit(8);
        clients = data || [];
      }
      return res.status(200).json({
        ok: true,
        program: loaded.program,
        clients,
      });
    }

    const action = String(payload.action || "").trim();
    if (action === "save") {
      if (!member.manager) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      const program = await saveProgram(supabase, centerId, payload.program);
      return res.status(200).json({ ok: true, program });
    }

    if (action === "sync") {
      const appointmentId = String(payload.appointmentId || "").trim();
      const { data: appointment, error } = await supabase
        .from("appointments")
        .select("id,center_id,client_id,status,notes")
        .eq("id", appointmentId)
        .eq("center_id", centerId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!appointment?.client_id) {
        return res.status(404).json({ ok: false, error: "appointment_not_found" });
      }
      const result = await syncStoredAppointment(
        supabase,
        appointment,
        payload.previousStatus,
        payload.status || appointment.status,
      );
      return res.status(200).json(result);
    }

    if (action === "redeem") {
      const requestId = String(payload.requestId || "").trim();
      const { data: request, error: requestError } = await supabase
        .from("loyalty_reward_requests")
        .select("center_id")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError) {
        throw requestError;
      }
      if (!request) {
        return res.status(404).json({ ok: false, error: "request_not_found" });
      }
      if (request.center_id !== centerId) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      const result = await redeemStoredReward(
        supabase,
        requestId,
        payload.servicePrice,
      );
      if (result && result.ok === false) {
        return res.status(409).json(result);
      }
      return res.status(200).json(result);
    }

    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (error) {
    const status = isMissingSchema(error) ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: status === 503 ? "loyalty_not_ready" : "loyalty_failed",
      message:
        status === 503
          ? "Le programme de fidélité n’est pas encore activé sur la base."
          : error.message || "loyalty_failed",
    });
  }
};
