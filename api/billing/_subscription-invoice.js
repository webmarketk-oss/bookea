const { isStripeConfigured } = require("../center/_stripe-lib");
const { updateServerBilling } = require("../admin/_agency-billing-store");
const {
  isValidEmail,
  loadBookeaSenderMailbox,
} = require("../mailing/mailbox-lib");
const {
  billingCenterContactFromRow,
  createPayToken,
  ensureSubscriptionInvoice,
  invoicePayUrl,
} = require("./_agency-invoice");
const { buildAgencyInvoicePdf } = require("./_agency-invoice-pdf");
const { defaultInvoiceMailCopy } = require("./invoice-mail-lib");

const COMPANY = "bookea";
const INVOICEABLE_KINDS = new Set(["seya_pack", "sms_pack", "crm_pack"]);
const AUTO_INVOICE_DELAY_MS = 10 * 60 * 1000;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isInvoiceableAlert(alert) {
  return INVOICEABLE_KINDS.has(asRecord(alert).kind);
}

function pendingAutoInvoiceAlerts(settings, now = Date.now()) {
  return asArray(asRecord(settings).adminAlerts).filter(
    (alert) =>
      asRecord(alert).autoInvoice === true &&
      alert.billingStatus !== "invoiced" &&
      isInvoiceableAlert(alert) &&
      now - Date.parse(alert.createdAt || "") >= AUTO_INVOICE_DELAY_MS,
  );
}

