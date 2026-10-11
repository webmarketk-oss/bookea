const { amountToCents, stripeRequest } = require("../center/_stripe-lib");
const { isValidEmail } = require("../mailing/mailbox-lib");
const { readSmsQuota } = require("../sms/brevo");
const { applyPaidOffer, resolveOffer } = require("./_offers");
const { invoiceCenterAlert } = require("./_subscription-invoice");

const PENDING_LIMIT = 10;
const PENDING_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const OFFER_KINDS = {
  seya: "seya_pack",
  renew_seya: "seya_pack",
  sms: "sms_pack",
  crm: "crm_pack",
  renew_crm: "crm_pack",
};

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function checkoutAlertId(sessionId) {
  return `stripe-${sessionId}`;
}

function tarifsPath(type) {
  if (type === "sms") {
    return "/dashboard/tarifs/sms";
  }
  if (type === "crm" || type === "renew_crm") {
    return "/dashboard/tarifs/crm";
  }
  return "/dashboard/tarifs/whatsapp";
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function loadCenter(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,email,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function saveSettings(supabase, centerId, settings) {
  const { error } = await supabase
    .from("centers")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", centerId);
  if (error) {
    throw error;
  }
}

function offerFromSession(session) {
  const metadata = asRecord(session?.metadata);
  const type = String(metadata.bookea_offer_type || "");
  const quantity = Math.floor(Number(metadata.bookea_offer_quantity));
  const price = Number(session?.amount_total) / 100;
  if (!OFFER_KINDS[type] || !(quantity > 0) || !(price > 0)) {
    return null;
  }
  return { type, kind: OFFER_KINDS[type], quantity, price };
}

async function startOfferCheckout(supabase, { centerId, request, baseUrl }) {
  const center = await loadCenter(supabase, centerId);
  if (!center) {
    throw httpError(404, "Centre introuvable.");
  }
  const offer = resolveOffer(center.settings, request);
  if (!offer) {
    throw httpError(400, "Cette offre n’est pas disponible.");
  }
  const metadata = {
    bookea_center_id: center.id,
    bookea_offer_type: offer.type,
    bookea_offer_quantity: String(offer.quantity),
  };
  const session = await stripeRequest("POST", "checkout/sessions", {
    mode: "payment",
    locale: "fr",
    client_reference_id: center.id,
    customer_email: isValidEmail(center.email) ? String(center.email).trim() : undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amountToCents(offer.price),
          product_data: { name: offer.label },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      description: `${center.name || "Centre"} — ${offer.label}`,
      metadata,
    },
    success_url: `${baseUrl}/api/billing/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}${tarifsPath(offer.type)}?paiement=annule`,
  });

  const latest = asRecord((await loadCenter(supabase, centerId))?.settings);
  await saveSettings(supabase, centerId, {
    ...latest,
    pendingCheckouts: [
      { sessionId: session.id, createdAt: new Date().toISOString() },
      ...asArray(latest.pendingCheckouts).filter((item) => item?.sessionId !== session.id),
    ].slice(0, PENDING_LIMIT),
  });
  return String(session.url || "");
}

async function activatePaidCheckout(supabase, session) {
  const centerId = String(asRecord(session?.metadata).bookea_center_id || "");
  const offer = offerFromSession(session);
  if (session?.payment_status !== "paid" || !centerId || !offer) {
    return null;
  }
  const alertId = checkoutAlertId(session.id);
  const center = await loadCenter(supabase, centerId);
  if (!center) {
    return null;
  }
  const settings = asRecord(center.settings);
  const pendingCheckouts = asArray(settings.pendingCheckouts).filter(
    (item) => item?.sessionId !== session.id,
  );
  if (!asArray(settings.adminAlerts).some((alert) => alert?.id === alertId)) {
    const applied = applyPaidOffer(settings, {
      centerName: center.name || "Centre Bookea",
      offer,
      alertId,
      readSmsQuota,
    });
    await saveSettings(supabase, centerId, { ...applied.settings, pendingCheckouts });
  } else if (pendingCheckouts.length !== asArray(settings.pendingCheckouts).length) {
    await saveSettings(supabase, centerId, { ...settings, pendingCheckouts });
  }
  const invoice = await invoiceCenterAlert(supabase, { centerId, alertId });
  return { centerId, offer, invoice };
}

async function finishCheckout(supabase, sessionId) {
  const session = await stripeRequest(
    "GET",
    `checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  const activated = await activatePaidCheckout(supabase, session);
  const type = String(asRecord(session?.metadata).bookea_offer_type || "");
  return { activated, path: tarifsPath(type) };
}

async function syncPendingCheckouts(supabase, center, now = Date.now()) {
  const pending = asArray(asRecord(center?.settings).pendingCheckouts);
  const results = [];
  const expired = [];
  for (const item of pending) {
    const sessionId = String(item?.sessionId || "");
    if (!sessionId) {
      continue;
    }
    if (now - Date.parse(item.createdAt || "") > PENDING_MAX_AGE_MS) {
      expired.push(sessionId);
      continue;
    }
    const session = await stripeRequest(
      "GET",
      `checkout/sessions/${encodeURIComponent(sessionId)}`,
    ).catch(() => null);
    if (session?.payment_status === "paid") {
      const activated = await activatePaidCheckout(supabase, session);
      if (activated) {
        results.push(activated);
      }
    } else if (session?.status === "expired") {
      expired.push(sessionId);
    }
  }
  if (expired.length) {
    const latest = asRecord((await loadCenter(supabase, center.id))?.settings);
    await saveSettings(supabase, center.id, {
      ...latest,
      pendingCheckouts: asArray(latest.pendingCheckouts).filter(
        (item) => !expired.includes(item?.sessionId),
      ),
    });
  }
  return results;
}

module.exports = {
  activatePaidCheckout,
  checkoutAlertId,
  finishCheckout,
  loadCenter,
  offerFromSession,
  startOfferCheckout,
  syncPendingCheckouts,
};
