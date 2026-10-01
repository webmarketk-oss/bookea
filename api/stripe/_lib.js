const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

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
    if (text.startsWith("{") || text.startsWith("[")) {
      return JSON.parse(text);
    }
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  return body;
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80);
}

function appBaseUrl(req) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  const host = String(
    req?.headers?.["x-forwarded-host"] || req?.headers?.host || "",
  )
    .split(",")[0]
    .trim();
  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_BOOKEA_PUBLIC_URL || "https://www.bookeai.fr"
  ).replace(/\/+$/, "");
}

function flattenParams(value, prefix = "", acc) {
  const out = acc || {};
  if (value == null || value === "") {
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flattenParams(item, prefix ? `${prefix}[${index}]` : String(index), out);
    });
    return out;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      flattenParams(nested, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  if (!prefix) {
    return out;
  }
  if (typeof value === "boolean") {
    out[prefix] = value ? "true" : "false";
    return out;
  }
  out[prefix] = String(value);
  return out;
}

function stripeSecret() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

function isStripeConfigured() {
  return Boolean(stripeSecret());
}

async function stripeRequest(method, path, params) {
  const secret = stripeSecret();
  if (!secret) {
    const error = new Error("Stripe n’est pas encore configuré côté Bookea.");
    error.code = "not_configured";
    error.status = 503;
    throw error;
  }

  const url = `https://api.stripe.com/v1/${String(path || "").replace(/^\//, "")}`;
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": "2024-11-20.acacia",
  };
  const init = { method, headers };
  if (method !== "GET" && params) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(flattenParams(params)).toString();
  }

  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (json.error) {
    const error = new Error(json.error.message || "Erreur Stripe");
    error.code = json.error.code || "stripe_error";
    error.status = json.error.status_code || response.status;
    throw error;
  }
  return json;
}

function stripeStatusFromAccount(account) {
  const accountId = String(account?.id || "");
  return {
    accountId,
    chargesEnabled: account?.charges_enabled === true,
    payoutsEnabled: account?.payouts_enabled === true,
    detailsSubmitted: account?.details_submitted === true,
    email: String(account?.email || ""),
    livemode: account?.livemode === true,
    updatedAt: new Date().toISOString(),
  };
}

function accountLabel(accountId) {
  const id = String(accountId || "");
  if (!id) {
    return "";
  }
  return `acct_…${id.slice(-4)}`;
}

function parseStoredStripe(settings) {
  const stripe =
    settings && typeof settings === "object" ? settings.stripe : null;
  if (!stripe || typeof stripe !== "object") {
    return {
      accountId: "",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      email: "",
    };
  }
  return {
    accountId: String(stripe.accountId || ""),
    chargesEnabled: stripe.chargesEnabled === true,
    payoutsEnabled: stripe.payoutsEnabled === true,
    detailsSubmitted: stripe.detailsSubmitted === true,
    email: String(stripe.email || ""),
    livemode: stripe.livemode === true,
  };
}

function mergeStripeSettings(currentSettings, stripe, publicPatch) {
  const settings =
    currentSettings && typeof currentSettings === "object"
      ? { ...currentSettings }
      : {};
  const publicSettings =
    settings.public && typeof settings.public === "object"
      ? { ...settings.public }
      : {};
  settings.stripe =
    stripe && typeof stripe === "object" && Object.keys(stripe).length
      ? stripe
      : {};
  Object.assign(publicSettings, publicPatch || {});
  settings.public = publicSettings;
  return settings;
}

async function persistCenterStripe(supabase, centerId, stripe) {
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  const next = mergeStripeSettings(data?.settings, stripe, {
    stripeConnected: stripe?.chargesEnabled === true,
  });
  const updated = await supabase
    .from("centers")
    .update({ settings: next, updated_at: new Date().toISOString() })
    .eq("id", centerId)
    .select("id")
    .maybeSingle();
  if (updated.error) {
    throw updated.error;
  }
  return next;
}

function amountToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round(amount * 100);
}

function signaturesMatch(left, right) {
  const a = Buffer.from(String(left), "utf8");
  const b = Buffer.from(String(right), "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function verifyStripeSignature(
  payload,
  header,
  secret,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
) {
  if (!payload || !header || !secret) {
    return false;
  }
  const parts = String(header)
    .split(",")
    .map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  if (!timestamp || !signatures.length) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const matched = signatures.some((signature) =>
    signaturesMatch(signature, expected),
  );
  if (!matched) {
    return false;
  }
  return Math.abs(nowSec - Number(timestamp)) <= toleranceSec;
}

function clientStatus(stripe, configured = isStripeConfigured()) {
  return {
    ok: true,
    configured,
    connected: stripe.chargesEnabled === true,
    chargesEnabled: stripe.chargesEnabled === true,
    payoutsEnabled: stripe.payoutsEnabled === true,
    detailsSubmitted: stripe.detailsSubmitted === true,
    accountId: stripe.accountId || "",
    accountLabel: accountLabel(stripe.accountId),
    email: stripe.email || "",
    livemode: stripe.livemode === true,
  };
}

module.exports = {
  accountLabel,
  amountToCents,
  appBaseUrl,
  clientStatus,
  createServiceClient,
  firstQueryValue,
  flattenParams,
  isStripeConfigured,
  mergeStripeSettings,
  parsePayload,
  parseStoredStripe,
  persistCenterStripe,
  sanitizeId,
  stripeRequest,
  stripeSecret,
  stripeStatusFromAccount,
  verifyStripeSignature,
};
