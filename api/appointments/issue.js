const {
  CLIENT_CANCELLED,
  CLIENT_CONFIRMED,
  appendStatusHistory,
  appointmentSlot,
  confirmationExpiresAt,
  confirmationUrlForToken,
  createConfirmationToken,
  hashConfirmationToken,
} = require("./token-utils");
const { createServiceClient } = require("./service");

const APPOINTMENT_SELECT = `
  id,
  center_id,
  lead_id,
  appointment_date,
  starts_at,
  status,
  confirmed_at,
  cancelled_at,
  client_response,
  confirmation_token_hash,
  confirmation_token_expires_at,
  confirmation_token_slot,
  status_history
`;

async function issueAppointmentConfirmationUrl(appointmentId) {
  const id = String(appointmentId || "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("appointment_not_found");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("appointment_not_found");
  }

  const token = createConfirmationToken();
  const issuedAt = new Date().toISOString();
  const nextHistory = appendStatusHistory(data.status_history, {
    at: issuedAt,
    source: "sms_link",
    action: "issue",
    from: data.status,
    to: data.status,
  });

  const { error: updateError } = await supabase
    .from("appointments")
    .update({
      confirmation_token_hash: hashConfirmationToken(token),
      confirmation_token_expires_at: confirmationExpiresAt(data.appointment_date),
      confirmation_token_slot: appointmentSlot(data.appointment_date, data.starts_at),
      status_history: nextHistory,
      updated_at: issuedAt,
    })
    .eq("id", data.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return confirmationUrlForToken(token);
}

module.exports = {
  APPOINTMENT_SELECT,
  issueAppointmentConfirmationUrl,
};
