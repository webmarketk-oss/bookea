const {
  appBaseUrl,
  createServiceClient,
  firstQueryValue,
  isStripeConfigured,
  parsePayload,
  sanitizeId,
} = require("../center/_stripe-lib");
const { canManageCenterBilling } = require("./_center-auth");
const {
  finishCheckout,
  loadCenter,
  startOfferCheckout,
  syncPendingCheckouts,
} = require("./_offer-checkout");

function redirect(res, location) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  return res.status(303).end();
}

async function handleReturn(req, res) {
  const baseUrl = appBaseUrl(req);
  const sessionId = String(firstQueryValue(req.query?.session_id) || "").trim();
  if (!sessionId) {
    return redirect(res, `${baseUrl}/dashboard/tarifs`);
  }
  try {
    const { activated, path } = await finishCheckout(createServiceClient(), sessionId);
    const params = new URLSearchParams({ paiement: activated ? "ok" : "attente" });
    if (activated?.invoice?.invoice?.number) {
      params.set("facture", activated.invoice.invoice.number);
    }
    if (activated?.invoice?.emailedTo) {
      params.set("envoi", activated.invoice.emailedTo);
    }
    return redirect(res, `${baseUrl}${path}?${params.toString()}`);
  } catch (error) {
    console.error("[billing/checkout] return", error);
    return redirect(res, `${baseUrl}/dashboard/tarifs?paiement=attente`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return handleReturn(req, res);
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const payload = parsePayload(req.body);
  const centerId = sanitizeId(payload.centerId);
  if (!centerId) {
    return res.status(400).json({ ok: false, error: "Centre introuvable." });
  }

  try {
    const supabase = createServiceClient();
    if (!(await canManageCenterBilling(supabase, req, centerId))) {
      return res.status(403).json({ ok: false, error: "Accès refusé." });
    }
    if (!isStripeConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "Le paiement par carte n’est pas encore disponible. Contactez Bookea.",
      });
    }

    if (payload.action === "sync") {
      const center = await loadCenter(supabase, centerId);
      const activated = center ? await syncPendingCheckouts(supabase, center) : [];
      return res.status(200).json({ ok: true, activated: activated.length });
    }

    const url = await startOfferCheckout(supabase, {
      centerId,
      request: payload.offer,
      baseUrl: appBaseUrl(req),
    });
    if (!url) {
      throw new Error("Stripe n’a pas renvoyé de page de paiement.");
    }
    return res.status(200).json({ ok: true, url });
  } catch (error) {
    console.error("[billing/checkout]", error);
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Le paiement n’a pas pu démarrer. Réessayez.",
    });
  }
};
