const { createServiceClient, parsePayload, rateLimit } = require("../appointments/service");
const { rehomeMisplacedConversations } = require("./center-route");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    parsePayload(req.body);
    if (!rateLimit(`seya-rehome:${req.socket?.remoteAddress || "ip"}`, 6, 60_000)) {
      return res.status(429).json({ ok: false, error: "too_many_requests" });
    }
    const supabase = createServiceClient();
    const result = await rehomeMisplacedConversations(supabase);
    return res.status(200).json({
      ok: true,
      moved: result.moved.length,
      centers: result.updates.length,
      details: result.moved,
    });
  } catch (error) {
    console.error("[seya/rehome]", error);
    return res.status(500).json({ ok: false, error: "rehome_failed" });
  }
};
