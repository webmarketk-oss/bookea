const { issueAppointmentConfirmationUrl } = require("./issue");
const { firstValue, parsePayload } = require("./service");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const appointmentId = String(
      firstValue(payload.appointmentId) || firstValue(payload.id) || "",
    ).trim();
    const url = await issueAppointmentConfirmationUrl(appointmentId);

    return res.status(200).json({ ok: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "link_failed";
    const status = message === "appointment_not_found" ? 404 : 500;

    return res.status(status).json({
      ok: false,
      error: message === "appointment_not_found" ? "Rendez-vous introuvable." : message,
    });
  }
};
