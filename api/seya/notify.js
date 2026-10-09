const { createClient } = require("@supabase/supabase-js");
const { loadBookeaSenderMailbox } = require("../mailing/mailbox-lib");
const { readCenterSeya } = require("./store");
const {
  notifyMailStatus,
  sendCenterNotifyTest,
} = require("./center-notify");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

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
    return text.startsWith("{") ? JSON.parse(text) : {};
  }
  return body;
}

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

function notifyErrorMessage(reason, extra) {
  if (reason === "no_email") {
    return "Indiquez l’email du centre, puis renvoyez un test.";
  }
  if (reason === "missing_brevo") {
    return "L’envoi n’est pas encore branché : la clé Brevo (la même que pour les SMS) manque.";
  }
  if (reason === "missing_sender") {
    return "Connectez info@bookeai.fr dans Admin → Centre de notifications.";
  }
  if (reason === "send_failed") {
    return extra || "Brevo a refusé l’envoi. L’expéditeur doit être un email vérifié dans Brevo.";
  }
  return extra || "Impossible d’envoyer le test.";
}

async function loadCenterNotify(centerId, typedEmail) {
  const supabase = createServiceClient();
  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,email,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error || !center) {
    return { error: "unknown_center" };
  }
  const latest = await readCenterSeya(supabase, centerId);
  const profile = asRecord(latest.seya.centerProfile);
  const seya = {
    ...latest.seya,
    centerProfile: {
      ...profile,
      supportEmail: String(typedEmail || "").trim() || profile.supportEmail,
    },
  };
  const bookeaMailbox = await loadBookeaSenderMailbox(supabase);
  return { center, seya, bookeaMailbox };
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
        ? { centerId: firstValue(req.query?.centerId), email: firstValue(req.query?.email) }
        : parsePayload(req.body);
    const centerId = String(payload.centerId || "").trim();
    if (!centerId) {
      return res.status(400).json({ ok: false, error: "missing_center" });
    }

    const loaded = await loadCenterNotify(centerId, payload.email);
    if (loaded.error) {
      return res.status(404).json({ ok: false, error: loaded.error });
    }

    const status = notifyMailStatus(
      loaded.center,
      loaded.seya,
      loaded.bookeaMailbox,
    );
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, ...status });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const result = await sendCenterNotifyTest({
      center: loaded.center,
      seya: loaded.seya,
    });
    const brevoError = result.results?.find((item) => item.error)?.error;
    return res.status(result.sent ? 200 : 409).json({
      ok: result.sent,
      reason: result.reason,
      recipients: result.recipients || status.recipients,
      sender: result.sender || status.sender,
      error: result.sent ? undefined : notifyErrorMessage(result.reason, brevoError),
    });
  } catch (error) {
    console.error("[seya/notify]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "notify_failed",
    });
  }
};
