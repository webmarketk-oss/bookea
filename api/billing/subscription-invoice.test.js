const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ensureSubscriptionInvoice,
  invoicePayUrl,
  markInvoicePaid,
  mergeIncomingBilling,
  payTokenMatches,
} = require("./_agency-invoice");
const { buildAgencyInvoicePdf } = require("./_agency-invoice-pdf");
const {
  invoiceCenterAlert,
  invoiceMail,
  pendingAutoInvoiceAlerts,
} = require("./_subscription-invoice");

const center = {
  id: "center-1",
  name: "Clermont Beauté",
  city: "Clermont-Ferrand",
  email: "clermont@example.com",
  phone: "",
  address_line1: "12 rue Blatin",
  postal_code: "63000",
};

const alert = {
  id: "alert-1",
  kind: "seya_pack",
  createdAt: "2026-10-10T09:00:00.000Z",
  readAt: null,
  title: "Clermont Beauté a souscrit 100 conversations Seya",
  message: "Clermont Beauté a souscrit 100 conversations Seya — 79 €",
  amountEuros: 79,
  quantity: 100,
  billingStatus: "to_invoice",
  autoInvoice: true,
};

function fakeSupabase({ billing = null, mailbox = null } = {}) {
  const files = new Map(
    billing ? [["agency-billing/bookea.json", JSON.stringify(billing)]] : [],
  );
  const centers = [{ ...center, settings: { adminAlerts: [alert] } }];
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
        maybeSingle: async () => {
          if (table === "centers") {
            return { data: centers.find((row) => row.id === filters.id) || null };
          }
          if (table === "bookea_features") {
            return { data: mailbox ? { description: JSON.stringify(mailbox) } : null };
          }
          return { data: null };
        },
        update: (values) => ({
          eq: async (_key, id) => {
            Object.assign(centers.find((row) => row.id === id), values);
            return {};
          },
        }),
      };
      return query;
    },
  };
}

function storedBilling(supabase) {
  return JSON.parse(supabase.files.get("agency-billing/bookea.json"));
}

test("une sauvegarde de l’admin garde les factures créées ou payées par le serveur entre-temps", () => {
  const stored = {
    company: "bookea",
    revision: 5,
    clients: [{ id: "c1", name: "Clermont" }],
    invoices: [
      { id: "auto", number: "BK-2026-002", status: "En attente de paiement", serverRevision: 5 },
      { id: "paid", number: "BK-2026-001", status: "Payée", serverRevision: 4 },
      { id: "old", number: "BK-2025-009", status: "Payée", serverRevision: 2 },
    ],
  };
  const incoming = {
    company: "bookea",
    revision: 3,
    clients: [{ id: "c1", name: "Clermont" }],
    invoices: [{ id: "paid", number: "BK-2026-001", status: "En attente de paiement" }],
  };
  const merged = mergeIncomingBilling(stored, incoming);
  assert.equal(merged.revision, 6);
  assert.deepEqual(merged.invoices.map((item) => item.id).sort(), ["auto", "paid"]);
  assert.equal(merged.invoices.find((item) => item.id === "paid").status, "Payée");
});

test("une facture supprimée par l’admin après l’avoir vue ne revient pas", () => {
  const merged = mergeIncomingBilling(
    {
      company: "bookea",
      revision: 5,
      clients: [],
      invoices: [{ id: "auto", status: "En attente de paiement", serverRevision: 5 }],
    },
    { company: "bookea", revision: 5, clients: [], invoices: [] },
  );
  assert.deepEqual(merged.invoices, []);
});

test("une souscription ne crée qu’une seule facture", () => {
  const first = ensureSubscriptionInvoice(
    { company: "bookea", clients: [], invoices: [] },
    { center: { ...center, legalName: "", address: "" }, alert },
  );
  const again = ensureSubscriptionInvoice(first.state, {
    center: { ...center, legalName: "", address: "" },
    alert,
  });
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.state.invoices.length, 1);
  assert.equal(first.invoice.number, "BK-2026-001");
  assert.equal(first.invoice.lines[0].unitPrice, 79);
});

test("le lien de paiement n’ouvre que la bonne facture", () => {
  const invoice = { id: "inv-1", payToken: "secret-token" };
  assert.match(invoicePayUrl(invoice), /\/api\/billing\/pay\?i=inv-1&t=secret-token$/);
  assert.equal(payTokenMatches(invoice, "secret-token"), true);
  assert.equal(payTokenMatches(invoice, "secret-tokem"), false);
  assert.equal(payTokenMatches({ id: "inv-2" }, ""), false);
  assert.equal(invoicePayUrl({ id: "inv-2" }), "");
});

