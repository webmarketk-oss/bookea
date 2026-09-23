const { createServiceClient } = require("../sms/brevo");

const MAX_RECIPIENTS = 80;

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
    if (text.startsWith("{") || text.startsWith("[")) {
      return JSON.parse(text);
    }
    return Object.fromEntries(new URLSearchParams(text).entries());
  }

  return body;
}

function defaultSenderEmail() {
  return String(
    process.env.BREVO_EMAIL_SENDER || process.env.BREVO_FROM_EMAIL || "",
  )
    .trim()
    .toLowerCase();
}

function defaultSenderName(fallback = "Bookea") {
  return (
    String(process.env.BREVO_EMAIL_SENDER_NAME || "").trim() || fallback
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function personalize(text, vars = {}) {
  const replacements = {
    prenom: String(vars.firstName || vars.prenom || "vous").trim() || "vous",
    nom: String(vars.lastName || vars.nom || "").trim(),
    centre: String(vars.centerName || vars.centre || "").trim(),
    nom_centre: String(vars.centerName || vars.nom_centre || "").trim(),
  };

  let output = String(text || "");

  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }

  return output;
}

function toHtml(message, imageCid) {
  const body = escapeHtml(message).replace(/\r\n?/g, "\n").replace(/\n/g, "<br />");
  const image = imageCid
    ? `<img src="cid:${imageCid}" alt="" style="display:block;width:100%;max-width:560px;margin:0 0 20px;border-radius:12px" />`
    : "";

  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">${image}<p style="margin:0">${body}</p></div>`;
}

function parseImage(imageDataUrl) {
  const raw = String(imageDataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);

  if (!match) {
    return null;
  }

  const mime = match[1].toLowerCase();
  const extension = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : "jpg";

  return {
    name: `visuel.${extension}`,
    content: match[2].replace(/\s/g, ""),
  };
}

function parseContactId(value) {
  const raw = String(value || "").trim();
  const [kind, ...rest] = raw.split(":");
  const id = rest.join(":");

  if ((kind === "lead" || kind === "client") && id) {
    return { kind, id };
  }

  return null;
}

async function sendBrevoEmail({
  senderEmail,
  senderName,
  toEmail,
  toName,
  subject,
  textContent,
  htmlContent,
  attachment,
}) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("missing_brevo_api_key");
  }

  const payload = {
    sender: {
      email: senderEmail,
      name: senderName.slice(0, 70),
    },
    to: [
      {
        email: toEmail,
        name: toName.slice(0, 70) || undefined,
      },
    ],
    subject: subject.slice(0, 200),
    textContent,
    htmlContent,
    tags: ["bookea-mailing"],
  };

  if (attachment) {
    payload.attachment = [attachment];
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      result?.message || result?.error?.message || `brevo_${response.status}`;
    throw new Error(message);
  }

  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const centerId = String(firstValue(req.query?.centerId) || "").trim();
    let senderEmail = defaultSenderEmail();
    let senderName = defaultSenderName();

    if (centerId) {
      try {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from("centers")
          .select("name,email")
          .eq("id", centerId)
          .maybeSingle();
        senderEmail = senderEmail || String(data?.email || "").trim().toLowerCase();
        senderName = defaultSenderName(data?.name || "Bookea");
      } catch {
        senderEmail = defaultSenderEmail();
      }
    }

    return res.status(200).json({
      ok: true,
      endpoint: "mailing/send",
      configured: Boolean(process.env.BREVO_API_KEY) && isValidEmail(senderEmail),
      senderEmail,
      senderName,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const subject = String(firstValue(payload.subject) || "").trim();
    const message = String(
      firstValue(payload.message) || firstValue(payload.content) || "",
    ).trim();
    const centerId = String(firstValue(payload.centerId) || "").trim();
    const image = parseImage(firstValue(payload.imageDataUrl));
    const recipientsInput = Array.isArray(payload.recipients)
      ? payload.recipients
      : [];

    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Brevo n’est pas configuré. Ajoutez BREVO_API_KEY.",
      });
    }

    if (!subject || !message) {
      return res.status(400).json({ ok: false, error: "missing_content" });
    }

    if (!centerId) {
      return res.status(400).json({
        ok: false,
        error: "Centre introuvable pour envoyer le mailing.",
      });
    }

    if (recipientsInput.length === 0) {
      return res.status(400).json({ ok: false, error: "missing_recipients" });
    }

    if (recipientsInput.length > MAX_RECIPIENTS) {
      return res.status(400).json({ ok: false, error: "too_many_recipients" });
    }

    const supabase = createServiceClient();
    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select("id,name,email")
      .eq("id", centerId)
      .maybeSingle();

    if (centerError) {
      throw new Error(centerError.message);
    }

    if (!center) {
      return res.status(400).json({ ok: false, error: "center_not_found" });
    }

    const senderEmail =
      defaultSenderEmail() || String(center.email || "").trim().toLowerCase();
    const senderName = defaultSenderName(center.name || "Bookea");

    if (!isValidEmail(senderEmail)) {
      return res.status(500).json({
        ok: false,
        error:
          "Aucun email d’expéditeur. Renseignez BREVO_EMAIL_SENDER ou l’email du centre.",
      });
    }

    const allowed = await loadAllowedRecipients(supabase, centerId, recipientsInput);

    if (allowed.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Aucun destinataire valide avec un email pour ce centre.",
      });
    }

    const results = [];

    for (const recipient of allowed) {
      const vars = {
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        centerName: center.name,
      };
      const nextSubject = personalize(subject, vars);
      const nextMessage = personalize(message, vars);

      try {
        const sent = await sendBrevoEmail({
          senderEmail,
          senderName,
          toEmail: recipient.email,
          toName: `${recipient.firstName} ${recipient.lastName}`.trim(),
          subject: nextSubject,
          textContent: nextMessage,
          htmlContent: toHtml(nextMessage, image?.name),
          attachment: image,
        });
        results.push({
          id: recipient.id,
          email: recipient.email,
          ok: true,
          messageId: sent?.messageId ?? null,
        });

        if (recipient.kind === "lead") {
          await supabase.from("lead_events").insert({
            center_id: centerId,
            lead_id: recipient.rawId,
            event_type: "system",
            note: `Mailing envoyé : ${nextSubject}`,
          });
        }
      } catch (error) {
        results.push({
          id: recipient.id,
          email: recipient.email,
          ok: false,
          error: error instanceof Error ? error.message : "send_failed",
        });
      }
    }

    const sentCount = results.filter((item) => item.ok).length;

    return res.status(sentCount > 0 ? 200 : 502).json({
      ok: sentCount > 0,
      sent: sentCount,
      failed: results.length - sentCount,
      senderEmail,
      results,
    });
  } catch (error) {
    console.error("[mailing/send]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send mailing",
    });
  }
};

