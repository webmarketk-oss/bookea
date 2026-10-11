const test = require("node:test");
const assert = require("node:assert/strict");

const { readSmsQuota } = require("../sms/brevo");
const { applyPaidOffer, resolveOffer } = require("./_offers");
const {
  activatePaidCheckout,
  checkoutAlertId,
  startOfferCheckout,
  syncPendingCheckouts,
} = require("./_offer-checkout");
const { invoiceMail } = require("./_subscription-invoice");

const NOW = new Date("2026-10-10T10:00:00.000Z");

function fakeSupabase(settings = {}) {
  const files = new Map();
  const centers = [
    {
      id: "center-1",
      name: "Clermont Beauté",
      email: "clermont@example.com",
      city: "Clermont-Ferrand",
      settings,
    },
  ];
  return {
    files,
    centers,
    storage: {
      getBucket: async () => ({ data: { id: "bookea-admin-private" } }),
      from: () => ({
        download: async (path) =>
          files.has(path)
            ? { data: { text: async () => files.get(path) } }
            : { error: { statusCode: 404, message: "Object not found" } },
        upload: async (path, body) => {
          files.set(path, body.toString("utf8"));
          return {};
        },
      }),
    },
    from(table) {
      const filters = {};
      const query = {
        select: () => query,
        eq: (key, value) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => ({
          data:
            table === "centers"
              ? structuredClone(centers.find((row) => row.id === filters.id) || null)
              : null,
        }),
        update: (values) => ({
          eq: async (_key, id) => {
            Object.assign(centers.find((row) => row.id === id), structuredClone(values));
            return {};
          },
        }),
      };
      return query;
    },
  };
}

function mockStripe(t, respond) {
  const calls = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: String(init.body || "") });
    return { ok: true, status: 200, json: async () => respond(String(url), init) };
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey == null) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalKey;
    }
  });
  return calls;
}

function paidSession(overrides = {}) {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    status: "complete",
    amount_total: 6997,
    metadata: {
      bookea_center_id: "center-1",
      bookea_offer_type: "seya",
      bookea_offer_quantity: "100",
    },
    ...overrides,
  };
}

test("seules les offres du catalogue peuvent être payées, au prix Bookea", () => {
  assert.deepEqual(resolveOffer({}, { type: "seya", leads: 100 }), {
    type: "seya",
    kind: "seya_pack",
    quantity: 100,
    price: 69.97,
    label: "Pack WhatsApp 100 conversations Seya",
  });
  assert.equal(resolveOffer({}, { type: "seya", leads: 120 }), null);
  assert.equal(resolveOffer({}, { type: "sms", quantity: 30 }).price, 1.35);
  assert.equal(resolveOffer({}, { type: "sms", quantity: 31 }), null);
  assert.equal(resolveOffer({}, { type: "crm" }).price, 49);
  assert.equal(resolveOffer({}, { type: "renew_seya" }), null);
  assert.equal(
    resolveOffer({ seyaQuota: { packLeads: 200 } }, { type: "renew_seya" }).price,
    129.95,
  );
  assert.equal(resolveOffer({}, { type: "renew_crm" }), null);
  assert.equal(resolveOffer({}, { type: "gratuit" }), null);
});

test("un pack SMS payé crédite le solde du centre", () => {
  const { settings, alert } = applyPaidOffer(
    { sms: { quota: { remaining: 12, lastGrantMonth: "2026-10", monthlyGrant: 0, usedThisMonth: 3 } } },
    {
      centerName: "Clermont",
      offer: { type: "sms", kind: "sms_pack", quantity: 50, price: 2.25 },
      alertId: "a1",
      readSmsQuota,
      now: NOW,
    },
  );
  assert.equal(settings.sms.quota.remaining, 62);
  assert.equal(alert.paidAt, NOW.toISOString());
  assert.equal(alert.autoInvoice, true);
  assert.equal(settings.offerHistory[0].id, "a1");
});

