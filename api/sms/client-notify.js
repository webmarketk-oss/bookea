const {
  createServiceClient,
  mergeCenterSmsSettings,
  parseCenterSmsSettings,
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
    return text.startsWith("{") || text.startsWith("[")
      ? JSON.parse(text)
      : Object.fromEntries(new URLSearchParams(text).entries());
  }
  return body;
}

function asBoolean(value, fallback = true) {
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  return fallback;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const payload =
      req.method === "GET"
        ? { clientId: firstValue(req.query?.clientId) }
        : parsePayload(req.body);
    const clientId = String(payload.clientId || "").trim();

    if (!clientId) {
      return res.status(400).json({ ok: false, error: "missing_client" });
    }

    const supabase = createServiceClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id,center_id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError) {
      throw new Error(clientError.message);
    }
    if (!client?.center_id) {
      return res.status(404).json({ ok: false, error: "unknown_client" });
    }

    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select("id,settings")
      .eq("id", client.center_id)
      .maybeSingle();

    if (centerError) {
      throw new Error(centerError.message);
    }
    if (!center) {
      return res.status(404).json({ ok: false, error: "unknown_center" });
    }

    const sms = parseCenterSmsSettings(center.settings);
    const current = sms.clientNotify?.[clientId] || { sms: true, email: true };

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        clientId,
        sms: current.sms !== false,
        email: current.email !== false,
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const nextPref = {
      sms: payload.sms === undefined ? current.sms !== false : asBoolean(payload.sms),
      email:
        payload.email === undefined ? current.email !== false : asBoolean(payload.email),
    };
    const clientNotify = {
      ...(sms.clientNotify || {}),
      [clientId]: nextPref,
    };

    const { error: updateError } = await supabase
      .from("centers")
      .update({
        settings: mergeCenterSmsSettings(center.settings, { clientNotify }),
      })
      .eq("id", center.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return res.status(200).json({
      ok: true,
      clientId,
      sms: nextPref.sms,
      email: nextPref.email,
    });
  } catch (error) {
    console.error("[sms/client-notify]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "notify_pref_failed",
    });
  }
};
