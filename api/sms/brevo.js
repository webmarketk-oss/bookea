function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("33") && digits.length >= 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `33${digits.slice(1)}`;
  }

  return digits;
}

function personalize(message, vars = {}) {
  const replacements = {
    prenom: String(vars.firstName || vars.prenom || "vous").trim() || "vous",
    nom: String(vars.lastName || vars.nom || "").trim(),
    date: String(vars.date || "").trim(),
    heure: String(vars.time || vars.heure || "").trim(),
    soin: String(vars.treatment || vars.soin || "").trim(),
    centre: String(vars.centerName || vars.centre || "").trim(),
  };

  let output = String(message || "");

  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }

  return output.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

function defaultSender() {
  return String(process.env.BREVO_SMS_SENDER || "BOOKEA")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 11);
}

function defaultSmsTemplates() {
  return [
    {
      id: "confirmation-rdv",
      name: "Confirmation RDV",
      body: "Bonjour {{prenom}} {{nom}}, votre rendez-vous {{soin}} est confirmé le {{date}} à {{heure}} chez {{centre}}. À bientôt !",
    },
    {
      id: "rappel-48h",
      name: "Rappel 48h avant RDV",
      body: "Bonjour {{prenom}}, rappel : votre rendez-vous {{soin}} est dans 48h, le {{date}} à {{heure}} chez {{centre}}. Merci de prévenir en cas d'empêchement.",
    },
    {
      id: "accueil-prospect",
      name: "Accueil prospect",
      body: "Bonjour {{prenom}}, merci pour votre demande {{soin}}. L'équipe de {{centre}} vous contacte rapidement.",
    },
  ];
}

function parseCenterSmsSettings(settings) {
  const sms =
    settings && typeof settings === "object" && settings.sms && typeof settings.sms === "object"
      ? settings.sms
      : {};
  const templates = Array.isArray(sms.templates) && sms.templates.length > 0
    ? sms.templates
        .map((template) => ({
          id: String(template?.id || "").trim(),
          name: String(template?.name || "").trim() || "Modèle SMS",
          body: String(template?.body || "").trim(),
        }))
        .filter((template) => template.id && template.body)
    : defaultSmsTemplates();

  return {
    templates,
    confirmationTemplateId:
      String(sms.confirmationTemplateId || "").trim() || templates[0]?.id || "confirmation-rdv",
    reminder48hTemplateId:
      String(sms.reminder48hTemplateId || "").trim() ||
      templates.find((template) => template.id === "rappel-48h")?.id ||
      templates[1]?.id ||
      templates[0]?.id,
    leadWelcomeTemplateId:
      String(sms.leadWelcomeTemplateId || "").trim() ||
      templates.find((template) => template.id === "accueil-prospect")?.id ||
      templates[0]?.id,
    jobs: Array.isArray(sms.jobs) ? sms.jobs : [],
    inbox: Array.isArray(sms.inbox) ? sms.inbox : [],
    history: sms.history && typeof sms.history === "object" ? sms.history : null,
  };
}

function mergeCenterSmsSettings(currentSettings, smsPatch) {
  const current =
    currentSettings && typeof currentSettings === "object" ? currentSettings : {};
  const sms = parseCenterSmsSettings(current);

  return {
    ...current,
    sms: {
      ...sms,
      ...smsPatch,
      templates: smsPatch.templates ?? sms.templates,
      jobs: smsPatch.jobs ?? sms.jobs,
      inbox: smsPatch.inbox ?? sms.inbox,
      history: smsPatch.history ?? sms.history,
    },
  };
}

function createServiceClient() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function sendBrevoSms({ sender, recipient, content, type }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("missing_brevo_api_key");
  }

  const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      recipient,
      content,
      type: type === "marketing" ? "marketing" : "transactional",
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      result?.message ||
      result?.error?.message ||
      `brevo_${response.status}`;
    throw new Error(message);
  }

  return result;
}

function reminderSendAt(date, time) {
  const starts = new Date(`${date}T${String(time || "09:00").slice(0, 5)}:00Z`);

  if (Number.isNaN(starts.getTime())) {
    throw new Error("invalid_appointment_datetime");
  }

  return new Date(starts.getTime() - 48 * 60 * 60 * 1000).toISOString();
}

function isCancelledStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "cancelled" || value === "annulation";
}

async function findClientByPhone(supabase, phone) {
  const normalized = normalizePhone(phone);
  const last9 = normalized.slice(-9);

  if (!last9) {
    return null;
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id,center_id,first_name,last_name,phone")
    .or(`phone.eq.${normalized},phone.eq.0${last9},phone.ilike.%${last9}%`)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []).find(
      (row) => String(row.phone || "").replace(/[^\d]/g, "").slice(-9) === last9,
    ) ?? null
  );
}

async function storeIncomingSms(supabase, incoming) {
  const phone = normalizePhone(incoming.phone);
  const text = String(incoming.text || incoming.reply || "").trim();

  if (!phone || !text) {
    return { stored: false, reason: "missing_reply" };
  }

  const messageId = String(incoming.messageId || incoming.id || `${phone}-${text}`).slice(0, 80);
  const client = await findClientByPhone(supabase, phone);
  let centerId = client?.center_id || null;

  if (!centerId) {
    const slug = process.env.NEXT_PUBLIC_DEFAULT_CENTER_SLUG || "jfg-clinique-clermont";
    const { data: center } = await supabase
      .from("centers")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    centerId = center?.id ?? null;
  }

  if (!centerId) {
    return { stored: false, reason: "unknown_center" };
  }

  const { data: centerRow, error: centerError } = await supabase
    .from("centers")
    .select("id,settings")
    .eq("id", centerId)
    .single();

  if (centerError) {
    throw new Error(centerError.message);
  }

  const sms = parseCenterSmsSettings(centerRow.settings);
  if (
    sms.inbox.some(
      (item) => String(item?.messageId || "") === messageId || (item?.phone === phone && item?.text === text),
    )
  ) {
    return { stored: false, duplicate: true, centerId };
  }

  const item = {
    id: crypto.randomUUID(),
    messageId,
    phone,
    text,
    at: incoming.at || incoming.date || new Date().toISOString(),
    clientId: client?.id ?? null,
    clientName: client
      ? [client.first_name, client.last_name].filter(Boolean).join(" ")
      : "Numéro inconnu",
    unread: true,
  };

  await supabase
    .from("centers")
    .update({
      settings: mergeCenterSmsSettings(centerRow.settings, {
        inbox: [item, ...sms.inbox].slice(0, 80),
      }),
    })
    .eq("id", centerId);

  if (client?.id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("center_id", centerId)
      .eq("client_id", client.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lead?.id) {
      await supabase.from("lead_events").insert({
        center_id: centerId,
        lead_id: lead.id,
        event_type: "system",
        note: `Réponse SMS : ${text}`,
      });
    }
  }

  return { stored: true, centerId, clientId: client?.id ?? null };
}

module.exports = {
  createServiceClient,
  defaultSender,
  defaultSmsTemplates,
  findClientByPhone,
  isCancelledStatus,
  mergeCenterSmsSettings,
  normalizePhone,
  parseCenterSmsSettings,
  personalize,
  reminderSendAt,
  sendBrevoSms,
  storeIncomingSms,
};
