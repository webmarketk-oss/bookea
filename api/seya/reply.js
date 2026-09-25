const { generateSeyaReply, hasAiKey } = require("./ai");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, ai: hasAiKey() });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const conversation = payload.conversation;
    const text = String(payload.text || "").trim();
    if (!conversation || !text) {
      return res.status(400).json({ error: "missing_conversation" });
    }

    const result = await generateSeyaReply({
      conversation,
      text,
      seya: payload.settings || {},
      slots: Array.isArray(payload.slots) ? payload.slots : [],
      centerName: payload.centerName || "le centre",
    });

    return res.status(200).json({
      ok: true,
      via: result.via,
      conversation: result.conversation,
      shouldBook: result.shouldBook,
      ai: hasAiKey(),
    });
  } catch (error) {
    console.error("[seya/reply]", error);
    return res.status(500).json({ error: "reply_failed" });
  }
};

function parsePayload(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    const text = body.trim();
    if (!text) {
      return {};
    }
    return text.startsWith("{") ? JSON.parse(text) : {};
  }
  return body;
}
