const { appendStatusHistory } = require("../appointments/token-utils");
const { readCenterSeya } = require("../seya/store");
const {
  centerNotifyEmails,
  resolveNotifySender,
  sendBrevoToCenter,
} = require("../seya/center-notify");
const {
  alreadyNotified,
  appointmentEventCopy,
  conversationUrl,
  eventNotifyKey,
  formatEventWhen,
  messageEventCopy,
  notificationVia,
  personLabel,
  treatmentLabel,
} = require("./event-copy");

function relationObject(value) {
  return Array.isArray(value) ? value[0] : value;
}

function personFromRow(row) {
  const client = relationObject(row?.clients);
  return personLabel(
    [client?.first_name, client?.last_name].filter(Boolean).join(" "),
  );
}

function treatmentFromRow(row) {
  const service = relationObject(row?.services);
  return treatmentLabel(service?.name);
}

async function sendEventToCenter({ center, seya, copy } = {}) {
  const emails = centerNotifyEmails(center, seya);
  if (!emails.length) {
    return { sent: false, reason: "no_email", recipients: [] };
  }
  const resolved = await resolveNotifySender(center, seya);
  const senderEmail = resolved.senderEmail;
  if (!process.env.BREVO_API_KEY) {
    return {
      sent: false,
      reason: "missing_brevo",
      recipients: emails,
      sender: senderEmail,
    };
  }
  if (!senderEmail) {
    return {
      sent: false,
      reason: "missing_sender",
      recipients: emails,
      sender: senderEmail,
    };
  }
  const results = [];
  for (const email of emails) {
    try {
      results.push(
        await sendBrevoToCenter({
          to: email,
          subject: copy.subject,
          text: copy.text,
          centerName: center?.name,
          senderEmail,
          senderName: resolved.senderName,
          tags: ["bookea-center"],
        }),
      );
    } catch (error) {
      console.error("[center/notify]", email, error);
      results.push({
        sent: false,
        to: email,
        error: String(error?.message || error),
      });
    }
  }
  const sent = results.some((item) => item.sent);
  return {
    sent,
    reason: sent ? "sent" : "send_failed",
    recipients: emails,
    sender: senderEmail,
    results,
  };
}

async function loadCenterForEvent(supabase, centerId) {
  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,email,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!center?.id) {
    return { center: null, seya: {} };
  }
  const latest = await readCenterSeya(supabase, center.id);
  return { center, seya: latest.seya };
}

async function markAppointmentNotified(supabase, appointment, key) {
  if (!appointment?.id || !key) {
    return;
  }
  const nextHistory = appendStatusHistory(appointment.status_history, {
    at: new Date().toISOString(),
    source: "bookea",
    action: "center_notify",
    to: key,
  });
  await supabase
    .from("appointments")
    .update({ status_history: nextHistory, updated_at: new Date().toISOString() })
    .eq("id", appointment.id);
}

async function notifyCenterEvent({
  supabase,
  centerId,
  kind,
  copy,
  appointment,
  dedupeKey,
} = {}) {
  const id = String(centerId || appointment?.center_id || "").trim();
  if (!id) {
    return { sent: false, reason: "unknown_center" };
  }
  if (appointment && alreadyNotified(appointment.status_history, dedupeKey)) {
    return { sent: false, reason: "already" };
  }
  const loaded = await loadCenterForEvent(supabase, id);
  if (!loaded.center) {
    return { sent: false, reason: "unknown_center" };
  }
  const result = await sendEventToCenter({
    center: loaded.center,
    seya: loaded.seya,
    copy,
  });
  if (result.sent && appointment?.id && dedupeKey) {
    await markAppointmentNotified(supabase, appointment, dedupeKey).catch(
      (error) => {
        console.error("[center/notify] mark", error);
      },
    );
  }
  return { ...result, kind, centerId: id };
}

async function notifyAppointmentEvent(
  supabase,
  row,
  kind,
  source,
  extra = {},
) {
  const via = extra.via || notificationVia(source);
  const date = extra.date || String(row?.appointment_date || "").slice(0, 10);
  const time = extra.time || String(row?.starts_at || "").slice(0, 5);
  const previousDate = extra.previousDate;
  const previousTime = extra.previousTime;
  const key = eventNotifyKey(kind, {
    id: row?.id,
    date: kind === "appointment_moved" ? date : date,
    time: kind === "appointment_moved" ? time : time,
  });
  const copy = appointmentEventCopy({
    kind,
    via,
    personName: extra.personName || personFromRow(row),
    treatment: extra.treatment || treatmentFromRow(row),
    when: formatEventWhen(date, time),
    previousWhen:
      previousDate || previousTime
        ? formatEventWhen(previousDate, previousTime)
        : "",
    centerName: extra.centerName || relationObject(row?.centers)?.name,
  });
  return notifyCenterEvent({
    supabase,
    centerId: row?.center_id,
    kind,
    copy,
    appointment: { ...row, status_history: extra.statusHistory || row?.status_history },
    dedupeKey: key,
  });
}

async function notifyClientMessageEvent(supabase, {
  centerId,
  conversationId,
  personName,
  preview,
} = {}) {
  const loaded = await loadCenterForEvent(supabase, centerId);
  if (!loaded.center) {
    return { sent: false, reason: "unknown_center" };
  }
  const copy = messageEventCopy({
    personName,
    preview,
    conversationUrl: conversationUrl(conversationId),
    centerName: loaded.center.name,
  });
  return sendEventToCenter({
    center: loaded.center,
    seya: loaded.seya,
    copy,
  });
}

module.exports = {
  alreadyNotified,
  eventNotifyKey,
  loadCenterForEvent,
  notifyAppointmentEvent,
  notifyCenterEvent,
  notifyClientMessageEvent,
  sendEventToCenter,
};
