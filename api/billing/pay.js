const {
  createServiceClient,
  firstQueryValue,
  isStripeConfigured,
} = require("../center/_stripe-lib");
const { invoicePayUrl } = require("./_agency-invoice");
const {
  confirmCardPayment,
  findPayableInvoice,
  invoiceAmountCents,
  startCardPayment,
} = require("./_invoice-payment");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendPage(res, status, { title, text, action }) {
  const button = action
    ? `<a href="${escapeHtml(action.href)}" style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a>`
    : "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Bookea</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
  <main style="max-width:440px;margin:24px;padding:32px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;text-align:center">
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Bookea</p>
    <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(title)}</h1>
    <p style="margin:0;color:#475569;line-height:1.6">${escapeHtml(text)}</p>
    ${button}
  </main>
</body>
</html>`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const invoiceId = String(firstQueryValue(req.query?.i) || "").trim();
  const token = String(firstQueryValue(req.query?.t) || "").trim();
  const sessionId = String(firstQueryValue(req.query?.session_id) || "").trim();
  const cancelled = firstQueryValue(req.query?.etat) === "annule";

  try {
    const supabase = createServiceClient();
    const { state, invoice } = await findPayableInvoice(supabase, invoiceId, token);
    if (!invoice) {
      return sendPage(res, 404, {
        title: "Lien de paiement invalide",
        text: "Ce lien ne correspond à aucune facture. Utilisez le lien reçu par e-mail ou contactez Bookea.",
      });
    }

    if (sessionId && isStripeConfigured()) {
      const paid = await confirmCardPayment(supabase, invoice.id, sessionId);
      return sendPage(res, 200, paid
        ? {
            title: "Merci, paiement reçu",
            text: `La facture ${invoice.number} est réglée. Vous pouvez fermer cette page.`,
          }
        : {
            title: "Paiement en cours de vérification",
            text: `Le paiement de la facture ${invoice.number} n’est pas encore confirmé. Si vous avez été débité, il sera pris en compte automatiquement.`,
          });
    }
    if (invoice.status === "Payée") {
      return sendPage(res, 200, {
        title: "Facture déjà réglée",
        text: `La facture ${invoice.number} est déjà payée. Merci !`,
      });
    }
    if (invoice.status === "Annulée") {
      return sendPage(res, 410, {
        title: "Facture annulée",
        text: `La facture ${invoice.number} a été annulée : aucun paiement n’est dû.`,
      });
    }
    if (cancelled) {
      return sendPage(res, 200, {
        title: "Paiement annulé",
        text: `Aucun montant n’a été débité pour la facture ${invoice.number}.`,
        action: { href: invoicePayUrl(invoice), label: "Réessayer le paiement" },
      });
    }
    if (!isStripeConfigured() || invoiceAmountCents(invoice) < 50) {
      return sendPage(res, 503, {
        title: "Paiement par carte indisponible",
        text: `Merci de régler la facture ${invoice.number} par virement, avec les coordonnées bancaires indiquées sur la facture.`,
      });
    }

    const url = await startCardPayment(supabase, state, invoice);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", url);
    return res.status(303).end();
  } catch (error) {
    console.error("[billing/pay]", error);
    return sendPage(res, 500, {
      title: "Paiement momentanément indisponible",
      text: "Réessayez dans quelques minutes ou réglez la facture par virement.",
    });
  }
};
