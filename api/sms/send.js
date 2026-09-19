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

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("33") && digits.length >= 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `33${digits.slice(1)}`;
  }

  return digits;
}

function personalize(message, firstName) {
  return String(message || "").replaceAll("{{prenom}}", firstName || "vous");
}

async function sendBrevoSms({ sender, recipient, content, type }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("missing_brevo_api_key");
  }

  const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      recipient,
      content,
      type: type === "marketing" ? "marketing" : "transactional",
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      result?.message ||
      result?.error?.message ||
      `brevo_${response.status}`;
    throw new Error(message);
  }

  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "sms/send",
      configured: Boolean(process.env.BREVO_API_KEY),
      sender: process.env.BREVO_SMS_SENDER || "BOOKEA",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const sender = String(process.env.BREVO_SMS_SENDER || "BOOKEA")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 11);
    const message = String(firstValue(payload.message) || firstValue(payload.content) || "").trim();
    const type = String(firstValue(payload.type) || "transactional");
    const recipientsInput = Array.isArray(payload.recipients)
      ? payload.recipients
      : firstValue(payload.to) || firstValue(payload.phone)
        ? [
            {
              phone: firstValue(payload.to) || firstValue(payload.phone),
              firstName: firstValue(payload.firstName) || "vous",
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
          return { phone: normalizePhone(item), firstName: "vous" };
        }

        return {
          phone: normalizePhone(item?.phone),
          firstName: String(item?.firstName || "vous").trim() || "vous",
        };
      })
      .filter((item) => item.phone);

    if (recipients.length === 0) {
      return res.status(400).json({ ok: false, error: "missing_phone" });
    }

    if (recipients.length > 100) {
      return res.status(400).json({ ok: false, error: "too_many_recipients" });
    }

    const results = [];

    for (const recipient of recipients) {
      try {
        const sent = await sendBrevoSms({
          sender,
          recipient: recipient.phone,
          content: personalize(message, recipient.firstName),
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
    const remainingCredits = results.find((item) => item.remainingCredits != null)
      ?.remainingCredits;

    return res.status(sentCount > 0 ? 200 : 502).json({
      ok: sentCount > 0,
      sent: sentCount,
      failed: results.length - sentCount,
      remainingCredits: remainingCredits ?? null,
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
