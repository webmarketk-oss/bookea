const { createClient } = require("@supabase/supabase-js");
const {
  loadBookeaSenderMailbox,
  isValidEmail,
} = require("../mailing/mailbox-lib");
const {
  defaultInvoiceMailCopy,
  parsePdfAttachment,
} = require("../billing/invoice-mail-lib");
const { parsePayload, rateLimit } = require("../appointments/service");

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireBookeaAdmin(supabase, req) {
  const token = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return false;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return false;
  }
  const { data: admin } = await supabase
    .from("bookea_admins")
    .select("profile_id")
    .eq("profile_id", data.user.id)
    .maybeSingle();
  return Boolean(admin?.profile_id);
}

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
      tags: ["bookea-agency-invoice"],
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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const supabase = createServiceClient();
    if (!(await requireBookeaAdmin(supabase, req))) {
      return res.status(403).json({
        ok: false,
        error: "Accès réservé à l’équipe Bookea.",
      });
    }

    const payload = parsePayload(req.body);
    const number = String(payload.number || "").trim();
    const toEmail = String(payload.to || payload.email || "").trim().toLowerCase();
    const clientName = String(payload.client || payload.centerName || "").trim();
    if (!number) {
      return res.status(400).json({ ok: false, error: "Facture introuvable." });
    }
    if (!isValidEmail(toEmail)) {
      return res.status(400).json({
        ok: false,
        error: "Le centre n’a pas d’adresse e-mail valide.",
      });
    }
    if (!rateLimit(`admin-agency-invoice:${toEmail}`, 8, 60_000)) {
      return res.status(429).json({
        ok: false,
        error: "Trop d’envois. Réessayez dans une minute.",
      });
    }

    const mailbox = await loadBookeaSenderMailbox(supabase);
    if (!mailbox.verified || !isValidEmail(mailbox.email)) {
      return res.status(409).json({
        ok: false,
        error: "Connectez d’abord la boîte mail Bookea.",
      });
    }

    const copy = defaultInvoiceMailCopy(
      { number, type: "Facture", client: clientName || "bonjour" },
      "Bookea",
    );
    const subject = String(payload.subject || "").trim() || copy.subject;
    const message = String(payload.message || "").trim() || copy.message;
    const attachment = parsePdfAttachment(payload.pdf, `${number}.pdf`);
    if (!attachment) {
      return res.status(400).json({
        ok: false,
        error: "Le PDF de la facture n’a pas pu être joint.",
      });
    }

    await sendBrevoEmail({
      senderEmail: mailbox.email,
      senderName: mailbox.name || "Bookea",
      toEmail,
      toName: clientName || "Centre",
      subject,
      textContent: message,
      attachment,
    });

    const emailedAt = new Date().toISOString();
    return res.status(200).json({
      ok: true,
      emailedAt,
      emailedTo: toEmail,
      senderEmail: mailbox.email,
    });
  } catch (error) {
    console.error("[admin/send-agency-invoice]", error);
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "L’envoi de la facture a échoué.",
    });
  }
};
