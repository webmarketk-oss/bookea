import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export type SmsTemplate = {
  id: string;
  name: string;
  body: string;
};

export type CenterSmsSettings = {
  templates: SmsTemplate[];
  confirmationTemplateId: string;
  reminder48hTemplateId: string;
  leadWelcomeTemplateId: string;
};

export type SmsTemplateVars = {
  firstName?: string;
  lastName?: string;
  date?: string;
  time?: string;
  treatment?: string;
  centerName?: string;
};

export const defaultSmsTemplates: SmsTemplate[] = [
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

export const defaultSmsSettings: CenterSmsSettings = {
  templates: defaultSmsTemplates,
  confirmationTemplateId: "confirmation-rdv",
  reminder48hTemplateId: "rappel-48h",
  leadWelcomeTemplateId: "accueil-prospect",
};

const SMS_SETTINGS_UPDATED_EVENT = "bookea-sms-settings-updated";

export function smsSettingsStorageKey(centerId: string) {
  return `bookea-sms-settings:${centerId}`;
}

export function normalizeSmsSettings(
  value?: Partial<CenterSmsSettings> | null,
): CenterSmsSettings {
  const templates =
    Array.isArray(value?.templates) && value.templates.length > 0
      ? value.templates
          .map((template) => ({
            id: String(template?.id || "").trim(),
            name: String(template?.name || "").trim() || "Modèle SMS",
            body: String(template?.body || "").trim(),
          }))
          .filter((template) => template.id && template.body)
      : defaultSmsTemplates;

  const templateIds = new Set(templates.map((template) => template.id));
  const fallbackId = templates[0]?.id || "confirmation-rdv";

  return {
    templates,
    confirmationTemplateId: templateIds.has(value?.confirmationTemplateId || "")
      ? value!.confirmationTemplateId!
      : templateIds.has("confirmation-rdv")
        ? "confirmation-rdv"
        : fallbackId,
    reminder48hTemplateId: templateIds.has(value?.reminder48hTemplateId || "")
      ? value!.reminder48hTemplateId!
      : templateIds.has("rappel-48h")
        ? "rappel-48h"
        : fallbackId,
    leadWelcomeTemplateId: templateIds.has(value?.leadWelcomeTemplateId || "")
      ? value!.leadWelcomeTemplateId!
      : templateIds.has("accueil-prospect")
        ? "accueil-prospect"
        : fallbackId,
  };
}

export function fillSmsTemplate(template: string, vars: SmsTemplateVars) {
  const replacements: Record<string, string> = {
    prenom: vars.firstName?.trim() || "vous",
    nom: vars.lastName?.trim() || "",
    date: vars.date?.trim() || "",
    heure: vars.time?.trim() || "",
    soin: vars.treatment?.trim() || "",
    centre: vars.centerName?.trim() || "",
  };

  let output = template;

  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }

  return output.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
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
  remote: SmsTemplate[] = [],
  local: SmsTemplate[] = [],
) {
  const templates = new Map<string, SmsTemplate>();

  for (const template of [...remote, ...local]) {
    if (template.id && template.body) {
      templates.set(template.id, template);
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
    reminder48hTemplateId:
      remoteSettings.reminder48hTemplateId || localSettings?.reminder48hTemplateId,
    leadWelcomeTemplateId:
      remoteSettings.leadWelcomeTemplateId || localSettings?.leadWelcomeTemplateId,
    templates: mergeTemplateLists(
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
