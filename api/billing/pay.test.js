const test = require("node:test");
const assert = require("node:assert/strict");

const stripeLib = require("../center/_stripe-lib");

const invoice = {
  id: "inv-1",
  number: "BK-2026-001",
  clientId: "client-1",
  issuedOn: "2026-10-10",
  status: "En attente de paiement",
  lines: [{ id: "l1", label: "Pack WhatsApp 100 conversations Seya", quantity: 1, unitPrice: 79, discountType: "Aucune", discountValue: 0 }],
  payToken: "token-1",
};

const files = new Map();
const supabase = {
  storage: {
    getBucket: async () => ({ data: {} }),
    from: () => ({
      download: async (path) =>
        files.has(path)
          ? { data: { text: async () => files.get(path) } }
          : { error: { statusCode: 404, message: "not found" } },
      upload: async (path, body) => {
        files.set(path, body.toString("utf8"));
        return {};
      },
    }),
  },
};
stripeLib.createServiceClient = () => supabase;

const handler = require("./pay");

function billing() {
  return JSON.parse(files.get("agency-billing/bookea.json"));
}

function call(query) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      statusCode: 200,
      setHeader(key, value) {
        this.headers[key] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        resolve({ status: this.statusCode, headers: this.headers, body });
      },
      end() {
        resolve({ status: this.statusCode, headers: this.headers, body: "" });
      },
      json(body) {
        resolve({ status: this.statusCode, headers: this.headers, body });
      },
    };
    handler({ method: "GET", query, headers: {} }, res);
  });
}

test("paiement par carte : Stripe, retour, facture payée", async (t) => {
  files.set(
    "agency-billing/bookea.json",
    JSON.stringify({
      company: "bookea",
      revision: 1,
      clients: [{ id: "client-1", name: "Clermont", email: "clermont@example.com" }],
      invoices: [invoice],
    }),
  );
  const originalFetch = global.fetch;
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    if (init.method === "POST") {
      return {
        ok: true,
        json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        id: "cs_test_1",
        payment_status: "paid",
        created: 1791622800,
        metadata: { bookea_invoice_id: "inv-1" },
      }),
    };
  };
  t.after(() => {
    global.fetch = originalFetch;
    process.env.STRIPE_SECRET_KEY = originalKey;
  });

  const invalid = await call({ i: "inv-1", t: "wrong" });
  assert.equal(invalid.status, 404);

  const start = await call({ i: "inv-1", t: "token-1" });
  assert.equal(start.status, 303);
  assert.equal(start.headers.Location, "https://checkout.stripe.com/c/pay/cs_test_1");
  const form = new URLSearchParams(requests[0].init.body);
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "7900");
  assert.equal(form.get("line_items[0][price_data][currency]"), "eur");
  assert.equal(form.get("metadata[bookea_invoice_id]"), "inv-1");
  assert.equal(form.get("customer_email"), "clermont@example.com");
  assert.match(form.get("success_url"), /i=inv-1&t=token-1&session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.deepEqual(billing().invoices[0].stripeSessionIds, ["cs_test_1"]);

  const back = await call({ i: "inv-1", t: "token-1", session_id: "cs_test_1" });
  assert.equal(back.status, 200);
  assert.match(back.body, /Merci, paiement reçu/);
  const paid = billing().invoices[0];
  assert.equal(paid.status, "Payée");
  assert.equal(paid.paymentMethod, "carte");
  assert.equal(paid.serverRevision, billing().revision);

  const again = await call({ i: "inv-1", t: "token-1" });
  assert.match(again.body, /déjà réglée/);
});