test("un paiement carte passe la facture en payée une seule fois", () => {
  const paid = markInvoicePaid(
    { id: "a", status: "En attente de paiement" },
    { paidAt: "2026-10-10T10:00:00.000Z" },
  );
  assert.equal(paid.status, "Payée");
  assert.equal(paid.paymentMethod, "carte");
  assert.equal(markInvoicePaid(paid, { paidAt: "2026-10-11T00:00:00.000Z" }), paid);
});

test("le filet de sécurité ne refacture que les nouvelles souscriptions oubliées", () => {
  const now = Date.parse("2026-10-10T10:00:00.000Z");
  const pending = pendingAutoInvoiceAlerts(
    {
      adminAlerts: [
        alert,
        { ...alert, id: "fresh", createdAt: "2026-10-10T09:55:00.000Z" },
        { ...alert, id: "done", billingStatus: "invoiced" },
        { ...alert, id: "old", autoInvoice: undefined },
        { ...alert, id: "expired", kind: "pack_expired" },
      ],
    },
    now,
  );
  assert.deepEqual(pending.map((item) => item.id), ["alert-1"]);
});

test("l’e-mail contient le bouton de paiement par carte", () => {
  const mail = invoiceMail({
    number: "BK-2026-001",
    clientName: "Clermont Beauté",
    payUrl: "https://www.bookeai.fr/api/billing/pay?i=a&t=b",
  });
  assert.equal(mail.subject, "Votre facture BK-2026-001");
  assert.match(mail.textContent, /par carte bancaire ici :\nhttps:\/\/www\.bookeai\.fr/);
  assert.match(mail.htmlContent, /Payer par carte/);
  assert.doesNotMatch(invoiceMail({ number: "X", clientName: "Y" }).htmlContent, /Payer par carte/);
});

test("la facture PDF est générée côté serveur", () => {
  const prepared = ensureSubscriptionInvoice(
    { company: "bookea", clients: [], invoices: [] },
    { center: { ...center, legalName: "", address: "" }, alert },
  );
  const pdf = Buffer.from(buildAgencyInvoicePdf(prepared.state, prepared.invoice), "base64");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("la souscription crée la facture dans Facture admin Bookea, sans e-mail si la boîte Bookea n’est pas connectée", async () => {
  const supabase = fakeSupabase({
    billing: { company: "bookea", revision: 2, clients: [], invoices: [] },
  });
  const result = await invoiceCenterAlert(supabase, {
    centerId: "center-1",
    alertId: "alert-1",
  });
  const billing = storedBilling(supabase);
  assert.equal(result.created, true);
  assert.match(result.mailError, /boîte mail Bookea/);
  assert.equal(billing.invoices.length, 1);
  assert.equal(billing.invoices[0].sourceAlertId, "alert-1");
  assert.ok(billing.invoices[0].payToken);
  assert.equal(billing.invoices[0].serverRevision, 3);
  assert.equal(billing.clients[0].centerId, "center-1");
  const savedAlert = supabase.centers[0].settings.adminAlerts[0];
  assert.equal(savedAlert.billingStatus, "invoiced");
  assert.equal(savedAlert.invoiceId, billing.invoices[0].id);
  assert.equal(savedAlert.readAt, null);

  const again = await invoiceCenterAlert(supabase, {
    centerId: "center-1",
    alertId: "alert-1",
  });
  assert.equal(again.created, false);
  assert.equal(storedBilling(supabase).invoices.length, 1);
});

test("la facture part par e-mail avec le PDF quand la boîte Bookea est connectée", async (t) => {
  const sent = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-key";
  global.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ messageId: "m1" }) };
  };
  t.after(() => {
    global.fetch = originalFetch;
    process.env.BREVO_API_KEY = originalKey;
  });

  const supabase = fakeSupabase({
    mailbox: { email: "factures@bookeai.fr", name: "Bookea", verified: true },
  });
  const result = await invoiceCenterAlert(supabase, {
    centerId: "center-1",
    alertId: "alert-1",
  });
  assert.equal(result.emailedTo, "clermont@example.com");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.to[0].email, "clermont@example.com");
  assert.equal(sent[0].body.attachment[0].name, "BK-2026-001.pdf");
  const billing = storedBilling(supabase);
  assert.equal(billing.invoices[0].emailedTo, "clermont@example.com");
  assert.equal(supabase.centers[0].settings.adminAlerts[0].emailedTo, "clermont@example.com");
});
