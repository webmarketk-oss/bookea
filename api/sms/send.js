const {
  MONTHLY_SMS_LIMIT,
  consumeCenterSmsQuota,
  createServiceClient,
  defaultSender,
  ensureCenterSmsQuota,
  normalizePhone,
  parseCenterSmsSettings,
  personalize,
  readSmsQuota,
  sendBrevoSms,
  withConfirmationLink,
} = require("./brevo");

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const centerId = String(firstValue(req.query?.centerId) || "").trim();
    let quota = {
      remaining: MONTHLY_SMS_LIMIT,
      used: 0,
      limit: MONTHLY_SMS_LIMIT,
      month: "",
    };

    if (centerId) {
      try {
        const supabase = createServiceClient();
        quota = await ensureCenterSmsQuota(supabase, centerId);
      } catch {
        quota = {
          remaining: MONTHLY_SMS_LIMIT,
          used: 0,
          limit: MONTHLY_SMS_LIMIT,
          month: "",
        };
      }
    }

    return res.status(200).json({
      ok: true,
      endpoint: "sms/send",
      configured: Boolean(process.env.BREVO_API_KEY),
      sender: process.env.BREVO_SMS_SENDER || "BOOKEA",
      remainingCredits: quota.remaining,
      used: quota.used,
      monthlyLimit: quota.limit,
      month: quota.month,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const sender = defaultSender();
    const appointmentId = String(firstValue(payload.appointmentId) || "").trim();
    const message = String(firstValue(payload.message) || firstValue(payload.content) || "").trim();
    const type = String(firstValue(payload.type) || "transactional");
    const centerName = String(firstValue(payload.centerName) || firstValue(payload.centre) || "");
    const recipientsInput = Array.isArray(payload.recipients)
      ? payload.recipients
      : firstValue(payload.to) || firstValue(payload.phone)
        ? [
            {
              phone: firstValue(payload.to) || firstValue(payload.phone),
              firstName: firstValue(payload.firstName) || "vous",
              lastName: firstValue(payload.lastName) || "",
              date: firstValue(payload.date) || "",
              time: firstValue(payload.time) || firstValue(payload.heure) || "",
              treatment: firstValue(payload.treatment) || firstValue(payload.soin) || "",
              centerName,
            },
          ]
        : [];

    if (!sender || sender.length < 3) {
      return res.status(500).json({ ok: false, error: "invalid_sender" });
    }

    if (!message) {
      return res.status(400).json({ ok: false, error: "missing_message" });
    }

    const recipients = recipientsInput
      .map((item) => {
        if (typeof item === "string") {
          return {
            phone: normalizePhone(item),
            firstName: "vous",
            lastName: "",
            date: "",
            time: "",
            treatment: "",
            centerName,
          };
        }

        return {
          phone: normalizePhone(item?.phone),
          firstName: String(item?.firstName || "vous").trim() || "vous",
          lastName: String(item?.lastName || "").trim(),
          date: String(item?.date || "").trim(),
          time: String(item?.time || item?.heure || "").trim(),
          treatment: String(item?.treatment || item?.soin || "").trim(),
          centerName: String(item?.centerName || item?.centre || centerName).trim(),
          confirmationLink: String(
            item?.confirmationLink || item?.lien_confirmation || item?.lien || "",
          ).trim(),
          appointmentId: String(item?.appointmentId || appointmentId).trim(),
        };
      })
      .filter((item) => item.phone);

    if (recipients.length === 0) {
      return res.status(400).json({ ok: false, error: "missing_phone" });
    }

    if (recipients.length > 100) {
      return res.status(400).json({ ok: false, error: "too_many_recipients" });
    }

    const supabase = createServiceClient();
    const centerId = await resolveSmsCenterId(supabase, payload);

    if (!centerId) {
      return res.status(400).json({
        ok: false,
        error: "Centre introuvable pour décompter le quota SMS.",
      });
    }

    const { data: centerRow, error: centerError } = await supabase
      .from("centers")
      .select("settings")
      .eq("id", centerId)
      .maybeSingle();

    if (centerError) {
      throw new Error(centerError.message);
    }

    const quota = readSmsQuota(parseCenterSmsSettings(centerRow?.settings));

    if (quota.remaining <= 0) {
      return res.status(402).json({
        ok: false,
        error: "Plus de SMS disponibles. Le solde se recharge de 500 SMS chaque 1er du mois, ou via une recharge admin.",
        remainingCredits: 0,
        used: quota.used,
        monthlyLimit: quota.limit,
        month: quota.month,
      });
    }

    const allowedRecipients = recipients.slice(0, quota.remaining);
    const skipped = recipients.length - allowedRecipients.length;
    const results = [];

    for (const recipient of allowedRecipients) {
      try {
        const vars = await withConfirmationLink(recipient, appointmentId);
        const sent = await sendBrevoSms({
          sender,
          recipient: recipient.phone,
          content: personalize(message, vars),
          type,
        });
        results.push({
          phone: recipient.phone,
          ok: true,
          messageId: sent?.messageId ?? null,
          remainingCredits: sent?.remainingCredits ?? null,
        });
      } catch (error) {
        results.push({
          phone: recipient.phone,
          ok: false,
          error: error instanceof Error ? error.message : "send_failed",
        });
      }
    }

    const sentCount = results.filter((item) => item.ok).length;
    let nextQuota = quota;

    if (sentCount > 0) {
      nextQuota = await consumeCenterSmsQuota(supabase, centerId, sentCount);
    }

    return res.status(sentCount > 0 ? 200 : 502).json({
      ok: sentCount > 0,
      sent: sentCount,
      failed: results.length - sentCount + skipped,
      remainingCredits: nextQuota.remaining,
      used: nextQuota.used,
      monthlyLimit: nextQuota.limit,
      month: nextQuota.month,
      results,
    });
  } catch (error) {
    console.error("[sms/send]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send SMS",
    });
  }
};

async function resolveSmsCenterId(supabase, payload) {
  const centerId = String(firstValue(payload.centerId) || "").trim();

  if (centerId) {
    return centerId;
  }

  const centerName = String(
    firstValue(payload.centerName) || firstValue(payload.centre) || "",
  ).trim();

  if (!centerName) {
    return "";
  }

  const { data, error } = await supabase
    .from("centers")
    .select("id,name")
    .ilike("name", centerName);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length === 1) {
    return data[0].id;
  }

  return (
    (data ?? []).find(
      (center) =>
        String(center.name || "").trim().toLowerCase() === centerName.toLowerCase(),
    )?.id || ""
  );
}
