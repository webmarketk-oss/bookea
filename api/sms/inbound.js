const {
  createServiceClient,
  storeIncomingSms,
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

function isSmsReply(payload) {
  const status = String(payload.msg_status || payload.event || payload.description || "").toLowerCase();
  return Boolean(payload.reply || payload.text || status.includes("repl"));
}

async function ensureBrevoReplyWebhook() {
  const apiKey = process.env.BREVO_API_KEY;
  const siteUrl = (
    process.env.NEXT_PUBLIC_BOOKEA_PRO_URL ||
    process.env.NEXT_PUBLIC_BOOKEA_PUBLIC_URL ||
    "https://www.bookeai.fr"
  ).replace(/\/$/, "");
  const webhookUrl = `${siteUrl}/api/sms/inbound`;

  if (!apiKey) {
    return { configured: false };
  }

  const list = await fetch("https://api.brevo.com/v3/webhooks", {
    headers: { "api-key": apiKey, accept: "application/json" },
  }).then((response) => response.json().catch(() => []));

  const webhooks = Array.isArray(list) ? list : list?.webhooks || [];
  if (webhooks.some((webhook) => String(webhook?.url || "").includes("/api/sms/inbound"))) {
    return { configured: true, existing: true, url: webhookUrl };
  }

  const created = await fetch("https://api.brevo.com/v3/webhooks", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      description: "Bookea SMS replies",
      events: ["transactionalSMSReplied", "unsubscribed"],
      type: "transactional",
    }),
  }).then((response) => response.json().catch(() => ({})));

  return { configured: true, url: webhookUrl, created };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const webhook = await ensureBrevoReplyWebhook().catch((error) => ({
      configured: false,
      error: error instanceof Error ? error.message : "webhook_failed",
    }));

    return res.status(200).json({
      ok: true,
      endpoint: "sms/inbound",
      method: "POST",
      webhook,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);

    if (!isSmsReply(payload)) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const supabase = createServiceClient();
    const result = await storeIncomingSms(supabase, {
      phone: payload.to || payload.phone || payload.from || payload.sender,
      text: payload.reply || payload.text || payload.message,
      messageId: payload.messageId || payload.id,
      at: payload.date,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[sms/inbound]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to store SMS reply",
    });
  }
};
