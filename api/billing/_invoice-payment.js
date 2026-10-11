const {
  amountToCents,
  isStripeConfigured,
  stripeRequest,
} = require("../center/_stripe-lib");
const {
  readBilling,
  updateServerBilling,
} = require("../admin/_agency-billing-store");
const {
  invoicePayUrl,
  invoiceTotal,
  markInvoicePaid,
  normalizeServerBilling,
  payTokenMatches,
  rememberStripeSession,
} = require("./_agency-invoice");

const COMPANIES = ["bookea", "webk"];
const SESSION_CHECK_MS = 2 * 24 * 60 * 60 * 1000;

async function loadCompanyBilling(supabase, company) {
  return normalizeServerBilling(company, await readBilling(supabase, company));
}

async function findPayableInvoice(supabase, invoiceId, token) {
  let state = null;
  for (const company of COMPANIES) {
    state = await loadCompanyBilling(supabase, company);
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (invoice) {
      return { state, invoice: payTokenMatches(invoice, token) ? invoice : null };
    }
  }
  return { state, invoice: null };
}

function invoiceAmountCents(invoice) {
  return amountToCents(invoiceTotal(invoice));
}

async function startCardPayment(supabase, state, invoice) {
  const client = state.clients.find((item) => item.id === invoice.clientId);
  const payUrl = invoicePayUrl(invoice);
  const session = await stripeRequest("POST", "checkout/sessions", {
    mode: "payment",
    locale: "fr",
    customer_email: String(client?.email || "").trim() || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: invoiceAmountCents(invoice),
          product_data: {
            name: `Facture ${invoice.number}`,
            description:
              invoice.lines.map((line) => line.label).join(", ").slice(0, 300) ||
              undefined,
          },
        },
      },
    ],
    metadata: {
      bookea_invoice_id: invoice.id,
      bookea_invoice_number: invoice.number,
      bookea_company: state.company,
    },
    payment_intent_data: {
      description: `Facture ${invoice.number}`,
      metadata: { bookea_invoice_id: invoice.id },
    },
    success_url: `${payUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${payUrl}&etat=annule`,
  });

  await updateServerBilling(supabase, state.company, (current) =>
    current.invoices.some((item) => item.id === invoice.id)
      ? {
          state: {
            ...current,
            invoices: current.invoices.map((item) =>
              item.id === invoice.id ? rememberStripeSession(item, session.id) : item,
            ),
          },
          invoiceIds: [invoice.id],
        }
      : null,
  );
  return String(session.url || "");
}

async function paidSession(sessionId, invoiceId) {
  const session = await stripeRequest(
    "GET",
    `checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  return session?.payment_status === "paid" &&
    session?.metadata?.bookea_invoice_id === invoiceId
    ? session
    : null;
}

async function markPaid(supabase, company, payments) {
  const byId = new Map(payments.map((payment) => [payment.invoiceId, payment]));
  const result = await updateServerBilling(supabase, company, (current) => {
    const changed = current.invoices.filter(
      (item) => byId.has(item.id) && item.status !== "Payée",
    );
    if (!changed.length) {
      return null;
    }
    return {
      state: {
        ...current,
        invoices: current.invoices.map((item) =>
          byId.has(item.id) ? markInvoicePaid(item, byId.get(item.id)) : item,
        ),
      },
      invoiceIds: changed.map((item) => item.id),
    };
  });
  return result.state;
}

async function confirmCardPayment(supabase, company, invoiceId, sessionId) {
  const session = await paidSession(sessionId, invoiceId);
  if (!session) {
    return false;
  }
  await markPaid(supabase, company, [
    {
      invoiceId,
      paidAt: session.created
        ? new Date(session.created * 1000).toISOString()
        : new Date().toISOString(),
    },
  ]);
  return true;
}

async function reconcileCardPayments(supabase, company, now = Date.now()) {
  if (!isStripeConfigured()) {
    return null;
  }
  const state = await loadCompanyBilling(supabase, company);
  const pending = state.invoices
    .filter(
      (invoice) =>
        invoice.status !== "Payée" &&
        invoice.status !== "Annulée" &&
        Array.isArray(invoice.stripeSessionIds) &&
        invoice.stripeSessionIds.length > 0 &&
        now - Date.parse(invoice.stripeSessionAt || "") < SESSION_CHECK_MS,
    )
    .slice(0, 10);
  const payments = [];
  for (const invoice of pending) {
    for (const sessionId of invoice.stripeSessionIds) {
      const session = await paidSession(sessionId, invoice.id).catch(() => null);
      if (session) {
        payments.push({
          invoiceId: invoice.id,
          paidAt: new Date((session.created || now / 1000) * 1000).toISOString(),
        });
        break;
      }
    }
  }
  return payments.length ? markPaid(supabase, company, payments) : null;
}

module.exports = {
  COMPANIES,
  confirmCardPayment,
  findPayableInvoice,
  invoiceAmountCents,
  reconcileCardPayments,
  startCardPayment,
};
