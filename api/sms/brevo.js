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
  const centerName = String(vars.centerName || vars.centre || vars.nom_centre || "").trim();
  const confirmationLink = String(
    vars.confirmationLink || vars.lien_confirmation || vars.lien || "",
  ).trim();
  const replacements = {
    prenom: String(vars.firstName || vars.prenom || "vous").trim() || "vous",
    nom: String(vars.lastName || vars.nom || "").trim(),
    date: String(vars.date || "").trim(),
    heure: String(vars.time || vars.heure || "").trim(),
    soin: String(vars.treatment || vars.soin || "").trim(),
    centre: centerName,
    nom_centre: centerName,
    lien_confirmation: confirmationLink,
    lien: confirmationLink,
  };

  let output = String(message || "");

  for (const [key, value] of Object.entries(replacements)) {
    if (!value && (key === "lien_confirmation" || key === "lien")) {
      continue;
    }
    output = output.replaceAll(`{{${key}}}`, value);
  }

  if (
    confirmationLink &&
    !output.includes(confirmationLink) &&
    !/\{\{lien(?:_confirmation)?\}\}/.test(String(message || ""))
  ) {
    output = `${output}\nConfirmez ou annulez : ${confirmationLink}`;
  }

  return toDeliverableSmsContent(output);
}

async function withConfirmationLink(vars = {}, appointmentId) {
  const current = String(
    vars.confirmationLink || vars.lien_confirmation || vars.lien || "",
  ).trim();

  if (current) {
    return {
      ...vars,
      confirmationLink: current.replace(/^https?:\/\//i, ""),
    };
  }

  const id = String(appointmentId || vars.appointmentId || "").trim();

  if (!id) {
    return vars;
  }

  try {
    const { issueAppointmentConfirmationUrl } = require("../appointments/issue");
    const url = await issueAppointmentConfirmationUrl(id);
    return {
      ...vars,
      confirmationLink: String(url || "").replace(/^https?:\/\//i, ""),
    };
  } catch {
    return vars;
  }
}

function toDeliverableSmsContent(content) {
  return String(content || "")
    .replace(/[–—−]/g, "-")
    .replace(/[’‘‛]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/https?:\/\//gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
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
      body: "BOOKEA - Rappel : votre RDV chez {{centre}} est prévu le {{date}} à {{heure}}. Confirmez ou annulez : {{lien_confirmation}}",
    },
    {
      id: "rappel-48h",
      name: "Rappel 48h avant RDV",
      body: "Bonjour {{prenom}}, rappel RDV {{soin}} le {{date}} à {{heure}} chez {{centre}}. Confirmez ou annulez : {{lien_confirmation}}",
    },
    {
      id: "accueil-prospect",
      name: "Accueil prospect",
      body: "Bonjour {{prenom}}, merci pour votre demande {{soin}}. L'équipe de {{centre}} vous contacte rapidement.",
    },
    {
      id: "anniversaire",
      name: "Anniversaire",
      body: "Bonjour {{prenom}}, toute l'équipe de {{centre}} vous souhaite un très bel anniversaire 🎂. Une petite attention vous attend au centre. À très vite !",
    },
  ];
}

function withDefaultTemplates(templates) {
  const byId = new Map(templates.map((template) => [template.id, template]));

  for (const fallback of defaultSmsTemplates()) {
    if (!byId.has(fallback.id)) {
      byId.set(fallback.id, fallback);
    }
  }

  return [...byId.values()];
}

function parseCenterSmsSettings(settings) {
  const sms =
    settings && typeof settings === "object" && settings.sms && typeof settings.sms === "object"
      ? settings.sms
      : {};
  const templates = withDefaultTemplates(
    Array.isArray(sms.templates) && sms.templates.length > 0
      ? sms.templates
          .map((template) => ({
            id: String(template?.id || "").trim(),
            name: String(template?.name || "").trim() || "Modèle SMS",
            body: String(template?.body || "").trim(),
          }))
          .filter((template) => template.id && template.body)
      : defaultSmsTemplates(),
  );

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
    birthdayTemplateId:
      String(sms.birthdayTemplateId || "").trim() ||
      templates.find((template) => template.id === "anniversaire")?.id ||
      templates[0]?.id,
    birthdaySmsEnabled: sms.birthdaySmsEnabled !== false,
    jobs: Array.isArray(sms.jobs) ? sms.jobs : [],
    inbox: Array.isArray(sms.inbox) ? sms.inbox : [],
    history: sms.history && typeof sms.history === "object" ? sms.history : null,
    quota: sms.quota && typeof sms.quota === "object" ? sms.quota : null,
  };
}

