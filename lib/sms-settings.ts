import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export type SmsTemplate = {
  id: string;
  name: string;
  body: string;
};

export type AppointmentReminderKind =
  | "reminder_j7"
  | "reminder_j5"
  | "reminder_48h"
  | "reminder_24h";

export const APPOINTMENT_REMINDER_HOURS: Record<AppointmentReminderKind, number> =
  {
    reminder_j7: 7 * 24,
    reminder_j5: 5 * 24,
    reminder_48h: 48,
    reminder_24h: 24,
  };

export type CenterSmsSettings = {
  templates: SmsTemplate[];
  confirmationTemplateId: string;
  reminderJ7TemplateId: string;
  reminderJ5TemplateId: string;
  reminder48hTemplateId: string;
  reminder24hTemplateId: string;
  confirmationEnabled: boolean;
  reminderJ7Enabled: boolean;
  reminderJ5Enabled: boolean;
  reminder48hEnabled: boolean;
  reminder24hEnabled: boolean;
  leadWelcomeEnabled: boolean;
  leadWelcomeTemplateId: string;
  birthdayTemplateId: string;
  birthdaySmsEnabled: boolean;
};

export type SmsTemplateVars = {
  firstName?: string;
  lastName?: string;
  date?: string;
  time?: string;
  treatment?: string;
  centerName?: string;
  confirmationLink?: string;
};

