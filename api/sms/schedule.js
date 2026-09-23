const {
  birthdayYear,
  createServiceClient,
  defaultSender,
  getBirthdayTemplate,
  isBirthdayToday,
  isCancelledStatus,
  mergeCenterSmsSettings,
  nextBirthdaySendAt,
  normalizePhone,
  parseCenterSmsSettings,
  personalize,
  isAppointmentReminderKind,
  reminderHoursForKind,
  reminderSendAt,
  consumeCenterSmsQuota,
  readSmsQuota,
  sendBrevoSms,
  toIsoBirthDate,
  withConfirmationLink,
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

function birthdayJobMatches(job, clientId, phone) {
  if (job?.kind !== "birthday" || job?.status !== "pending") {
    return false;
  }

  if (clientId && job.clientId === clientId) {
    return true;
  }

  if (phone && normalizePhone(job.phone) === phone) {
    return true;
  }

  return false;
}

async function handleBirthdayJob(res, payload, action) {
  const supabase = createServiceClient();
  const clientId = String(payload.clientId || "").trim();
  const centerIdHint = String(payload.centerId || "").trim();
  const enabled = payload.enabled !== false;
  const birthDate = toIsoBirthDate(
    payload.birthDate || payload.vars?.birthDate || client?.birthdate,
  );
  let client = null;

  if (clientId) {
    const { data, error } = await supabase
      .from("clients")
      .select("id,center_id,first_name,last_name,phone,birthdate")
      .eq("id", clientId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    client = data;
  }

  const centerId = String(client?.center_id || centerIdHint || "").trim();

  if (!centerId) {
    return res.status(400).json({ ok: false, error: "missing_center" });
  }

  const { data: centerRow, error: centerError } = await supabase
    .from("centers")
    .select("id,name,settings")
    .eq("id", centerId)
    .maybeSingle();

  if (centerError) {
    throw new Error(centerError.message);
  }

  if (!centerRow) {
    return res.status(404).json({ ok: false, error: "center_not_found" });
  }

  const sms = parseCenterSmsSettings(centerRow.settings);
  const phone = normalizePhone(payload.vars?.phone || payload.phone || client?.phone);
  const shouldCancel =
    action === "cancel" || enabled === false || !birthDate || !sms.birthdaySmsEnabled;

  if (shouldCancel) {
    let cancelled = 0;
    const jobs = sms.jobs.map((job) => {
      if (!birthdayJobMatches(job, clientId, phone)) {
        return job;
      }

      cancelled += 1;
      return {
        ...job,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        reason: enabled === false ? "opt_out" : "birthday_cleared",
        year: birthdayYear(),
      };
    });

    if (
      enabled === false &&
      (clientId || phone) &&
      !jobs.some(
        (job) =>
          job?.kind === "birthday" &&
          job?.year === birthdayYear() &&
          ((clientId && job.clientId === clientId) ||
            (phone && normalizePhone(job.phone) === phone)),
      )
    ) {
      jobs.push({
        id: crypto.randomUUID(),
        clientId: clientId || client?.id || null,
        centerId,
        kind: "birthday",
        status: "cancelled",
        year: birthdayYear(),
        cancelledAt: new Date().toISOString(),
        reason: "opt_out",
        phone,
        createdAt: new Date().toISOString(),
      });
      cancelled += 1;
    }

    await supabase
      .from("centers")
      .update({ settings: mergeCenterSmsSettings(centerRow.settings, { jobs }) })
      .eq("id", centerId);

    return res.status(200).json({ ok: true, cancelled, scheduled: false });
  }

  if (!phone) {
    return res.status(400).json({ ok: false, error: "missing_phone" });
  }

  const template = getBirthdayTemplate(sms);
  const vars = {
    firstName: String(payload.vars?.firstName || client?.first_name || "vous").trim(),
    lastName: String(payload.vars?.lastName || client?.last_name || "").trim(),
    centerName: String(payload.vars?.centerName || centerRow.name || "").trim(),
    phone,
    birthDate,
  };
  const message = String(payload.message || template?.body || "").trim();

  if (!message) {
    return res.status(400).json({ ok: false, error: "missing_message" });
  }

  const year = birthdayYear();
  const sendAt = nextBirthdaySendAt(birthDate);
  const otherJobs = sms.jobs.filter((job) => !birthdayJobMatches(job, clientId, phone));
  const alreadySentThisYear = sms.jobs.some(
    (job) =>
      job?.kind === "birthday" &&
      job?.year === year &&
      job?.status === "sent" &&
      ((clientId && job.clientId === clientId) || normalizePhone(job.phone) === phone),
  );

  if (!sendAt) {
    return res.status(400).json({ ok: false, error: "invalid_birthdate" });
  }

  const sendNow =
    isBirthdayToday(birthDate) && !alreadySentThisYear && Number(sendAt.slice(0, 4)) !== year;

  if (sendNow) {
    const quota = readSmsQuota(sms);

    if (quota.remaining <= 0) {
      return res.status(402).json({
        ok: false,
        error: "Plus de SMS disponibles. Le solde se recharge de 500 SMS chaque 1er du mois, ou via une recharge admin.",
        remainingCredits: 0,
      });
    }

    await sendBrevoSms({
      sender: defaultSender(),
      recipient: phone,
      content: personalize(message, vars),
      type: "transactional",
    });
    const nextQuota = await consumeCenterSmsQuota(supabase, centerId, 1);

    const jobs = [
      ...otherJobs,
      {
        id: crypto.randomUUID(),
        clientId: clientId || client?.id || null,
        centerId,
        kind: "birthday",
        status: "sent",
        year,
        sendAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        phone,
        message,
        vars,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        clientId: clientId || client?.id || null,
        centerId,
        kind: "birthday",
        status: "pending",
        year: year + 1,
        sendAt,
        phone,
        message,
        vars,
        createdAt: new Date().toISOString(),
      },
    ];

    await supabase
      .from("centers")
      .update({
        settings: mergeCenterSmsSettings(centerRow.settings, {
          jobs,
          quota: {
            month: nextQuota.month,
            used: nextQuota.used,
            limit: nextQuota.limit,
          },
        }),
      })
      .eq("id", centerId);

    return res.status(200).json({
      ok: true,
      sent: 1,
      scheduled: true,
      sendAt,
      remainingCredits: nextQuota.remaining,
    });
  }

  const jobs = [
    ...otherJobs,
    {
      id: crypto.randomUUID(),
      clientId: clientId || client?.id || null,
      centerId,
      kind: "birthday",
      status: "pending",
      year: Number(sendAt.slice(0, 4)),
      sendAt,
      phone,
      message,
      vars,
      createdAt: new Date().toISOString(),
    },
  ];

  await supabase
    .from("centers")
    .update({ settings: mergeCenterSmsSettings(centerRow.settings, { jobs }) })
    .eq("id", centerId);

  return res.status(200).json({
    ok: true,
    sent: 0,
    scheduled: true,
    sendAt,
  });
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
    const kind = String(payload.kind || "reminder_48h");
    const appointmentId = String(payload.appointmentId || "").trim();

    if (kind === "birthday") {
      return handleBirthdayJob(res, payload, action);
    }

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

      let updated = 0;
      const jobs = sms.jobs.map((job) => {
        if (job?.appointmentId !== appointmentId || job?.status !== "pending") {
          return job;
        }

        if (!isAppointmentReminderKind(job.kind)) {
          return job;
        }

        updated += 1;
        return {
          ...job,
          sendAt: reminderSendAt(
            appointment.appointment_date,
            appointment.starts_at,
            reminderHoursForKind(job.kind, job.hoursBefore),
          ),
        };
      });

      await supabase
        .from("centers")
        .update({ settings: mergeCenterSmsSettings(center?.settings, { jobs }) })
        .eq("id", appointment.center_id);

      return res.status(200).json({ ok: true, updated });
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
    const { data: centerRow, error: centerError } = await supabase
      .from("centers")
      .select("id,name,settings")
      .eq("id", appointment.center_id)
      .maybeSingle();

    if (centerError) {
      throw new Error(centerError.message);
    }

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

    const reminderKind = isAppointmentReminderKind(kind) ? kind : "reminder_48h";
    const hoursBefore = reminderHoursForKind(kind, payload.hoursBefore);
    const sendAt = reminderSendAt(
      appointment.appointment_date,
      appointment.starts_at,
      hoursBefore,
    );
    const dueNow = new Date(sendAt).getTime() <= Date.now();

    if (dueNow) {
      if (!centerRow) {
        return res.status(404).json({ ok: false, error: "center_not_found" });
      }

      const quota = readSmsQuota(parseCenterSmsSettings(centerRow.settings));

      if (quota.remaining <= 0) {
        return res.status(402).json({
          ok: false,
          error: "Plus de SMS disponibles. Le solde se recharge de 500 SMS chaque 1er du mois, ou via une recharge admin.",
          remainingCredits: 0,
        });
      }

      const smsVars = await withConfirmationLink(vars, appointmentId);
      await sendBrevoSms({
        sender: defaultSender(),
        recipient: vars.phone,
        content: personalize(message, smsVars),
        type: "transactional",
      });
      const nextQuota = await consumeCenterSmsQuota(
        supabase,
        appointment.center_id,
        1,
      );

      return res.status(200).json({
        ok: true,
        sent: 1,
        scheduled: false,
        remainingCredits: nextQuota.remaining,
      });
    }

    if (!centerRow) {
      return res.status(404).json({ ok: false, error: "center_not_found" });
    }

    const sms = parseCenterSmsSettings(centerRow.settings);
    const jobs = [
      ...sms.jobs.filter(
        (job) =>
          !(
            job?.appointmentId === appointmentId &&
            job?.kind === reminderKind &&
            job?.status === "pending"
          ),
      ),
      {
        id: crypto.randomUUID(),
        appointmentId,
        centerId: appointment.center_id,
        kind: reminderKind,
        hoursBefore,
        status: "pending",
        sendAt,
        phone: vars.phone,
        message,
        vars: {
          ...vars,
          appointmentId,
        },
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
