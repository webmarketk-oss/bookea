const {
  createServiceClient,
  persistCenterStripe,
  stripeRequest,
  stripeStatusFromAccount,
  verifyStripeSignature,
} = require("./lib");

async function readRawBody(req) {
  if (typeof req.body === "string") {
    return req.body;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }
  if (req.rawBody) {
    return String(req.rawBody);
  }
  const chunks = [];
  try {
    for await (const chunk of req) {
      chunks.push(chunk);
    }
  } catch {
    chunks.length = 0;
  }
  if (chunks.length) {
    return Buffer.concat(chunks).toString("utf8");
  }
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }
  return "";
}

async function findCenterId(supabase, account) {
  const fromMeta = String(account?.metadata?.center_id || "").trim();
  if (fromMeta) {
    return fromMeta;
  }
  const accountId = String(account?.id || "");
  if (!accountId) {
    return "";
  }
  const { data } = await supabase
    .from("centers")
    .select("id")
    .contains("settings", { stripe: { accountId } })
    .maybeSingle();
  return data?.id || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const payload = await readRawBody(req);
  const signature = req.headers["stripe-signature"];

  if (secret && !verifyStripeSignature(payload, signature, secret)) {
    return res.status(400).json({ ok: false, error: "invalid_signature" });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return res.status(400).json({ ok: false, error: "invalid_json" });
  }

  if (event.type !== "account.updated") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  try {
    const accountId = String(event.data?.object?.id || "");
    if (!accountId) {
      return res.status(200).json({ ok: true, skipped: true });
    }
    const account = await stripeRequest("GET", `accounts/${accountId}`);
    const supabase = createServiceClient();
    const centerId = await findCenterId(supabase, account);
    if (!centerId) {
      return res.status(200).json({ ok: true, unmatched: true });
    }
    await persistCenterStripe(
      supabase,
      centerId,
      stripeStatusFromAccount(account),
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.code || "stripe_error",
      message: error.message,
    });
  }
};