export const defaultSmsTemplates: SmsTemplate[] = [
  {
    id: "confirmation-rdv",
    name: "Confirmation RDV",
    body: "BOOKEA - Rappel : votre RDV chez {{centre}} est prévu le {{date}} à {{heure}}.\n\nConfirmez, modifiez ou annulez ici : {{lien_confirmation}}",
  },
  {
    id: "contre-indications-laser-j7",
    name: "Contre-indications laser J-7",
    body: "Bonjour {{prenom}}, votre séance laser {{soin}} est le {{date}} à {{heure}} chez {{centre}}.\nContre-indications : pas de soleil/UV ni autobronzant, pas de cire ni pince (raser seulement). Prévenez-nous si grossesse, médicaments photosensibilisants ou Roaccutane.",
  },
  {
    id: "rappel-j5",
    name: "Rappel J-5",
    body: "Bonjour {{prenom}}, rappel : votre rendez-vous {{soin}} est dans 5 jours, le {{date}} à {{heure}} chez {{centre}}.\nConfirmez, modifiez ou annulez ici : {{lien_confirmation}}",
  },
  {
    id: "rappel-48h",
    name: "Rappel 48h avant RDV",
    body: "Bonjour {{prenom}}, rappel : votre rendez-vous {{soin}} est dans 48h, le {{date}} à {{heure}} chez {{centre}}.\nConfirmez, modifiez ou annulez ici : {{lien_confirmation}}",
  },
  {
    id: "rappel-24h",
    name: "Rappel 24h avant RDV",
    body: "Bonjour {{prenom}}, rappel : votre rendez-vous {{soin}} est demain, le {{date}} à {{heure}} chez {{centre}}.\nConfirmez, modifiez ou annulez ici : {{lien_confirmation}}",
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

export function reminderFlagsFromSettings(
  settings?: Pick<
    CenterSmsSettings,
    | "confirmationEnabled"
    | "reminderJ7Enabled"
    | "reminderJ5Enabled"
    | "reminder48hEnabled"
    | "reminder24hEnabled"
  > | null,
) {
  return {
    sendSmsNow: settings?.confirmationEnabled !== false,
    sendSmsJ7: settings?.reminderJ7Enabled !== false,
    sendSmsJ5: settings?.reminderJ5Enabled === true,
    sendSms48h: settings?.reminder48hEnabled === true,
    sendSms24h: settings?.reminder24hEnabled === true,
  };
}

export function isLaserTreatment(...values: Array<string | undefined | null>) {
  return values.some((value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes("laser"),
  );
}

export const defaultSmsSettings: CenterSmsSettings = {
  templates: defaultSmsTemplates,
  confirmationTemplateId: "confirmation-rdv",
  reminderJ7TemplateId: "contre-indications-laser-j7",
  reminderJ5TemplateId: "rappel-j5",
  reminder48hTemplateId: "rappel-48h",
  reminder24hTemplateId: "rappel-24h",
  confirmationEnabled: true,
  reminderJ7Enabled: true,
  reminderJ5Enabled: false,
  reminder48hEnabled: false,
  reminder24hEnabled: false,
  leadWelcomeEnabled: true,
  leadWelcomeTemplateId: "accueil-prospect",
  birthdayTemplateId: "anniversaire",
  birthdaySmsEnabled: true,
};

function resolveAssignedTemplateId(
  templateIds: Set<string>,
  value: string | undefined,
  preferredId: string,
  fallbackId: string,
) {
  if (value && templateIds.has(value)) {
    return value;
  }

  if (templateIds.has(preferredId)) {
    return preferredId;
  }

  return fallbackId;
}

export const MONTHLY_SMS_LIMIT = 500;

export type SmsQuotaRecord = {
  remaining?: number;
  lastGrantMonth?: string;
  monthlyGrant?: number;
  usedThisMonth?: number;
  month?: string;
  used?: number;
  limit?: number;
};

export type SmsQuota = {
  remaining: number;
  lastGrantMonth: string;
  monthlyGrant: number;
  usedThisMonth: number;
  month: string;
  used: number;
  limit: number;
  changed: boolean;
};

export function currentSmsMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthsBetween(fromMonth: string, toMonth: string) {
  const [fromYear, fromMonthNumber] = String(fromMonth || "")
    .split("-")
    .map(Number);
  const [toYear, toMonthNumber] = String(toMonth || "")
    .split("-")
    .map(Number);

  if (!fromYear || !fromMonthNumber || !toYear || !toMonthNumber) {
    return 0;
  }

  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

function quotaRecord(quota: SmsQuota) {
  return {
    remaining: quota.remaining,
    lastGrantMonth: quota.lastGrantMonth,
    monthlyGrant: quota.monthlyGrant,
    usedThisMonth: quota.usedThisMonth,
  };
}

export function normalizeSmsQuota(value?: SmsQuotaRecord | null): SmsQuota {
  const month = currentSmsMonth();
  const quota = value && typeof value === "object" ? value : {};
  const monthlyGrant =
    Number(quota.monthlyGrant || quota.limit) > 0
      ? Math.floor(Number(quota.monthlyGrant || quota.limit))
      : MONTHLY_SMS_LIMIT;

  let remaining: number;
  let lastGrantMonth: string;
  let usedThisMonth: number;

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

function readSettingsObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function persistCenterSmsQuota(
  centerId: string,
  quota: SmsQuota,
  currentSettings: Record<string, unknown>,
) {
  const supabase = createClient();
  const currentSms = readSettingsObject(currentSettings.sms);
  const { error } = await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        sms: {
          ...currentSms,
          quota: quotaRecord(quota),
        },
      },
    })
    .eq("id", centerId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function loadSmsQuota() {
  const context = await getActiveCenterContext();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const currentSettings = readSettingsObject(data?.settings);
  const quota = normalizeSmsQuota(
    readSettingsObject(currentSettings.sms).quota as SmsQuotaRecord | undefined,
  );

  if (quota.changed) {
    await persistCenterSmsQuota(context.centerId, quota, currentSettings);
  }

  return {
    centerId: context.centerId,
    ...quota,
  };
}

export async function creditSmsQuota(centerId: string, count: number) {
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Centre introuvable.");
  }

  const currentSettings = readSettingsObject(data.settings);
  const quota = normalizeSmsQuota(
    readSettingsObject(currentSettings.sms).quota as SmsQuotaRecord | undefined,
  );
  const nextQuota: SmsQuota = {
    ...quota,
    remaining: quota.remaining + amount,
    changed: false,
  };

  await persistCenterSmsQuota(centerId, nextQuota, currentSettings);

  return {
    centerId,
    ...nextQuota,
  };
}

const SMS_SETTINGS_UPDATED_EVENT = "bookea-sms-settings-updated";

export function smsSettingsStorageKey(centerId: string) {
  return `bookea-sms-settings:${centerId}`;
}

export function normalizeSmsSettings(
  value?: Partial<CenterSmsSettings> | null,
): CenterSmsSettings {
  const templates = withDefaultTemplates(
    Array.isArray(value?.templates) && value.templates.length > 0
      ? value.templates
          .map((template) => ({
            id: String(template?.id || "").trim(),
            name: String(template?.name || "").trim() || "Modèle SMS",
            body: String(template?.body || "").trim(),
          }))
          .filter((template) => template.id && template.body)
      : defaultSmsTemplates,
  );

  const templateIds = new Set(templates.map((template) => template.id));
  const fallbackId = templates[0]?.id || "confirmation-rdv";

  return {
    templates,
    confirmationTemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.confirmationTemplateId,
      "confirmation-rdv",
      fallbackId,
    ),
    reminderJ7TemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.reminderJ7TemplateId,
      "contre-indications-laser-j7",
      fallbackId,
    ),
    reminderJ5TemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.reminderJ5TemplateId,
      "rappel-j5",
      fallbackId,
    ),
    reminder48hTemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.reminder48hTemplateId,
      "rappel-48h",
      fallbackId,
    ),
    reminder24hTemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.reminder24hTemplateId,
      "rappel-24h",
      fallbackId,
    ),
    confirmationEnabled: value?.confirmationEnabled !== false,
    reminderJ7Enabled: value?.reminderJ7Enabled !== false,
    reminderJ5Enabled: value?.reminderJ5Enabled === true,
    reminder48hEnabled: value?.reminder48hEnabled === true,
    reminder24hEnabled: value?.reminder24hEnabled === true,
    leadWelcomeEnabled: value?.leadWelcomeEnabled !== false,
    leadWelcomeTemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.leadWelcomeTemplateId,
      "accueil-prospect",
      fallbackId,
    ),
    birthdayTemplateId: resolveAssignedTemplateId(
      templateIds,
      value?.birthdayTemplateId,
      "anniversaire",
      fallbackId,
    ),
    birthdaySmsEnabled: value?.birthdaySmsEnabled !== false,
  };
}

