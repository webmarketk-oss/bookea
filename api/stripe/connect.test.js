const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  accountLabel,
  amountToCents,
  clientStatus,
  flattenParams,
  mergeStripeSettings,
  parseStoredStripe,
  stripeStatusFromAccount,
  verifyStripeSignature,
} = require("./lib");

test("flattenParams encode un Checkout Session", () => {
  const encoded = flattenParams({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: 2500,
          product_data: { name: "Acompte · Hydrafacial" },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: { destination: "acct_123" },
    },
  });
  assert.equal(encoded.mode, "payment");
  assert.equal(encoded["line_items[0][quantity]"], "1");
  assert.equal(encoded["line_items[0][price_data][unit_amount]"], "2500");
  assert.equal(
    encoded["payment_intent_data[transfer_data][destination]"],
    "acct_123",
  );
});

test("flattenParams encode les capabilities Stripe", () => {
  assert.deepEqual(
    flattenParams({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    }),
    {
      type: "express",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
    },
  );
});

test("stripeStatusFromAccount lit charges_enabled", () => {
  const status = stripeStatusFromAccount({
    id: "acct_1234567890",
    charges_enabled: true,
    payouts_enabled: false,
    details_submitted: true,
    email: "centre@bookea.fr",
    livemode: false,
  });
  assert.equal(status.accountId, "acct_1234567890");
  assert.equal(status.chargesEnabled, true);
  assert.equal(status.payoutsEnabled, false);
  assert.equal(status.detailsSubmitted, true);
  assert.equal(clientStatus(status, true).connected, true);
  assert.equal(accountLabel(status.accountId), "acct_…7890");
});

test("parseStoredStripe et merge gardent le public du centre", () => {
  const merged = mergeStripeSettings(
    { public: { stripeConnected: false, coverPreview: "x" }, seya: { on: true } },
    { accountId: "acct_1", chargesEnabled: true },
    { stripeConnected: true },
  );
  assert.equal(merged.public.coverPreview, "x");
  assert.equal(merged.public.stripeConnected, true);
  assert.equal(merged.seya.on, true);
  assert.equal(parseStoredStripe(merged).accountId, "acct_1");
  assert.equal(parseStoredStripe(merged).chargesEnabled, true);
});

test("disconnect vide le mapping Stripe sans toucher Seya", () => {
  const merged = mergeStripeSettings(
    { public: { stripeConnected: true }, stripe: { accountId: "acct_1" }, seya: { on: true } },
    {},
    { stripeConnected: false },
  );
  assert.deepEqual(merged.stripe, {});
  assert.equal(merged.public.stripeConnected, false);
  assert.equal(merged.seya.on, true);
  assert.equal(parseStoredStripe(merged).accountId, "");
});

test("amountToCents arrondit en centimes", () => {
  assert.equal(amountToCents(25), 2500);
  assert.equal(amountToCents("19.9"), 1990);
  assert.equal(amountToCents(0), 0);
  assert.equal(amountToCents(-5), 0);
});

test("verifyStripeSignature accepte une signature v1 valide", () => {
  const payload = "{\"id\":\"evt_1\"}";
  const secret = "whsec_test";
  const timestamp = 1_700_000_000;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  assert.equal(
    verifyStripeSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      secret,
      300,
      timestamp,
    ),
    true,
  );
  assert.equal(
    verifyStripeSignature(
      payload,
      `t=${timestamp},v1=deadbeef`,
      secret,
      300,
      timestamp,
    ),
    false,
  );
});
