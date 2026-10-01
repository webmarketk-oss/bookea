const {
  appBaseUrl,
  clientStatus,
  createServiceClient,
  firstQueryValue,
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const payload = parsePayload(req.body);
  const centerId = sanitizeId(
    payload.centerId || firstQueryValue(req.query?.centerId),
  );
  const action = String(
    payload.action ||
      firstQueryValue(req.query?.action) ||
      (req.method === "GET" ? "status" : "start"),
  ).trim();

  if (!centerId) {
    return res.status(400).json({ ok: false, error: "missing_center" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const supabase = createServiceClient();
    const { data: center, error } = await supabase
      .from("centers")
      .select("id, name, slug, email, settings")
      .eq("id", centerId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!center?.id) {
      return res.status(404).json({ ok: false, error: "center_not_found" });
    }

    if (!isStripeConfigured()) {
      return res.status(req.method === "GET" ? 200 : 503).json({
        ...clientStatus(parseStoredStripe(center.settings), false),
        error: "not_configured",
        message:
          "Stripe n’est pas encore configuré côté Bookea. Ajoute STRIPE_SECRET_KEY dans Vercel.",
      });
    }

    if (action === "disconnect") {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
      }
      await persistCenterStripe(supabase, centerId, {
        disconnectedAt: new Date().toISOString(),
      });
      return res.status(200).json({
        ...clientStatus({
          accountId: "",
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          email: "",
        }),
        ok: true,
      });
    }

    let stored = parseStoredStripe(center.settings);
    if (stored.accountId) {
      try {
        const account = await stripeRequest(
          "GET",
          `accounts/${stored.accountId}`,
        );
        stored = stripeStatusFromAccount(account);
        await persistCenterStripe(supabase, centerId, stored);
      } catch (error) {
        if (error?.code === "resource_missing" || error?.status === 404) {
          stored = {
            accountId: "",
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            email: "",
          };
          await persistCenterStripe(supabase, centerId, {});
        } else {
          throw error;
        }
      }
    }

    if (action === "status" || req.method === "GET") {
      if (
        !stored.accountId &&
        center.settings?.public?.stripeConnected === true
      ) {
        await persistCenterStripe(supabase, centerId, {});
      }
      return res.status(200).json(clientStatus(stored));
    }

    if (action === "dashboard") {
      if (!stored.accountId || !stored.chargesEnabled) {
        return res.status(409).json({
          ok: false,
          error: "not_ready",
          message: "Le compte Stripe du centre n’est pas encore prêt à encaisser.",
        });
      }
      const link = await stripeRequest(
        "POST",
        `accounts/${stored.accountId}/login_links`,
      );
      return res.status(200).json({ ok: true, url: link.url, ...clientStatus(stored) });
    }

    if (action !== "start" && action !== "refresh") {
      return res.status(400).json({ ok: false, error: "unknown_action" });
    }

    if (!stored.accountId) {
      const account = await stripeRequest("POST", "accounts", {
        type: "express",
        country: "FR",
        email: center.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          center_id: center.id,
          center_slug: center.slug || "",
          center_name: center.name || "",
        },
      });
      stored = stripeStatusFromAccount(account);
      await persistCenterStripe(supabase, centerId, stored);
    }

    const origin = appBaseUrl(req);
    const returnPath = "/dashboard/parametres-centre?tab=paiements";
    const link = await stripeRequest("POST", "account_links", {
      account: stored.accountId,
      refresh_url: `${origin}${returnPath}&stripe=refresh`,
      return_url: `${origin}${returnPath}&stripe=return`,
      type: "account_onboarding",
    });

    return res.status(200).json({
      ok: true,
      url: link.url,
      ...clientStatus(stored),
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({
      ok: false,
      error: error.code || "stripe_error",
      message: error.message || "Impossible de connecter Stripe.",
    });
  }
};
