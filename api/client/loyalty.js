const { createServiceClient, parsePayload } = require("../appointments/service");
const { loadAccount, requireUser } = require("./account");
const { canonicalStatus, requestReward } = require("../../lib/loyalty");
const {
  buildClientCard,
  isMissingSchema,
  loadEvents,
} = require("../center/loyalty-store");

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
    const account = await loadAccount(supabase, user);
    const owned = new Map(
      (account.centers || []).map((center) => [center.clientId, center]),
    );
    if (req.method === "GET") {
      const cards = [];
      for (const center of account.centers || []) {
        cards.push(
          await buildClientCard(
            supabase,
            { id: center.id, name: center.name },
            center.clientId,
          ),
        );
      }
      return res.status(200).json({ ok: true, cards });
    }

    const payload = parsePayload(req.body);
    const appointmentId = String(payload.appointmentId || "").trim();
    const rewardId = String(payload.rewardId || "").trim();
    const { data: appointment, error } = await supabase
      .from("appointments")
      .select("id,center_id,client_id,status,services(name,price_ttc)")
      .eq("id", appointmentId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    const center = owned.get(appointment?.client_id);
    if (!appointment || !center || appointment.center_id !== center.id) {
      return res.status(404).json({ ok: false, error: "appointment_not_found" });
    }
    if (canonicalStatus(appointment.status) !== "open") {
      return res.status(409).json({ ok: false, error: "appointment_not_eligible" });
    }
    const service = Array.isArray(appointment.services)
      ? appointment.services[0]
      : appointment.services;
    const events = await loadEvents(supabase, center.id, appointment.client_id);
    const existing = await supabase
      .from("loyalty_reward_requests")
      .select("id,appointment_id,status,points,discount_eur,min_service_eur,reward_id")
      .eq("client_id", appointment.client_id)
      .eq("center_id", center.id);
    if (existing.error) {
      throw existing.error;
    }
    const { data: centerRow } = await supabase
      .from("centers")
      .select("settings")
      .eq("id", center.id)
      .maybeSingle();
    const state = {
      events,
      deposits: [],
      requests: (existing.data || []).map((row) => ({
        id: row.id,
        centerId: center.id,
        clientId: appointment.client_id,
        appointmentId: row.appointment_id,
        rewardId: row.reward_id,
        points: row.points,
        discountEur: Number(row.discount_eur),
        minServiceEur: Number(row.min_service_eur),
        status: row.status,
      })),
    };
    const decision = requestReward(state, {
      centerId: center.id,
      clientId: appointment.client_id,
      appointmentId,
      program: centerRow?.settings?.loyalty,
      rewardId,
      servicePrice: Number(service?.price_ttc) || 0,
      status: "Confirmé",
    });
    if (!decision.ok) {
      return res.status(409).json(decision);
    }
    const reward = decision.request;
    const { error: insertError } = await supabase.from("loyalty_reward_requests").insert({
      center_id: center.id,
      client_id: appointment.client_id,
      appointment_id: appointmentId,
      reward_id: reward.rewardId,
      points: reward.points,
      discount_eur: reward.discountEur,
      min_service_eur: reward.minServiceEur,
      status: "requested",
    });
    if (insertError && /duplicate|unique/i.test(insertError.message || "")) {
      return res.status(409).json({ ok: false, error: "already_requested" });
    }
    if (insertError) {
      throw insertError;
    }
    return res.status(200).json({ ok: true, request: reward });
  } catch (error) {
    const status = isMissingSchema(error) ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: status === 503 ? "loyalty_not_ready" : "loyalty_failed",
    });
  }
};
