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

module.exports = {
  createServiceClient,
  defaultSender,
  defaultSmsTemplates,
  isCancelledStatus,
  mergeCenterSmsSettings,
  normalizePhone,
  parseCenterSmsSettings,
  personalize,
  reminderSendAt,
  sendBrevoSms,
};
