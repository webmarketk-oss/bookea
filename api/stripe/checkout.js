const {
  amountToCents,
  appBaseUrl,
  createServiceClient,
  isStripeConfigured,
  parsePayload,
  parseStoredStripe,
  persistCenterStripe,
  sanitizeId,
  stripeRequest,
  stripeStatusFromAccount,
} = require("./lib");

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

  if (!isStripeConfigured()) {
    return res.status(503).json({
      ok: false,
      error: "not_configured",
      message: "Stripe n’est pas encore configuré côté Bookea.",
    });
  }

  const payload = parsePayload(req.body);
  const centerId = sanitizeId(payload.centerId);
  const slug = String(payload.slug || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  const cents = amountToCents(payload.amount);
  const serviceName = String(payload.serviceName || "Acompte").trim().slice(0, 120);
  const customerEmail = String(payload.customerEmail || "").trim().slice(0, 180);
  const customerName = String(payload.customerName || "").trim().slice(0, 120);
  const bookingId = String(payload.bookingId || "").trim().slice(0, 80);

  if (cents < 50) {
    return res.status(400).json({
      ok: false,
      error: "invalid_amount",
      message: "Le montant d’acompte est trop bas pour Stripe.",
    });
  }

  try {
    const supabase = createServiceClient();
    let query = supabase.from("centers").select("id, name, slug, settings");
    if (centerId) {
      query = query.eq("id", centerId);
    } else if (slug) {
      query = query.eq("slug", slug);
    } else {
      return res.status(400).json({ ok: false, error: "missing_center" });
    }

    let { data: center, error } = await query.maybeSingle();
    if (!center?.id && slug && !centerId) {
      const byPublic = await supabase
        .from("centers")
        .select("id, name, slug, settings")
        .eq("public_slug", slug)
        .maybeSingle();
      center = byPublic.data;
      error = byPublic.error;
    }
    if (error) {
      throw error;
    }
    if (!center?.id) {
      return res.status(404).json({ ok: false, error: "center_not_found" });
    }

    let stored = parseStoredStripe(center.settings);
    if (!stored.accountId) {
      return res.status(409).json({
        ok: false,
        error: "not_connected",
        message: "Ce centre n’a pas encore connecté Stripe.",
      });
    }

    const account = await stripeRequest("GET", `accounts/${stored.accountId}`);
    stored = stripeStatusFromAccount(account);
    await persistCenterStripe(supabase, center.id, stored);

    if (!stored.chargesEnabled) {
      return res.status(409).json({
        ok: false,
        error: "not_ready",
        message: "Le compte Stripe du centre n’est pas encore prêt à encaisser.",
      });
    }

    const origin = appBaseUrl(req);
    const publicPath = `/centres/${center.slug || slug}`;
    const successUrl =
      String(payload.successUrl || "").trim() ||
      `${origin}${publicPath}?paid=1`;
    const cancelUrl =
      String(payload.cancelUrl || "").trim() ||
      `${origin}${publicPath}?paid=0`;

    const session = await stripeRequest("POST", "checkout/sessions", {
      mode: "payment",
      currency: "eur",
      customer_email: customerEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: cents,
            product_data: {
              name: `Acompte · ${serviceName}`,
            },
          },
        },
      ],
      payment_intent_data: {
        transfer_data: {
          destination: stored.accountId,
        },
        metadata: {
          center_id: center.id,
          booking_id: bookingId,
          service_name: serviceName,
          customer_name: customerName,
        },
      },
      metadata: {
        center_id: center.id,
        booking_id: bookingId,
        service_name: serviceName,
      },
    });

    return res.status(200).json({ ok: true, url: session.url, id: session.id });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({
      ok: false,
      error: error.code || "stripe_error",
      message: error.message || "Impossible de créer le paiement.",
    });
  }
};
