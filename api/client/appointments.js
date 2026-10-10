const { createServiceClient, parsePayload, rateLimit } = require("../appointments/service");
const { APPOINTMENT_SELECT } = require("../appointments/issue");
const { applyAction } = require("../appointments/confirm");
const {
  applyReschedule,
  canRescheduleState,
  isDateTimeValid,
  listRescheduleDays,
} = require("../appointments/reschedule");
const { loadAccount, requireUser } = require("./account");
const { readConfirmationState } = require("../appointments/token-utils");

const ROW_SELECT = `${APPOINTMENT_SELECT},
  centers(id,name,email,settings),
  services(name),
  clients(first_name,last_name)`;

async function loadOwnedAppointment(supabase, account, appointmentId) {
  const id = String(appointmentId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const clientIds = (account.centers || [])
    .map((center) => center.clientId)
    .filter(Boolean);
  if (!clientIds.length) {
    return null;
  }
  const { data, error } = await supabase
    .from("appointments")
    .select(ROW_SELECT)
    .eq("id", id)
    .in("client_id", clientIds)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
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
    const user = await requireUser(supabase, req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!rateLimit(`client-apt:${user.id}`, 20, 60_000)) {
      return res.status(429).json({ ok: false, error: "too_many_requests" });
    }

    const payload = req.method === "GET" ? req.query : parsePayload(req.body);
    const appointmentId = String(payload.appointmentId || payload.id || "").trim();
    const account = await loadAccount(supabase, user);
    const row = await loadOwnedAppointment(supabase, account, appointmentId);
    if (!row) {
      return res.status(404).json({ ok: false, error: "appointment_not_found" });
    }

    if (req.method === "GET") {
      const days = await listRescheduleDays(supabase, row);
      return res.status(200).json({
        ok: true,
        canReschedule: canRescheduleState(readConfirmationState(row)),
        days,
      });
    }

    const action = String(payload.action || "").trim();
    if (action === "cancel") {
      const state = await applyAction(supabase, row, "cancel", "public_bookea");
      return res.status(200).json({ ok: true, state });
    }
    if (action === "reschedule") {
      const date = String(payload.date || "").slice(0, 10);
      const time = String(payload.time || "").slice(0, 5);
      if (!isDateTimeValid(date, time)) {
        return res.status(400).json({ ok: false, error: "invalid_slot" });
      }
      const days = await listRescheduleDays(supabase, row);
      const selected = days.find((day) => day.date === date);
      if (!selected?.times.includes(time)) {
        return res.status(409).json({
          ok: false,
          error: "unavailable",
          days,
        });
      }
      const result = await applyReschedule(
        supabase,
        row,
        date,
        time,
        "public_bookea",
      );
      if (result.error === "unavailable") {
        return res.status(409).json({ ok: false, error: "unavailable", days });
      }
      return res.status(200).json({ ok: true, state: result.state });
    }

    return res.status(400).json({ ok: false, error: "invalid_action" });
  } catch (error) {
    console.error("[client/appointments]", error);
    return res.status(500).json({ ok: false, error: "appointment_failed" });
  }
};
