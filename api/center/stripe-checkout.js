const {
  createServiceClient,
  isStripeConfigured,
  parsePayload,
  parseStoredStripe,
  persistCenterStripe,
  sanitizeId,
  stripeRequest,
  stripeStatusFromAccount,
} = require("./_stripe-lib");

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
  const serviceName = String(payload.serviceName || "Acompte").trim().slice(0, 120);
  const customerEmail = String(payload.customerEmail || "").trim().slice(0, 180);
  const customerName = String(payload.customerName || "").trim().slice(0, 120);
  const bookingId = String(payload.bookingId || "").trim().slice(0, 80);

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
    center = {
      ...center,
      settings: { ...(center.settings || {}), stripe: stored },
    };

    if (!stored.chargesEnabled) {
      return res.status(409).json({
        ok: false,
        error: "not_ready",
        message: "Le compte Stripe du centre n’est pas encore prêt à encaisser.",
      });
    }

    const { startOnlineDeposit } = require("./online-deposit");
    const online = await startOnlineDeposit(
      supabase,
      center,
      {
        bookingId,
        treatment: serviceName,
        date: String(payload.date || "").slice(0, 10),
        start: String(payload.start || payload.time || "").slice(0, 5),
        duration: Number(payload.duration) > 0 ? Number(payload.duration) : 60,
        firstName: customerName,
        lastName: "",
        email: customerEmail,
        phone: String(payload.phone || ""),
      },
      req,
    );
    if (!online) {
      return res.status(409).json({
        ok: false,
        error: "no_deposit",
        message: "Cette prestation ne demande pas d’acompte en ligne.",
      });
    }
    return res.status(online.status).json({
      ...online.body,
      url: online.body.checkoutUrl,
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({
      ok: false,
      error: error.code || "stripe_error",
      message: error.message || "Impossible de créer le paiement.",
    });
  }
};