const MONTHLY_SMS_LIMIT = 500;

function currentSmsMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthsBetween(fromMonth, toMonth) {
  const [fromYear, fromMonthNumber] = String(fromMonth || "")
    .split("-")
    .map(Number);
  const [toYear, toMonthNumber] = String(toMonth || "")
    .split("-")
    .map(Number);

  if (
    !fromYear ||
    !fromMonthNumber ||
    !toYear ||
    !toMonthNumber
  ) {
    return 0;
  }

  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

function applyMonthlySmsGrant(rawQuota) {
  const month = currentSmsMonth();
  const quota = rawQuota && typeof rawQuota === "object" ? rawQuota : {};
  const monthlyGrant =
    Number(quota.monthlyGrant || quota.limit) > 0
      ? Math.floor(Number(quota.monthlyGrant || quota.limit))
      : MONTHLY_SMS_LIMIT;

  let remaining;
  let lastGrantMonth;
  let usedThisMonth;

  if (typeof quota.remaining === "number") {
    remaining = Math.max(0, Math.floor(quota.remaining));
    lastGrantMonth = String(quota.lastGrantMonth || "").slice(0, 7);
    usedThisMonth =
      lastGrantMonth === month
        ? Math.max(0, Math.floor(Number(quota.usedThisMonth) || 0))
        : 0;
  } else if (quota.month) {
    const oldLimit =
      Number(quota.limit) > 0 ? Math.floor(Number(quota.limit)) : monthlyGrant;
    const oldUsed = Math.max(0, Math.floor(Number(quota.used) || 0));
    remaining = Math.max(0, oldLimit - oldUsed);
    lastGrantMonth = /^\d{4}-\d{2}$/.test(String(quota.month))
      ? String(quota.month).slice(0, 7)
      : "";
    usedThisMonth = quota.month === month ? oldUsed : 0;
  } else {
    remaining = monthlyGrant;
    lastGrantMonth = month;
    usedThisMonth = 0;
  }

  let changed = typeof quota.remaining !== "number" || !quota.lastGrantMonth;

  if (!/^\d{4}-\d{2}$/.test(lastGrantMonth)) {
    lastGrantMonth = month;
    changed = true;
  } else if (lastGrantMonth < month) {
    const missed = monthsBetween(lastGrantMonth, month);
    if (missed > 0) {
      remaining += monthlyGrant * missed;
      lastGrantMonth = month;
      usedThisMonth = 0;
      changed = true;
    }
  }

  return {
    remaining,
    lastGrantMonth,
    monthlyGrant,
    usedThisMonth,
    month,
    used: usedThisMonth,
    limit: monthlyGrant,
    changed,
  };
}

function readSmsQuota(sms) {
  return applyMonthlySmsGrant(sms?.quota);
}

function quotaRecord(quota) {
  return {
    remaining: quota.remaining,
    lastGrantMonth: quota.lastGrantMonth,
    monthlyGrant: quota.monthlyGrant,
    usedThisMonth: quota.usedThisMonth,
  };
}

async function loadCenterSmsQuotaRow(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,settings")
    .eq("id", centerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("center_not_found");
  }

  return data;
}

async function ensureCenterSmsQuota(supabase, centerId) {
  const data = await loadCenterSmsQuotaRow(supabase, centerId);
  const quota = applyMonthlySmsGrant(parseCenterSmsSettings(data.settings).quota);

  if (quota.changed) {
    const { error: updateError } = await supabase
      .from("centers")
      .update({
        settings: mergeCenterSmsSettings(data.settings, {
          quota: quotaRecord(quota),
        }),
      })
      .eq("id", centerId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return quota;
}

async function consumeCenterSmsQuota(supabase, centerId, count = 1) {
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  const data = await loadCenterSmsQuotaRow(supabase, centerId);
  const quota = applyMonthlySmsGrant(parseCenterSmsSettings(data.settings).quota);

  if (amount === 0) {
    return quota;
  }

  if (quota.remaining < amount) {
    const quotaError = new Error("sms_quota_exceeded");
    quotaError.remaining = quota.remaining;
    quotaError.limit = quota.monthlyGrant;
    throw quotaError;
  }

  const nextQuota = {
    ...quota,
    remaining: quota.remaining - amount,
    usedThisMonth: quota.usedThisMonth + amount,
    used: quota.usedThisMonth + amount,
    changed: false,
  };

  const { error: updateError } = await supabase
    .from("centers")
    .update({
      settings: mergeCenterSmsSettings(data.settings, {
        quota: quotaRecord(nextQuota),
      }),
    })
    .eq("id", centerId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return nextQuota;
}

async function creditCenterSmsQuota(supabase, centerId, count = 0) {
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  const data = await loadCenterSmsQuotaRow(supabase, centerId);
  const quota = applyMonthlySmsGrant(parseCenterSmsSettings(data.settings).quota);
  const nextQuota = {
    ...quota,
    remaining: quota.remaining + amount,
    changed: false,
  };

  const { error: updateError } = await supabase
    .from("centers")
    .update({
      settings: mergeCenterSmsSettings(data.settings, {
        quota: quotaRecord(nextQuota),
      }),
    })
    .eq("id", centerId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return nextQuota;
}

function getBirthdayTemplate(sms) {
  return (
    sms.templates.find((template) => template.id === sms.birthdayTemplateId) ||
    sms.templates.find((template) => template.id === "anniversaire") ||
    defaultSmsTemplates().find((template) => template.id === "anniversaire")
  );
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function toIsoBirthDate(value) {
  const trimmed = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!slash) {
    return "";
  }

  return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
}

function birthMonthDay(value) {
  const iso = toIsoBirthDate(value);
  return iso ? iso.slice(5) : "";
}

function parisYmd(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isBirthdayToday(birthDate) {
  const monthDay = birthMonthDay(birthDate);

  if (!monthDay) {
    return false;
  }

  const today = parisYmd();
  const todayMonthDay = today.slice(5);

  if (monthDay === todayMonthDay) {
    return true;
  }

  const year = Number(today.slice(0, 4));
  return monthDay === "02-29" && todayMonthDay === "02-28" && !isLeapYear(year);
}

function birthdayYear(date = new Date()) {
  return Number(parisYmd(date).slice(0, 4));
}

function nextBirthdaySendAt(birthDate) {
  const monthDay = birthMonthDay(birthDate);

  if (!monthDay) {
    return null;
  }

  const month = Number(monthDay.slice(0, 2));
  const day = Number(monthDay.slice(3, 5));
  let year = birthdayYear();

  function isoFor(targetYear) {
    let targetDay = day;

    if (month === 2 && day === 29 && !isLeapYear(targetYear)) {
      targetDay = 28;
    }

    return `${targetYear}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T09:00:00Z`;
  }

  let sendAt = isoFor(year);

  if (new Date(sendAt).getTime() <= Date.now()) {
    sendAt = isoFor(year + 1);
  }

  return sendAt;
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
      quota: smsPatch.quota ?? sms.quota,
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

async function sendBrevoSms({ sender, recipient, content: rawContent, type }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("missing_brevo_api_key");
  }

  const content = toDeliverableSmsContent(rawContent);
  const unicodeEnabled = /[^\u000a\u000d\u0020-\u007eàâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ€]/.test(
    content,
  );

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
      unicodeEnabled,
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
  MONTHLY_SMS_LIMIT,
  birthdayYear,
  consumeCenterSmsQuota,
  creditCenterSmsQuota,
  createServiceClient,
  ensureCenterSmsQuota,
  currentSmsMonth,
  defaultSender,
  defaultSmsTemplates,
  findClientByPhone,
  getBirthdayTemplate,
  isBirthdayToday,
  isCancelledStatus,
  mergeCenterSmsSettings,
  nextBirthdaySendAt,
  normalizePhone,
  parseCenterSmsSettings,
  personalize,
  readSmsQuota,
  reminderSendAt,
  sendBrevoSms,
  storeIncomingSms,
  toIsoBirthDate,
  withConfirmationLink,
};
