const { createClient } = require("@supabase/supabase-js");
const {
  BOOKEA_SENDER_EMAIL,
  BOOKEA_SENDER_NAME,
  isValidEmail,
  loadBookeaSenderMailbox,
} = require("../mailing/mailbox-lib");

const PUBLIC_BASE = "https://www.bookeai.fr";
const RESET_PATH = "/auth/reset-password";

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

function parsePayload(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function resetLink(hashedToken) {
  const params = new URLSearchParams({ token_hash: hashedToken, type: "recovery" });
  return `${PUBLIC_BASE}${RESET_PATH}?${params.toString()}`;
}

function resetMail(link) {
  const text = [
    "Bonjour,",
    "Vous avez demandé à changer le mot de passe de votre espace Bookea.",
    "Cliquez sur ce lien pour choisir un nouveau mot de passe (il fonctionne sur n’importe quel appareil, pendant 1 heure) :",
    link,
    "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.",
    "L’équipe Bookea",
  ].join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">
<p>Bonjour,</p>
<p>Vous avez demandé à changer le mot de passe de votre espace Bookea.</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600">Choisir un nouveau mot de passe</a></p>
<p style="color:#64748b;font-size:13px">Le lien fonctionne sur n’importe quel appareil, pendant 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.</p>
<p>L’équipe Bookea</p>
</div>`;
  return { text, html };
}

async function resolveSender(supabase, env) {
  const mailbox = await loadBookeaSenderMailbox(supabase);
  if (mailbox.verified && isValidEmail(mailbox.email)) {
    return { email: mailbox.email, name: mailbox.name || BOOKEA_SENDER_NAME };
  }
  const fromEnv = String(env.BREVO_EMAIL_SENDER || env.BREVO_FROM_EMAIL || "")
    .trim()
    .toLowerCase();
  return {
    email: isValidEmail(fromEnv) ? fromEnv : BOOKEA_SENDER_EMAIL,
    name: String(env.BREVO_EMAIL_SENDER_NAME || "").trim() || BOOKEA_SENDER_NAME,
  };
}

async function sendPasswordResetLink({
  supabase,
  email,
  fetchImpl = fetch,
  env = process.env,
}) {
  if (!env.BREVO_API_KEY) {
    return { sent: false, reason: "missing_brevo" };
  }
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${PUBLIC_BASE}${RESET_PATH}` },
  });
  if (error) {
    if (/not.?found|no user/i.test(String(error.message || ""))) {
      return { sent: false, reason: "unknown_email" };
    }
    throw error;
  }
  const hashedToken = String(data?.properties?.hashed_token || "");
  if (!hashedToken) {
    throw new Error("missing_recovery_token");
  }

  const sender = await resolveSender(supabase, env);
  const mail = resetMail(resetLink(hashedToken));
  const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email }],
      subject: "Nouveau mot de passe Bookea",
      textContent: mail.text,
      htmlContent: mail.html,
      tags: ["bookea-password-reset"],
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || `brevo_${response.status}`);
  }
  return { sent: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const email = String(parsePayload(req.body).email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }

  try {
    const result = await sendPasswordResetLink({
      supabase: createServiceClient(),
      email,
    });
    if (result.reason === "missing_brevo") {
      return res.status(503).json({ ok: false, error: "missing_brevo" });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[auth/password-reset]", error);
    return res.status(502).json({ ok: false, error: "send_failed" });
  }
};

module.exports.resetLink = resetLink;
module.exports.sendPasswordResetLink = sendPasswordResetLink;