async function loadAllowedRecipients(supabase, centerId, recipientsInput) {
  const requested = recipientsInput
    .map((item) => {
      if (typeof item === "string") {
        return {
          id: "",
          email: item.trim().toLowerCase(),
          firstName: "vous",
          lastName: "",
        };
      }

      return {
        id: String(item?.id || "").trim(),
        email: String(item?.email || "").trim().toLowerCase(),
        firstName: String(item?.firstName || item?.prenom || "vous").trim() || "vous",
        lastName: String(item?.lastName || item?.nom || "").trim(),
      };
    })
    .filter((item) => isValidEmail(item.email));

  const leadIds = [];
  const clientIds = [];

  for (const item of requested) {
    const parsed = parseContactId(item.id);
    if (parsed?.kind === "lead") leadIds.push(parsed.id);
    if (parsed?.kind === "client") clientIds.push(parsed.id);
  }

  const [leadsResult, clientsResult] = await Promise.all([
    leadIds.length > 0
      ? supabase
          .from("leads")
          .select("id, clients(first_name, last_name, email)")
          .eq("center_id", centerId)
          .in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    clientIds.length > 0
      ? supabase
          .from("clients")
          .select("id, first_name, last_name, email")
          .eq("center_id", centerId)
          .in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leadsResult.error) {
    throw new Error(leadsResult.error.message);
  }

  if (clientsResult.error) {
    throw new Error(clientsResult.error.message);
  }

  const allowedEmails = new Map();

  for (const row of leadsResult.data ?? []) {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const email = String(client?.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      continue;
    }
    allowedEmails.set(`lead:${row.id}`, {
      kind: "lead",
      rawId: row.id,
      email,
      firstName: String(client?.first_name || "").trim() || "vous",
      lastName: String(client?.last_name || "").trim(),
    });
  }

  for (const row of clientsResult.data ?? []) {
    const email = String(row.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      continue;
    }
    allowedEmails.set(`client:${row.id}`, {
      kind: "client",
      rawId: row.id,
      email,
      firstName: String(row.first_name || "").trim() || "vous",
      lastName: String(row.last_name || "").trim(),
    });
  }

  const unique = new Map();

  for (const item of requested) {
    const allowed = allowedEmails.get(item.id);
    if (!allowed || allowed.email !== item.email) {
      continue;
    }
    if (unique.has(allowed.email)) {
      continue;
    }
    unique.set(allowed.email, {
      id: item.id,
      ...allowed,
    });
  }

  return [...unique.values()];
}