function invoiceMail({ number, clientName, payUrl }) {
  const copy = defaultInvoiceMailCopy(
    { number, type: "Facture", client: clientName || "bonjour" },
    "Bookea",
  );
  const greeting = `Bonjour ${clientName || "bonjour"},`;
  const intro = `Veuillez trouver ci-joint votre facture ${number}.`;
  const payment = payUrl
    ? [
        "Vous pouvez la régler par carte bancaire ici :",
        payUrl,
        "ou par virement, avec les coordonnées indiquées sur la facture.",
      ]
    : ["Vous pouvez la régler par virement, avec les coordonnées indiquées sur la facture."];
  const textContent = [greeting, "", intro, "", ...payment, "", "Cordialement,", "Bookea"].join("\n");
  const button = payUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(payUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600">Payer par carte</a></p><p>Vous pouvez aussi régler par virement, avec les coordonnées indiquées sur la facture.</p>`
    : `<p>${escapeHtml(payment[0])}</p>`;
  const htmlContent = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>${button}<p>Cordialement,<br />Bookea</p></div>`;
  return { subject: copy.subject, textContent, htmlContent };
}

async function sendInvoiceEmail({ mailbox, toEmail, toName, mail, pdf, number }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("L’envoi n’est pas encore branché côté Bookea.");
  }
  const senderName = String(mailbox.name || "Bookea").slice(0, 70);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: mailbox.email, name: senderName },
      to: [{ email: toEmail, name: String(toName || "").slice(0, 70) || undefined }],
      replyTo: { email: mailbox.email, name: senderName },
      subject: mail.subject.slice(0, 200),
      textContent: mail.textContent,
      htmlContent: mail.htmlContent,
      attachment: [{ name: `${number}.pdf`.replace(/[^\w.-]+/g, "_"), content: pdf }],
      tags: ["bookea-agency-invoice"],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result?.message || result?.error?.message || "L’envoi de la facture a échoué.",
    );
  }
}

async function loadCenter(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,city,email,phone,address_line1,postal_code,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function markAlertInvoiced(supabase, centerId, alertId, receipt) {
  const center = await loadCenter(supabase, centerId);
  if (!center) {
    return;
  }
  const settings = asRecord(center.settings);
  const adminAlerts = asArray(settings.adminAlerts).map((alert) =>
    asRecord(alert).id === alertId
      ? {
          ...alert,
          billingStatus: "invoiced",
          invoiceId: receipt.invoiceId,
          invoicedAt: receipt.invoicedAt,
          ...(receipt.emailedAt
            ? { emailedAt: receipt.emailedAt, emailedTo: receipt.emailedTo }
            : {}),
        }
      : alert,
  );
  const { error } = await supabase
    .from("centers")
    .update({ settings: { ...settings, adminAlerts }, updated_at: new Date().toISOString() })
    .eq("id", centerId);
  if (error) {
    throw error;
  }
}

async function invoiceCenterAlert(supabase, { centerId, alertId }) {
  const row = await loadCenter(supabase, centerId);
  const alert = asArray(asRecord(row?.settings).adminAlerts).find(
    (item) => asRecord(item).id === alertId,
  );
  if (!row || !alert || !isInvoiceableAlert(alert)) {
    const error = new Error("Souscription introuvable.");
    error.status = 404;
    throw error;
  }
  const center = billingCenterContactFromRow(row);

  const prepared = await updateServerBilling(supabase, COMPANY, (current) => {
    const result = ensureSubscriptionInvoice(current, { center, alert });
    const invoice = result.invoice.payToken
      ? result.invoice
      : { ...result.invoice, payToken: createPayToken() };
    if (!result.created && invoice === result.invoice && result.state === current) {
      return { invoice, created: false };
    }
    return {
      state: {
        ...result.state,
        invoices: result.state.invoices.map((item) =>
          item.id === invoice.id ? invoice : item,
        ),
      },
      invoice,
      created: result.created,
      invoiceIds: [invoice.id],
      clientIds: [invoice.clientId],
    };
  });
  let state = prepared.state;
  let invoice =
    state.invoices.find((item) => item.id === prepared.invoice.id) || prepared.invoice;
  let mailError = "";

  if (!invoice.emailedAt) {
    const client = state.clients.find((item) => item.id === invoice.clientId);
    const toEmail = String(client?.email || center.email || "").trim().toLowerCase();
    const mailbox = await loadBookeaSenderMailbox(supabase).catch(() => null);
    if (!isValidEmail(toEmail)) {
      mailError = "Le centre n’a pas d’e-mail : la facture est prête, à envoyer à la main.";
    } else if (!mailbox?.verified || !isValidEmail(mailbox.email)) {
      mailError = "Connectez d’abord la boîte mail Bookea pour envoyer la facture.";
    } else {
      try {
        const payUrl = isStripeConfigured() ? invoicePayUrl(invoice) : "";
        await sendInvoiceEmail({
          mailbox,
          toEmail,
          toName: client?.name || center.name,
          mail: invoiceMail({ number: invoice.number, clientName: center.name, payUrl }),
          pdf: buildAgencyInvoicePdf(state, invoice, { payUrl }),
          number: invoice.number,
        });
        const emailedAt = new Date().toISOString();
        const sent = await updateServerBilling(supabase, COMPANY, (current) => ({
          state: {
            ...current,
            invoices: current.invoices.map((item) =>
              item.id === invoice.id ? { ...item, emailedAt, emailedTo: toEmail } : item,
            ),
          },
          invoiceIds: [invoice.id],
        }));
        state = sent.state;
        invoice = state.invoices.find((item) => item.id === invoice.id) || invoice;
      } catch (error) {
        mailError =
          error instanceof Error && error.message
            ? error.message
            : "La facture est prête, mais l’e-mail n’a pas pu partir.";
      }
    }
  }

  await markAlertInvoiced(supabase, centerId, alertId, {
    invoiceId: invoice.id,
    invoicedAt: invoice.createdAt || new Date().toISOString(),
    emailedAt: invoice.emailedAt,
    emailedTo: invoice.emailedTo,
  });

  return {
    invoice: { id: invoice.id, number: invoice.number },
    emailedAt: invoice.emailedAt,
    emailedTo: invoice.emailedTo,
    mailError: mailError || undefined,
    created: prepared.created === true,
  };
}

module.exports = {
  invoiceCenterAlert,
  invoiceMail,
  pendingAutoInvoiceAlerts,
};
