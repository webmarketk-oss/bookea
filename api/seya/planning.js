const { createClient } = require("@supabase/supabase-js");
const { generatePlanningReply, hasAiKey } = require("./planning-ai");
const { readCenterSeya } = require("./store");
const { readHours } = require("./agent");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, agent: "seya-planning", ai: hasAiKey() });
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

    const centerId = String(payload.centerId || conversation.centerId || "").trim();
    if (!centerId) {
      return res.status(400).json({ error: "missing_center" });
    }
    if (conversation.centerId && conversation.centerId !== centerId) {
      return res.status(409).json({ error: "center_mismatch" });
    }

    const supabase = createServiceClient();
    const latest = await readCenterSeya(supabase, centerId);
    const { data: center, error } = await supabase
      .from("centers")
      .select("id,name,address_line1,city,postal_code,settings")
      .eq("id", centerId)
      .maybeSingle();
    if (error || !center) {
      return res.status(404).json({ error: "unknown_center" });
    }

    const result = await generatePlanningReply({
      conversation: { ...conversation, centerId },
      text,
      seya: latest.seya,
      slots: Array.isArray(payload.slots) ? payload.slots : [],
      appointments: Array.isArray(payload.appointments)
        ? payload.appointments
        : undefined,
      hours: Array.isArray(payload.hours) ? payload.hours : readHours(center.settings),
      centerName: center.name || payload.centerName || "le centre",
      centerAddress:
        [center.address_line1, center.postal_code, center.city]
          .filter(Boolean)
          .join(", ") ||
        payload.centerAddress ||
        "",
    });

    return res.status(200).json({
      ok: true,
      agent: "seya-planning",
      via: result.via,
      conversation: result.conversation,
      shouldBook: result.shouldBook,
      ai: hasAiKey(),
      centerId,
    });
  } catch (error) {
    console.error("[seya/planning]", error);
    return res.status(500).json({ error: "planning_failed" });
  }
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
    return text.startsWith("{") ? JSON.parse(text) : {};
  }
  return body;
}
