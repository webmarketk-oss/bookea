const { createClient } = require("@supabase/supabase-js");
const {
  BOOKEA_SENDER_EMAIL,
  BOOKEA_SENDER_NAME,
  bookeaSenderPublicStatus,
  findBrevoSender,
  isValidEmail,
  loadBookeaSenderMailbox,
  parseBookeaSenderMailbox,
  saveBookeaSenderMailbox,
} = require("./mailbox-lib");

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePayload(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    const text = body.trim();
    if (!text) {
      return {};
    }
    return text.startsWith("{") ? JSON.parse(text) : {};
  }
  return body;
}

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

function senderErrorMessage(reason, extra) {
  if (reason === "forbidden") {
    return "Accès réservé à l’équipe Bookea.";
  }
  if (reason === "missing_brevo") {
    return "L’envoi n’est pas encore branché côté Bookea.";
  }
  if (reason === "invalid_email") {
    return "Indiquez l’email Bookea à connecter, par exemple info@bookeai.fr.";
  }
  if (reason === "not_pending") {
    return "Demandez d’abord le code dans info@bookeai.fr.";
  }
  if (reason === "invalid_otp") {
    return extra || "Code invalide. Vérifiez le mail reçu, puis réessayez.";
  }
  return extra || "Impossible de connecter la boîte Bookea.";
}

async function brevoJson(path, { method = "GET", body } = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    const error = new Error("missing_brevo");
    error.reason = "missing_brevo";
    throw error;
  }
  const response = await fetch(`https://api.brevo.com/v3${path}`, {
    method,
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const result =
    response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      result?.message || result?.error?.message || `brevo_${response.status}`,
    );
    error.reason = "brevo";
    throw error;
  }
  return result;
}

async function listBrevoSenders() {
  const result = await brevoJson("/senders");
  return Array.isArray(result.senders) ? result.senders : [];
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

async function readBookeaPayload(supabase) {
  const mailbox = await loadBookeaSenderMailbox(supabase);
  return { mailbox };
}

async function saveBookeaMailbox(supabase, mailbox) {
  return saveBookeaSenderMailbox(supabase, mailbox);
}

async function syncBookeaMailbox(supabase) {
  const payload = await readBookeaPayload(supabase);
  const mailbox = parseBookeaSenderMailbox(payload);
  if (!mailbox.email || !process.env.BREVO_API_KEY) {
    return payload;
  }
  const found = findBrevoSender(await listBrevoSenders(), mailbox.email);
  if (!found) {
    return payload;
  }
  return saveBookeaMailbox(supabase, {
    ...mailbox,
    senderId: Number(found.id) || mailbox.senderId,
    name: String(found.name || mailbox.name || BOOKEA_SENDER_NAME).trim(),
    verified: found.active === true,
  });
}

async function connectBookeaMailbox(supabase, email, name) {
  const mailboxName = String(name || "").trim() || BOOKEA_SENDER_NAME;
  const existing = findBrevoSender(await listBrevoSenders(), email);
  if (existing?.active) {
    return saveBookeaMailbox(supabase, {
      email,
      name: String(existing.name || mailboxName).trim(),
      senderId: Number(existing.id) || null,
      verified: true,
      requestedAt: new Date().toISOString(),
    });
  }
  let senderId = existing?.id ? Number(existing.id) : null;
  if (senderId) {
    try {
      await brevoJson(`/senders/${senderId}`, { method: "DELETE" });
    } catch (error) {
      console.error("[mailing/bookea-sender] delete", error);
    }
  }
  const created = await brevoJson("/senders", {
    method: "POST",
    body: { email, name: mailboxName },
  });
  return saveBookeaMailbox(supabase, {
    email,
    name: mailboxName,
    senderId: Number(created?.id) || null,
    verified: false,
    requestedAt: new Date().toISOString(),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const supabase = createServiceClient();
    if (!(await requireBookeaAdmin(supabase, req))) {
      return res.status(403).json({
        ok: false,
        error: senderErrorMessage("forbidden"),
      });
    }

    let payload = await readBookeaPayload(supabase);
    if (req.method === "GET") {
      try {
        payload = await syncBookeaMailbox(supabase);
      } catch (error) {
        console.error("[mailing/bookea-sender] sync", error);
      }
      return res.status(200).json({ ok: true, ...bookeaSenderPublicStatus(payload) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = parsePayload(req.body);
    const action = String(firstValue(body.action) || "connect").trim();

    if (action === "disconnect") {
      payload = await saveBookeaMailbox(supabase, {
        email: "",
        name: "",
        senderId: null,
        verified: false,
        requestedAt: "",
      });
      return res.status(200).json({ ok: true, ...bookeaSenderPublicStatus(payload) });
    }

    if (action === "refresh") {
      payload = await syncBookeaMailbox(supabase);
      return res.status(200).json({ ok: true, ...bookeaSenderPublicStatus(payload) });
    }

    if (action === "validate") {
      const mailbox = parseBookeaSenderMailbox(payload);
      const otp = String(firstValue(body.otp) || "").replace(/\D/g, "");
      if (!mailbox.senderId || !mailbox.email) {
        return res.status(409).json({
          ok: false,
          error: senderErrorMessage("not_pending"),
          ...bookeaSenderPublicStatus(payload),
        });
      }
      if (!/^\d{6}$/.test(otp)) {
        return res.status(400).json({
          ok: false,
          error: senderErrorMessage("invalid_otp"),
          ...bookeaSenderPublicStatus(payload),
        });
      }
      try {
        await brevoJson(`/senders/${mailbox.senderId}/validate`, {
          method: "PUT",
          body: { otp: Number(otp) },
        });
      } catch (error) {
        return res.status(409).json({
          ok: false,
          error: senderErrorMessage("invalid_otp", error?.message),
          ...bookeaSenderPublicStatus(payload),
        });
      }
      payload = await saveBookeaMailbox(supabase, { ...mailbox, verified: true });
      return res.status(200).json({ ok: true, ...bookeaSenderPublicStatus(payload) });
    }

    const email = String(firstValue(body.email) || BOOKEA_SENDER_EMAIL)
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: senderErrorMessage("invalid_email"),
      });
    }
    payload = await connectBookeaMailbox(
      supabase,
      email,
      firstValue(body.name) || BOOKEA_SENDER_NAME,
    );
    const status = bookeaSenderPublicStatus(payload);
    return res.status(200).json({
      ok: true,
      ...status,
      notice: status.connected
        ? `Boîte Bookea connectée : ${email}`
        : `Un code a été envoyé à ${email}.`,
    });
  } catch (error) {
    console.error("[mailing/bookea-sender]", error);
    const reason = error?.reason === "missing_brevo" ? "missing_brevo" : "brevo";
    return res.status(error?.reason === "missing_brevo" ? 503 : 500).json({
      ok: false,
      error: senderErrorMessage(reason, error instanceof Error ? error.message : ""),
    });
  }
};