function withDefaultTemplates(templates: SmsTemplate[]) {
  const byId = new Map(templates.map((template) => [template.id, template]));

  for (const fallback of defaultSmsTemplates) {
    if (!byId.has(fallback.id)) {
      byId.set(fallback.id, fallback);
    }
  }

  return [...byId.values()];
}

export function toBirthDateIso(value?: string | null) {
  const trimmed = String(value || "").trim();

  if (!trimmed || trimmed === "À compléter") {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!slash) {
    return "";
  }

  return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
}

export function fillSmsTemplate(template: string, vars: SmsTemplateVars) {
  const centerName = vars.centerName?.trim() || "";
  const confirmationLink = vars.confirmationLink?.trim() || "";
  const replacements: Record<string, string> = {
    prenom: vars.firstName?.trim() || "vous",
    nom: vars.lastName?.trim() || "",
    date: vars.date?.trim() || "",
    heure: vars.time?.trim() || "",
    soin: vars.treatment?.trim() || "",
    centre: centerName,
    nom_centre: centerName,
    lien_confirmation: confirmationLink,
    lien: confirmationLink,
  };

  let output = template;

  for (const [key, value] of Object.entries(replacements)) {
    if (!value && (key === "lien_confirmation" || key === "lien")) {
      continue;
    }
    output = output.replaceAll(`{{${key}}}`, value);
  }

  if (confirmationLink && !output.includes(confirmationLink)) {
    const bare = confirmationLink.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    const alreadyThere =
      (bare && output.includes(bare)) ||
      /(?:www\.)?bookeai\.fr\/r\/[A-Za-z0-9_-]+/i.test(output);

    if (!alreadyThere) {
      output = `${output}\n\nConfirmez, modifiez ou annulez ici : ${confirmationLink}`;
    }
  }

  return output
    .replace(/[–—−]/g, "-")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

export function formatSmsDate(isoDate: string) {
  if (!isoDate) {
    return "";
  }

  const date = new Date(`${isoDate}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function splitPersonName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "vous",
    lastName: parts.slice(1).join(" "),
  };
}

export function mergeTemplateLists(
  ...lists: Array<SmsTemplate[] | undefined>
) {
  const templates = new Map<string, SmsTemplate>();

  for (const list of lists) {
    for (const template of list ?? []) {
      if (template.id && template.body) {
        templates.set(template.id, template);
      }
    }
  }

  return templates.size > 0 ? [...templates.values()] : defaultSmsTemplates;
}

export function getSmsTemplate(
  settings: CenterSmsSettings,
  templateId?: string | null,
) {
  return (
    settings.templates.find((template) => template.id === templateId) ??
    settings.templates[0] ??
    defaultSmsTemplates[0]
  );
}

export function readLocalSmsSettings(centerId: string) {
  if (typeof window === "undefined" || !centerId) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(smsSettingsStorageKey(centerId));
    return stored
      ? normalizeSmsSettings(JSON.parse(stored) as Partial<CenterSmsSettings>)
      : null;
  } catch {
    return null;
  }
}

export function writeLocalSmsSettings(
  centerId: string,
  settings: CenterSmsSettings,
) {
  if (typeof window === "undefined" || !centerId) {
    return;
  }

  window.localStorage.setItem(
    smsSettingsStorageKey(centerId),
    JSON.stringify(normalizeSmsSettings(settings)),
  );
  window.dispatchEvent(new Event(SMS_SETTINGS_UPDATED_EVENT));
}

export async function loadCenterSmsSettings() {
  const context = await getActiveCenterContext();
  const localSettings = readLocalSmsSettings(context.centerId);
  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const remoteSettings = normalizeSmsSettings(
    ((data?.settings as { sms?: Partial<CenterSmsSettings> } | null)?.sms ??
      null) as Partial<CenterSmsSettings> | null,
  );
  const hasRemote = Boolean(
    (data?.settings as { sms?: unknown } | null)?.sms,
  );
  const settings = normalizeSmsSettings({
    confirmationTemplateId:
      remoteSettings.confirmationTemplateId ||
      localSettings?.confirmationTemplateId,
    reminderJ7TemplateId:
      remoteSettings.reminderJ7TemplateId || localSettings?.reminderJ7TemplateId,
    reminderJ5TemplateId:
      remoteSettings.reminderJ5TemplateId || localSettings?.reminderJ5TemplateId,
    reminder48hTemplateId:
      remoteSettings.reminder48hTemplateId || localSettings?.reminder48hTemplateId,
    reminder24hTemplateId:
      remoteSettings.reminder24hTemplateId ||
      localSettings?.reminder24hTemplateId,
    confirmationEnabled: hasRemote
      ? remoteSettings.confirmationEnabled
      : (localSettings?.confirmationEnabled ?? true),
    reminderJ7Enabled: hasRemote
      ? remoteSettings.reminderJ7Enabled
      : (localSettings?.reminderJ7Enabled ?? true),
    reminderJ5Enabled: hasRemote
      ? remoteSettings.reminderJ5Enabled
      : Boolean(localSettings?.reminderJ5Enabled),
    reminder48hEnabled: hasRemote
      ? remoteSettings.reminder48hEnabled
      : Boolean(localSettings?.reminder48hEnabled),
    reminder24hEnabled: hasRemote
      ? remoteSettings.reminder24hEnabled
      : Boolean(localSettings?.reminder24hEnabled),
    leadWelcomeEnabled: hasRemote
      ? remoteSettings.leadWelcomeEnabled
      : (localSettings?.leadWelcomeEnabled ?? true),
    leadWelcomeTemplateId:
      remoteSettings.leadWelcomeTemplateId || localSettings?.leadWelcomeTemplateId,
    birthdayTemplateId:
      remoteSettings.birthdayTemplateId || localSettings?.birthdayTemplateId,
    birthdaySmsEnabled: hasRemote
      ? remoteSettings.birthdaySmsEnabled
      : (localSettings?.birthdaySmsEnabled ?? true),
    templates: mergeTemplateLists(
      defaultSmsTemplates,
      hasRemote ? remoteSettings.templates : [],
      localSettings?.templates ?? [],
    ),
  });

  writeLocalSmsSettings(context.centerId, settings);

  return {
    centerId: context.centerId,
    centerName: context.centerName,
    settings,
  };
}

export async function saveCenterSmsSettings(settings: CenterSmsSettings) {
  const context = await getActiveCenterContext();
  const nextSettings = normalizeSmsSettings(settings);

  writeLocalSmsSettings(context.centerId, nextSettings);

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const currentSettings =
    data?.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const currentSms =
    currentSettings.sms && typeof currentSettings.sms === "object"
      ? (currentSettings.sms as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        sms: {
          ...currentSms,
          ...nextSettings,
        },
      },
    })
    .eq("id", context.centerId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    centerId: context.centerId,
    centerName: context.centerName,
    settings: nextSettings,
  };
}

export type StoredSmsCampaign = {
  id: number;
  name: string;
  audience: string;
  message: string;
  plannedAt: string;
  recipients: number;
  status: "Envoyé" | "Planifié" | "Brouillon";
};

type StoredSmsHistory = {
  campaigns: StoredSmsCampaign[];
  remainingCredits?: number;
};

export function smsHistoryStorageKey(centerId: string) {
  return `bookea-sms-history:${centerId}`;
}

export function readLocalSmsHistory(centerId: string): StoredSmsHistory {
  if (typeof window === "undefined" || !centerId) {
    return { campaigns: [] };
  }

  try {
    const stored = window.localStorage.getItem(smsHistoryStorageKey(centerId));
    if (!stored) {
      return { campaigns: [] };
    }

    const parsed = JSON.parse(stored) as StoredSmsHistory;
    return {
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns.slice(0, 50) : [],
      remainingCredits:
        typeof parsed.remainingCredits === "number" ? parsed.remainingCredits : undefined,
    };
  } catch {
    return { campaigns: [] };
  }
}

export function writeLocalSmsHistory(centerId: string, history: StoredSmsHistory) {
  if (typeof window === "undefined" || !centerId) {
    return;
  }

  window.localStorage.setItem(
    smsHistoryStorageKey(centerId),
    JSON.stringify({
      campaigns: history.campaigns.slice(0, 50),
      remainingCredits: history.remainingCredits,
    }),
  );
}

export async function loadSmsHistory() {
  const context = await getActiveCenterContext();
  const local = readLocalSmsHistory(context.centerId);
  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const remote = (data?.settings as { sms?: { history?: StoredSmsHistory } } | null)?.sms
    ?.history;
  const remoteCampaigns = Array.isArray(remote?.campaigns) ? remote.campaigns : [];
  const campaigns = [...local.campaigns, ...remoteCampaigns]
    .filter((campaign, index, list) => list.findIndex((item) => item.id === campaign.id) === index)
    .slice(0, 50);
  const remainingCredits =
    local.remainingCredits ??
    (typeof remote?.remainingCredits === "number" ? remote.remainingCredits : undefined);

  writeLocalSmsHistory(context.centerId, { campaigns, remainingCredits });

  return {
    centerId: context.centerId,
    campaigns,
    remainingCredits,
  };
}

export async function saveSmsHistory(
  campaigns: StoredSmsCampaign[],
  remainingCredits?: number,
) {
  const context = await getActiveCenterContext();
  const history = {
    campaigns: campaigns.slice(0, 50),
    remainingCredits,
  };

  writeLocalSmsHistory(context.centerId, history);

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const currentSettings =
    data?.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const currentSms =
    currentSettings.sms && typeof currentSettings.sms === "object"
      ? (currentSettings.sms as Record<string, unknown>)
      : {};

  await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        sms: {
          ...currentSms,
          history,
        },
      },
    })
    .eq("id", context.centerId);

  return history;
}

export type SmsInboxItem = {
  id: string;
  phone: string;
  text: string;
  at: string;
  clientName?: string;
  unread?: boolean;
};

export async function loadSmsInbox() {
  const context = await getActiveCenterContext();
  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const inbox = (data?.settings as { sms?: { inbox?: SmsInboxItem[] } } | null)?.sms?.inbox;

  return Array.isArray(inbox) ? inbox : [];
}
