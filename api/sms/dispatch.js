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
  readSmsQuota,
  sendBrevoSms,
  storeIncomingSms,
} = require("./brevo");

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return true;
  }

  const header = String(req.headers.authorization || "");
  return header === `Bearer ${secret}`;
}

function isDue(sendAt) {
  const timestamp = new Date(sendAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function importBrevoReplies(supabase) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    return 0;
  }

  const response = await fetch(
    "https://api.brevo.com/v3/transactionalSMS/statistics/events?event=replies&limit=50&sort=desc",
    {
      headers: { "api-key": apiKey, accept: "application/json" },
    },
  );
  const payload = await response.json().catch(() => ({}));
  const events = Array.isArray(payload?.events) ? payload.events : [];
  let imported = 0;

  for (const event of events) {
    const result = await storeIncomingSms(supabase, {
      phone: event.phoneNumber || event.to || event.phone,
      text: event.reply || event.message || event.reason,
      messageId: event.messageId || event.date,
      at: event.date,
    }).catch(() => ({ stored: false }));

    if (result?.stored) {
      imported += 1;
    }
  }

  return imported;
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
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const supabase = createServiceClient();
    const replies = await importBrevoReplies(supabase).catch(() => 0);
    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,settings");

    if (error) {
      throw new Error(error.message);
    }

    let sent = 0;
    let cancelled = 0;
    let failed = 0;

    for (const center of centers ?? []) {
      const sms = parseCenterSmsSettings(center.settings);
      const quotaState = readSmsQuota(sms);
      const hasPending = sms.jobs.some((job) => job?.status === "pending");
      const scanBirthdays = sms.birthdaySmsEnabled !== false;

      if (!hasPending && !scanBirthdays) {
        continue;
      }

      const nextJobs = [];

      for (const job of sms.jobs) {
        if (job?.status !== "pending" || !isDue(job.sendAt)) {
          nextJobs.push(job);
          continue;
        }

        if (job?.kind === "birthday") {
          if (!scanBirthdays) {
            nextJobs.push(job);
            continue;
          }

          if (quotaState.remaining <= 0) {
            nextJobs.push(job);
            continue;
          }

          try {
            await sendBrevoSms({
              sender: defaultSender(),
              recipient: job.phone,
              content: personalize(job.message, job.vars || {}),
              type: "transactional",
            });
            nextJobs.push({
              ...job,
              status: "sent",
              sentAt: new Date().toISOString(),
              year: job.year || birthdayYear(),
            });
            const nextSendAt = nextBirthdaySendAt(job.vars?.birthDate || job.birthDate);
            if (nextSendAt) {
              nextJobs.push({
                ...job,
                id: crypto.randomUUID(),
                status: "pending",
                year: Number(nextSendAt.slice(0, 4)),
                sendAt: nextSendAt,
                createdAt: new Date().toISOString(),
              });
            }
            sent += 1;
            quotaState.remaining -= 1;
            quotaState.usedThisMonth += 1;
          } catch (sendError) {
            nextJobs.push({
              ...job,
              status: "failed",
              error: sendError instanceof Error ? sendError.message : "send_failed",
              failedAt: new Date().toISOString(),
            });
            failed += 1;
          }
          continue;
        }

        if (job?.kind !== "reminder_48h") {
          nextJobs.push(job);
          continue;
        }

        const { data: appointment, error: appointmentError } = await supabase
          .from("appointments")
          .select("id,status")
          .eq("id", job.appointmentId)
          .maybeSingle();

        if (appointmentError) {
          nextJobs.push({
            ...job,
            status: "failed",
            error: appointmentError.message,
            failedAt: new Date().toISOString(),
          });
          failed += 1;
          continue;
        }

        if (!appointment || isCancelledStatus(appointment.status)) {
          nextJobs.push({
            ...job,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            reason: appointment ? "appointment_cancelled" : "appointment_deleted",
          });
          cancelled += 1;
          continue;
        }

        if (quotaState.remaining <= 0) {
          nextJobs.push(job);
          continue;
        }

        try {
          await sendBrevoSms({
            sender: defaultSender(),
            recipient: job.phone,
            content: personalize(job.message, job.vars || {}),
            type: "transactional",
          });
          nextJobs.push({
            ...job,
            status: "sent",
            sentAt: new Date().toISOString(),
          });
          sent += 1;
          quotaState.remaining -= 1;
          quotaState.usedThisMonth += 1;
        } catch (sendError) {
          nextJobs.push({
            ...job,
            status: "failed",
            error: sendError instanceof Error ? sendError.message : "send_failed",
            failedAt: new Date().toISOString(),
          });
          failed += 1;
        }
      }

      if (scanBirthdays) {
        const { data: birthdayClients, error: birthdayError } = await supabase
          .from("clients")
          .select("id,first_name,last_name,phone,birthdate")
          .eq("center_id", center.id)
          .is("merged_into_client_id", null)
          .not("birthdate", "is", null);

        if (birthdayError) {
          throw new Error(birthdayError.message);
        }

        const template = getBirthdayTemplate(sms);
        const year = birthdayYear();

        for (const client of birthdayClients ?? []) {
          const phone = normalizePhone(client.phone);

          if (!phone || !isBirthdayToday(client.birthdate)) {
            continue;
          }

          const hasJobThisYear = nextJobs.some(
            (job) =>
              job?.kind === "birthday" &&
              job?.year === year &&
              ((job.clientId && job.clientId === client.id) ||
                normalizePhone(job.phone) === phone),
          );

          if (hasJobThisYear) {
            continue;
          }

          const vars = {
            firstName: String(client.first_name || "vous").trim(),
            lastName: String(client.last_name || "").trim(),
            centerName: String(center.name || "").trim(),
            phone,
            birthDate: String(client.birthdate || "").slice(0, 10),
          };
          const sendAt = nextBirthdaySendAt(client.birthdate);
          const sendNow = !sendAt || Number(sendAt.slice(0, 4)) !== year;

          if (!sendNow) {
            nextJobs.push({
              id: crypto.randomUUID(),
              clientId: client.id,
              centerId: center.id,
              kind: "birthday",
              status: "pending",
              year,
              sendAt,
              phone,
              message: template.body,
              vars,
              createdAt: new Date().toISOString(),
            });
            continue;
          }

          if (quotaState.remaining <= 0) {
            continue;
          }

          try {
            await sendBrevoSms({
              sender: defaultSender(),
              recipient: phone,
              content: personalize(template.body, vars),
              type: "transactional",
            });
            nextJobs.push({
              id: crypto.randomUUID(),
              clientId: client.id,
              centerId: center.id,
              kind: "birthday",
              status: "sent",
              year,
              sendAt: new Date().toISOString(),
              sentAt: new Date().toISOString(),
              phone,
              message: template.body,
              vars,
              createdAt: new Date().toISOString(),
            });
            if (sendAt) {
              nextJobs.push({
                id: crypto.randomUUID(),
                clientId: client.id,
                centerId: center.id,
                kind: "birthday",
                status: "pending",
                year: Number(sendAt.slice(0, 4)),
                sendAt,
                phone,
                message: template.body,
                vars,
                createdAt: new Date().toISOString(),
              });
            }
            sent += 1;
            quotaState.remaining -= 1;
            quotaState.usedThisMonth += 1;
          } catch (sendError) {
            nextJobs.push({
              id: crypto.randomUUID(),
              clientId: client.id,
              centerId: center.id,
              kind: "birthday",
              status: "failed",
              year,
              error: sendError instanceof Error ? sendError.message : "send_failed",
              failedAt: new Date().toISOString(),
              phone,
              message: template.body,
              vars,
              createdAt: new Date().toISOString(),
            });
            failed += 1;
          }
        }
      }

      const birthdayJobs = nextJobs.filter((job) => job?.kind === "birthday");
      const otherJobs = nextJobs
        .filter((job) => job?.kind !== "birthday")
        .filter((job) => {
          if (job.status === "pending") {
            return true;
          }

          const stamp = job.sentAt || job.cancelledAt || job.failedAt || job.createdAt;
          if (!stamp) {
            return false;
          }

          return Date.now() - new Date(stamp).getTime() < 14 * 24 * 60 * 60 * 1000;
        })
        .slice(-80);
      const keptBirthdayJobs = birthdayJobs.filter((job) => {
        if (job.status === "pending") {
          return true;
        }

        const stamp = job.sentAt || job.cancelledAt || job.failedAt || job.createdAt;
        if (!stamp) {
          return false;
        }

        return Date.now() - new Date(stamp).getTime() < 400 * 24 * 60 * 60 * 1000;
      });

      await supabase
        .from("centers")
        .update({
          settings: mergeCenterSmsSettings(center.settings, {
            jobs: [...otherJobs, ...keptBirthdayJobs],
            quota: {
              remaining: quotaState.remaining,
              lastGrantMonth: quotaState.lastGrantMonth,
              monthlyGrant: quotaState.monthlyGrant,
              usedThisMonth: quotaState.usedThisMonth,
            },
          }),
        })
        .eq("id", center.id);
    }

    return res.status(200).json({
      ok: true,
      endpoint: "sms/dispatch",
      sent,
      cancelled,
      failed,
      replies,
    });
  } catch (error) {
    console.error("[sms/dispatch]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to dispatch SMS",
    });
  }
};
