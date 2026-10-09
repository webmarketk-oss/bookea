const { createServiceClient } = require("../sms/brevo");
const {
  findBrevoSender,
  isValidEmail,
  mailboxPublicStatus,
  mergeMailingMailbox,
  parseMailingMailbox,
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

function mailboxErrorMessage(reason, extra) {
  if (reason === "missing_brevo") {
    return "L’envoi n’est pas encore branché côté Bookea.";
  }
  if (reason === "missing_center") {
    return "Centre introuvable.";
  }
  if (reason === "invalid_email") {
    return "Indiquez l’email de la boîte du centre.";
  }
  if (reason === "not_pending") {
    return "Demandez d’abord le code dans la boîte mail du centre.";
  }
  if (reason === "invalid_otp") {
    return extra || "Code invalide. Vérifiez le mail reçu, puis réessayez.";
  }
  return extra || "Impossible de connecter la boîte mail.";
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
    error.status = response.status;
    error.result = result;
    throw error;
  }
  return result;
}

async function listBrevoSenders() {
  const result = await brevoJson("/senders");
  return Array.isArray(result.senders) ? result.senders : [];
}

async function loadCenter(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,email,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data || null;
}

async function saveMailbox(supabase, center, mailbox) {
  const settings = mergeMailingMailbox(center.settings, mailbox);
  const { error } = await supabase
    .from("centers")
    .update({ settings })
    .eq("id", center.id);
  if (error) {
    throw new Error(error.message);
  }
  return { ...center, settings };
}

async function syncMailboxFromBrevo(supabase, center) {
  const mailbox = parseMailingMailbox(center.settings);
  if (!mailbox.email) {
    return center;
  }
  const found = findBrevoSender(await listBrevoSenders(), mailbox.email);
  if (!found) {
    return center;
  }
  const next = {
    ...mailbox,
    senderId: Number(found.id) || mailbox.senderId,
    name: String(found.name || mailbox.name || center.name || "").trim(),
    verified: found.active === true,
  };
  if (
    next.senderId === mailbox.senderId &&
    next.verified === mailbox.verified &&
    next.name === mailbox.name
  ) {
    return center;
  }
  return saveMailbox(supabase, center, next);
}

async function connectMailbox(supabase, center, email, name) {
  const mailboxName =
    String(name || "").trim() || String(center.name || "").trim() || "Bookea";
  const existing = findBrevoSender(await listBrevoSenders(), email);
  if (existing?.active) {
    return saveMailbox(supabase, center, {
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
      console.error("[mailing/mailbox] delete sender", error);
    }
  }

  const created = await brevoJson("/senders", {
    method: "POST",
    body: { email, name: mailboxName },
  });
  senderId = Number(created?.id) || null;
  return saveMailbox(supabase, center, {
    email,
    name: mailboxName,
    senderId,
    verified: false,
    requestedAt: new Date().toISOString(),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const payload =
      req.method === "GET" ? req.query || {} : parsePayload(req.body);
    const centerId = String(
      firstValue(payload.centerId) || firstValue(req.query?.centerId) || "",
    ).trim();
    if (!centerId) {
      return res.status(400).json({
        ok: false,
        error: mailboxErrorMessage("missing_center"),
      });
    }

    const supabase = createServiceClient();
    let center = await loadCenter(supabase, centerId);
    if (!center) {
      return res.status(404).json({
        ok: false,
        error: mailboxErrorMessage("missing_center"),
      });
    }

    if (req.method === "GET") {
      if (parseMailingMailbox(center.settings).email && process.env.BREVO_API_KEY) {
        try {
          center = await syncMailboxFromBrevo(supabase, center);
        } catch (error) {
          console.error("[mailing/mailbox] sync", error);
        }
      }
      return res.status(200).json({ ok: true, ...mailboxPublicStatus(center) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const action = String(firstValue(payload.action) || "connect").trim();

    if (action === "disconnect") {
      center = await saveMailbox(supabase, center, {
        email: "",
        name: "",
        senderId: null,
        verified: false,
        requestedAt: "",
      });
      return res.status(200).json({ ok: true, ...mailboxPublicStatus(center) });
    }

    if (action === "refresh") {
      center = await syncMailboxFromBrevo(supabase, center);
      return res.status(200).json({ ok: true, ...mailboxPublicStatus(center) });
    }

    if (action === "validate") {
      const mailbox = parseMailingMailbox(center.settings);
      const otp = String(firstValue(payload.otp) || "").replace(/\D/g, "");
      if (!mailbox.senderId || !mailbox.email) {
        return res.status(409).json({
          ok: false,
          error: mailboxErrorMessage("not_pending"),
          ...mailboxPublicStatus(center),
        });
      }
      if (!/^\d{6}$/.test(otp)) {
        return res.status(400).json({
          ok: false,
          error: mailboxErrorMessage("invalid_otp"),
          ...mailboxPublicStatus(center),
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
          error: mailboxErrorMessage("invalid_otp", error?.message),
          ...mailboxPublicStatus(center),
        });
      }
      center = await saveMailbox(supabase, center, {
        ...mailbox,
        verified: true,
      });
      return res.status(200).json({ ok: true, ...mailboxPublicStatus(center) });
    }

    const email = String(firstValue(payload.email) || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: mailboxErrorMessage("invalid_email"),
      });
    }
    center = await connectMailbox(
      supabase,
      center,
      email,
      firstValue(payload.name) || center.name,
    );
    return res.status(200).json({
      ok: true,
      ...mailboxPublicStatus(center),
      notice: mailboxPublicStatus(center).connected
        ? `Boîte connectée : ${email}`
        : `Un code a été envoyé à ${email}.`,
    });
  } catch (error) {
    console.error("[mailing/mailbox]", error);
    const reason = error?.reason === "missing_brevo" ? "missing_brevo" : "brevo";
    return res.status(error?.reason === "missing_brevo" ? 503 : 500).json({
      ok: false,
      error: mailboxErrorMessage(reason, error instanceof Error ? error.message : ""),
    });
  }
};