test("un renouvellement payé prolonge d’un mois après l’échéance en cours", () => {
  const { settings, alert } = applyPaidOffer(
    {
      bookeaPlan: {
        id: "crm-plus",
        title: "CRM + SMS",
        price: 49,
        subscribedAt: "2026-09-20T10:00:00.000Z",
        renewsAt: "2026-10-20T10:00:00.000Z",
      },
    },
    {
      centerName: "Clermont",
      offer: { type: "renew_crm", kind: "crm_pack", quantity: 1, price: 49 },
      alertId: "a2",
      readSmsQuota,
      now: NOW,
    },
  );
  assert.match(settings.bookeaPlan.renewsAt, /^2026-11-20T/);
  assert.equal(settings.bookeaPlan.id, "crm-plus");
  assert.equal(alert.offer, "crm");
});

test("Souscrire ouvre une session Stripe au prix du pack, sans rien activer", async (t) => {
  const calls = mockStripe(t, () => ({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
  }));
  const supabase = fakeSupabase();
  const url = await startOfferCheckout(supabase, {
    centerId: "center-1",
    request: { type: "seya", leads: 100 },
    baseUrl: "https://www.bookeai.fr",
  });
  assert.equal(url, "https://checkout.stripe.com/c/pay/cs_test_1");
  const body = new URLSearchParams(calls[0].body);
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "6997");
  assert.equal(body.get("metadata[bookea_center_id]"), "center-1");
  assert.equal(body.get("customer_email"), "clermont@example.com");
  assert.match(body.get("success_url"), /\/api\/billing\/checkout\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  const settings = supabase.centers[0].settings;
  assert.equal(settings.seyaQuota, undefined);
  assert.equal(settings.adminAlerts, undefined);
  assert.equal(settings.pendingCheckouts[0].sessionId, "cs_test_1");
});

test("une offre payée s’active une seule fois avec sa facture marquée payée", async () => {
  const supabase = fakeSupabase({
    pendingCheckouts: [{ sessionId: "cs_test_1", createdAt: NOW.toISOString() }],
  });
  const first = await activatePaidCheckout(supabase, paidSession());
  const again = await activatePaidCheckout(supabase, paidSession());

  const settings = supabase.centers[0].settings;
  assert.equal(settings.seyaQuota.conversationLimit, 100);
  assert.equal(settings.adminAlerts.length, 1);
  assert.equal(settings.adminAlerts[0].id, checkoutAlertId("cs_test_1"));
  assert.equal(settings.adminAlerts[0].billingStatus, "invoiced");
  assert.deepEqual(settings.pendingCheckouts, []);
  assert.equal(first.invoice.created, true);
  assert.equal(again.invoice.created, false);

  const billing = JSON.parse(supabase.files.get("agency-billing/bookea.json"));
  assert.equal(billing.invoices.length, 1);
  assert.equal(billing.invoices[0].status, "Payée");
  assert.equal(billing.invoices[0].paymentMethod, "carte");
  assert.equal(billing.invoices[0].lines[0].unitPrice, 69.97);
});

test("un paiement non abouti n’active rien", async () => {
  const supabase = fakeSupabase();
  assert.equal(
    await activatePaidCheckout(supabase, paidSession({ payment_status: "unpaid" })),
    null,
  );
  assert.equal(supabase.centers[0].settings.seyaQuota, undefined);
});

test("le rattrapage active les paiements reçus et oublie les sessions expirées", async (t) => {
  mockStripe(t, (url) =>
    url.includes("cs_paid")
      ? paidSession({ id: "cs_paid" })
      : { id: "cs_gone", status: "expired", payment_status: "unpaid" },
  );
  const supabase = fakeSupabase({
    pendingCheckouts: [
      { sessionId: "cs_paid", createdAt: "2026-10-10T09:00:00.000Z" },
      { sessionId: "cs_gone", createdAt: "2026-10-10T08:00:00.000Z" },
    ],
  });
  const activated = await syncPendingCheckouts(
    supabase,
    supabase.centers[0],
    NOW.getTime(),
  );
  assert.equal(activated.length, 1);
  const settings = supabase.centers[0].settings;
  assert.equal(settings.seyaQuota.conversationLimit, 100);
  assert.deepEqual(settings.pendingCheckouts, []);
});

test("l’e-mail d’une facture déjà réglée n’affiche pas de bouton de paiement", () => {
  const mail = invoiceMail({
    number: "BK-2026-003",
    clientName: "Clermont Beauté",
    paidAt: NOW.toISOString(),
  });
  assert.match(mail.textContent, /réglée par carte bancaire le 10 octobre 2026/);
  assert.doesNotMatch(mail.htmlContent, /Payer par carte/);
});
