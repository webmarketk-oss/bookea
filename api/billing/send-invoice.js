const { createServiceClient, parsePayload, rateLimit } = require("../appointments/service");
const {
  loadBookeaSenderMailbox,
  resolveCenterSender,
} = require("../mailing/mailbox-lib");
const {
  defaultInvoiceMailCopy,
  invoiceMailReceipts,
  isValidEmail,
  parsePdfAttachment,
  withInvoiceMailReceipt,
} = require("./invoice-mail-lib");

async function sendBrevoEmail({
  senderEmail,
  senderName,
  toEmail,
  toName,
  subject,
  textContent,
  attachment,
}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("L’envoi n’est pas encore branché côté Bookea.");
  }

  const htmlContent = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${escapeHtml(textContent)}</div>`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName.slice(0, 70) },
      to: [{ email: toEmail, name: toName.slice(0, 70) || undefined }],
      replyTo: { email: senderEmail, name: senderName.slice(0, 70) },
      subject: subject.slice(0, 200),
      textContent,
      htmlContent,
      attachment: attachment ? [attachment] : undefined,
      tags: ["bookea-invoice"],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result?.message || result?.error?.message || "L’envoi de la facture a échoué.",
    );
  }
  return result;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveInvoiceSender(supabase, center) {
  const centerSender = resolveCenterSender(center);
  if (centerSender.mailboxConnected && isValidEmail(centerSender.email)) {
    return centerSender;
  }
  const bookea = await loadBookeaSenderMailbox(supabase);
  if (bookea.verified && isValidEmail(bookea.email)) {
    return {
      email: bookea.email,
      name: bookea.name || "Bookea",
      mailboxConnected: true,
    };
  }
  return centerSender;
}

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

  try {
    const payload = parsePayload(req.body);
    const centerId = String(payload.centerId || "").trim();
    const invoiceId = String(payload.invoiceId || "").trim();
    const toEmail = String(payload.to || payload.email || "").trim().toLowerCase();
    if (!centerId || !invoiceId) {
      return res.status(400).json({ ok: false, error: "Facture introuvable." });
    }
    if (!isValidEmail(toEmail)) {
      return res.status(400).json({ ok: false, error: "Indiquez une adresse e-mail valide." });
    }
    if (!rateLimit(`billing-send-invoice:${centerId}`, 12, 60_000)) {
      return res.status(429).json({ ok: false, error: "Trop d’envois. Réessayez dans une minute." });
    }

    const supabase = createServiceClient();
    const [{ data: center }, { data: invoice, error: invoiceError }] = await Promise.all([
      supabase.from("centers").select("id,name,email,settings").eq("id", centerId).maybeSingle(),
      supabase
        .from("invoices")
        .select("id,center_id,number,type,status,clients(first_name,last_name,email)")
        .eq("id", invoiceId)
        .maybeSingle(),
    ]);
    if (!center) {
      return res.status(400).json({ ok: false, error: "Centre introuvable." });
    }
    if (invoiceError || !invoice || invoice.center_id !== centerId) {
      return res.status(404).json({ ok: false, error: "Cette facture n’appartient pas à ce centre." });
    }

    const sender = await resolveInvoiceSender(supabase, center);
    if (!sender.mailboxConnected || !isValidEmail(sender.email)) {
      return res.status(409).json({
        ok: false,
        error: "Connectez d’abord la boîte mail Bookea dans Facturation → Réglages.",
      });
    }

    const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients;
    const clientName = [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "bonjour";
    const copy = defaultInvoiceMailCopy(
      { number: invoice.number, type: invoice.type, client: clientName },
      center.name,
    );
    const subject = String(payload.subject || "").trim() || copy.subject;
    const message = String(payload.message || "").trim() || copy.message;
    const attachment = parsePdfAttachment(payload.pdf, `${invoice.number}.pdf`);
    if (!attachment) {
      return res.status(400).json({ ok: false, error: "Le PDF de la facture n’a pas pu être joint." });
    }

    await sendBrevoEmail({
      senderEmail: sender.email,
      senderName: sender.name || center.name || "Bookea",
      toEmail,
      toName: clientName,
      subject,
      textContent: message,
      attachment,
    });

    const emailedAt = new Date().toISOString();
    const nextSettings = withInvoiceMailReceipt(center.settings, invoice.id, {
      emailedAt,
      emailedTo: toEmail,
    });
    const { error: writeError } = await supabase
      .from("centers")
      .update({ settings: nextSettings })
      .eq("id", center.id);
    if (writeError) {
      throw new Error(writeError.message);
    }

    if (invoice.status === "draft" || invoice.status === "pending_payment") {
      await supabase
        .from("invoices")
        .update({ status: "sent", updated_at: emailedAt })
        .eq("id", invoice.id)
        .eq("center_id", centerId);
    }

    return res.status(200).json({
      ok: true,
      emailedAt,
      emailedTo: toEmail,
      senderEmail: sender.email,
    });
  } catch (error) {
    console.error("[billing/send-invoice]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "L’envoi de la facture a échoué.",
    });
  }
};

module.exports.defaultInvoiceMailCopy = defaultInvoiceMailCopy;
module.exports.parsePdfAttachment = parsePdfAttachment;
module.exports.invoiceMailReceipts = invoiceMailReceipts;
module.exports.withInvoiceMailReceipt = withInvoiceMailReceipt;
