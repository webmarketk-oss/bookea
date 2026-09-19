const {
  createServiceClient,
  defaultSender,
  isCancelledStatus,
  mergeCenterSmsSettings,
  normalizePhone,
  parseCenterSmsSettings,
  personalize,
  reminderSendAt,
  sendBrevoSms,
} = require("./brevo");

function parsePayload(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    const text = body.trim();
    if (!text) {
      return {};
    }
    if (text.startsWith("{") || text.startsWith("[")) {
      return JSON.parse(text);
    }
    return Object.fromEntries(new URLSearchParams(text).entries());
  }

  return body;
}

async function loadAppointment(supabase, appointmentId) {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
        id,
        center_id,
        appointment_date,
        starts_at,
        status,
        clients(first_name,last_name,phone),
        services(name)
      `,
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function relation(value) {
  return Array.isArray(value) ? value[0] : value;
}

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
    const action = String(payload.action || "schedule");
    const appointmentId = String(payload.appointmentId || "").trim();

    if (!appointmentId) {
      return res.status(400).json({ ok: false, error: "missing_appointment" });
    }

    const supabase = createServiceClient();

    if (action === "cancel") {
      const appointment = await loadAppointment(supabase, appointmentId);
      const centerId = appointment?.center_id || String(payload.centerId || "").trim();

      if (!centerId) {
        return res.status(200).json({ ok: true, cancelled: 0 });
      }

      const { data: center, error } = await supabase
        .from("centers")
        .select("id,settings")
        .eq("id", centerId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const sms = parseCenterSmsSettings(center?.settings);
      const jobs = sms.jobs.map((job) =>
        job?.appointmentId === appointmentId && job?.status === "pending"
          ? { ...job, status: "cancelled", cancelledAt: new Date().toISOString() }
          : job,
      );
      const cancelled = jobs.filter(
        (job, index) => job.status === "cancelled" && sms.jobs[index]?.status === "pending",
      ).length;

      await supabase
        .from("centers")
        .update({ settings: mergeCenterSmsSettings(center?.settings, { jobs }) })
        .eq("id", centerId);

      return res.status(200).json({ ok: true, cancelled });
    }

    if (action === "reschedule") {
      const appointment = await loadAppointment(supabase, appointmentId);

      if (!appointment) {
        return res.status(200).json({ ok: true, updated: 0 });
      }

      const { data: center, error } = await supabase
        .from("centers")
        .select("id,settings")
        .eq("id", appointment.center_id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const sms = parseCenterSmsSettings(center?.settings);

      if (isCancelledStatus(appointment.status)) {
        const jobs = sms.jobs.map((job) =>
          job?.appointmentId === appointmentId && job?.status === "pending"
            ? { ...job, status: "cancelled", cancelledAt: new Date().toISOString() }
            : job,
        );

        await supabase
          .from("centers")
          .update({ settings: mergeCenterSmsSettings(center?.settings, { jobs }) })
          .eq("id", appointment.center_id);

        return res.status(200).json({ ok: true, cancelled: true });
      }

      const sendAt = reminderSendAt(appointment.appointment_date, appointment.starts_at);
      let updated = 0;
      const jobs = sms.jobs.map((job) => {
        if (job?.appointmentId !== appointmentId || job?.status !== "pending") {
          return job;
        }

        updated += 1;
        return { ...job, sendAt };
      });

      await supabase
        .from("centers")
        .update({ settings: mergeCenterSmsSettings(center?.settings, { jobs }) })
        .eq("id", appointment.center_id);

      return res.status(200).json({ ok: true, updated, sendAt });
    }

    const appointment = await loadAppointment(supabase, appointmentId);

    if (!appointment) {
      return res.status(404).json({ ok: false, error: "appointment_not_found" });
    }

    if (isCancelledStatus(appointment.status)) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "appointment_cancelled",
      });
    }

    const client = relation(appointment.clients);
    const service = relation(appointment.services);
    const { data: centerRow } = await supabase
      .from("centers")
      .select("name")
      .eq("id", appointment.center_id)
      .maybeSingle();
    const vars = {
      firstName: String(payload.vars?.firstName || client?.first_name || "vous").trim(),
      lastName: String(payload.vars?.lastName || client?.last_name || "").trim(),
      date: String(payload.vars?.date || appointment.appointment_date || "").trim(),
      time: String(payload.vars?.time || String(appointment.starts_at || "").slice(0, 5)).trim(),
      treatment: String(payload.vars?.treatment || service?.name || "").trim(),
      centerName: String(payload.vars?.centerName || centerRow?.name || "").trim(),
      phone: normalizePhone(payload.vars?.phone || client?.phone),
    };

    if (!vars.phone) {
      return res.status(400).json({ ok: false, error: "missing_phone" });
    }

    const message = String(payload.message || "").trim();

    if (!message) {
      return res.status(400).json({ ok: false, error: "missing_message" });
    }

    const sendAt = reminderSendAt(appointment.appointment_date, appointment.starts_at);
    const dueNow = new Date(sendAt).getTime() <= Date.now();

    if (dueNow) {
      const sent = await sendBrevoSms({
        sender: defaultSender(),
        recipient: vars.phone,
        content: personalize(message, vars),
        type: "transactional",
      });

      return res.status(200).json({
        ok: true,
        sent: 1,
        scheduled: false,
        remainingCredits: sent?.remainingCredits ?? null,
      });
    }

    const { data: centerRow, error: centerError } = await supabase
      .from("centers")
      .select("id,settings")
      .eq("id", appointment.center_id)
      .single();

    if (centerError) {
      throw new Error(centerError.message);
    }

    const sms = parseCenterSmsSettings(centerRow.settings);
    const jobs = [
      ...sms.jobs.filter(
        (job) =>
          !(
            job?.appointmentId === appointmentId &&
            job?.kind === "reminder_48h" &&
            job?.status === "pending"
          ),
      ),
      {
        id: crypto.randomUUID(),
        appointmentId,
        centerId: appointment.center_id,
        kind: "reminder_48h",
        status: "pending",
        sendAt,
        phone: vars.phone,
        message,
        vars,
        createdAt: new Date().toISOString(),
      },
    ];

    const { error: updateError } = await supabase
      .from("centers")
      .update({
        settings: mergeCenterSmsSettings(centerRow.settings, { jobs }),
      })
      .eq("id", appointment.center_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return res.status(200).json({
      ok: true,
      sent: 0,
      scheduled: true,
      sendAt,
    });
  } catch (error) {
    console.error("[sms/schedule]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to schedule SMS",
    });
  }
};
