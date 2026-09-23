import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export const SEYA_SETTINGS_UPDATED_EVENT = "bookea-seya-settings-updated";
export const SEYA_CONVERSATIONS_UPDATED_EVENT =
  "bookea-seya-conversations-updated";

export type SeyaTreatmentBrief = {
  name: string;
  brief: string;
};

export type SeyaAgentSettings = {
  whatsappAgentEnabled: boolean;
  qualifyOnSignup: boolean;
  bookAppointment: boolean;
  brief: string;
  treatmentBriefs: SeyaTreatmentBrief[];
};

export type SeyaConversationStatus =
  | "À envoyer"
  | "En cours"
  | "Qualifié"
  | "RDV proposé"
  | "RDV pris"
  | "Terminé";

export type SeyaAgentMessage = {
  id: string;
  author: "seya" | "lead" | "centre";
  text: string;
  at: string;
};

export type SeyaProposedSlot = {
  date: string;
  time: string;
  label: string;
};

export type SeyaQualification = {
  need: string;
  zone: string;
  delay: string;
  availability: string;
};

export type SeyaConversation = {
  id: string;
  leadId: string;
  firstName: string;
  lastName: string;
  phone: string;
  treatment: string;
  status: SeyaConversationStatus;
  qualification: SeyaQualification;
  proposedSlots: SeyaProposedSlot[];
  bookedSlot?: SeyaProposedSlot;
  messages: SeyaAgentMessage[];
  updatedAt: string;
};

export const defaultTreatmentBriefs: SeyaTreatmentBrief[] = [
  {
    name: "Épilation Laser",
    brief:
      "Demande la zone (jambes, maillot, aisselles…). Ne promets pas un tarif. Propose un bilan / première séance, puis un créneau.",
  },
  {
    name: "Hydrafacial",
    brief:
      "Demande l’objectif peau (éclat, pores, acné). Propose un soin visage puis un créneau cette semaine.",
  },
  {
    name: "Soin minceur",
    brief:
      "Demande la zone et l’objectif. Propose un bilan minceur, pas une série complète tout de suite.",
  },
  {
    name: "Cryolipolyse",
    brief:
      "Demande la zone et si un bilan a déjà été fait. Oriente vers un rendez-vous bilan avant de parler prix.",
  },
];

export const defaultSeyaAgentSettings: SeyaAgentSettings = {
  whatsappAgentEnabled: true,
  qualifyOnSignup: true,
  bookAppointment: true,
  brief:
    "Tu es Seya, l’assistante du centre. Dès qu’un prospect s’inscrit, tu le qualifies (soin, zone, délai) puis tu proposes 2 ou 3 vrais créneaux du planning. Tu restes naturelle, courte, et tu ne balances pas un message automatique figé.",
  treatmentBriefs: defaultTreatmentBriefs,
};

export function normalizeTreatmentName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function resolveTreatmentBrief(
  settings: SeyaAgentSettings,
  treatment?: string | null,
) {
  const needle = normalizeTreatmentName(treatment || "");
  if (!needle) {
    return "";
  }

  const exact = settings.treatmentBriefs.find(
    (item) => normalizeTreatmentName(item.name) === needle,
  );
  if (exact?.brief.trim()) {
    return exact.brief.trim();
  }

  return (
    settings.treatmentBriefs.find((item) => {
      const name = normalizeTreatmentName(item.name);
      return needle.includes(name) || name.includes(needle);
    })?.brief.trim() || ""
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function seyaSettingsStorageKey(centerId: string) {
  return `bookea-seya-settings:${centerId}`;
}

function seyaConversationsStorageKey(centerId: string) {
  return `bookea-seya-conversations:${centerId}`;
}

export function normalizeSeyaAgentSettings(
  value?: Partial<SeyaAgentSettings> | null,
): SeyaAgentSettings {
  return {
    whatsappAgentEnabled: value?.whatsappAgentEnabled !== false,
    qualifyOnSignup: value?.qualifyOnSignup !== false,
    bookAppointment: value?.bookAppointment !== false,
    brief: String(value?.brief || "").trim() || defaultSeyaAgentSettings.brief,
    treatmentBriefs: normalizeTreatmentBriefs(value?.treatmentBriefs),
  };
}

function normalizeTreatmentBriefs(value?: SeyaTreatmentBrief[] | null) {
  const incoming = Array.isArray(value) ? value : [];
  const merged = new Map<string, SeyaTreatmentBrief>();

  for (const item of [...defaultTreatmentBriefs, ...incoming]) {
    const name = String(item?.name || "").trim();
    if (!name) {
      continue;
    }
    merged.set(normalizeTreatmentName(name), {
      name,
      brief: String(item?.brief || "").trim(),
    });
  }

  return [...merged.values()];
}

export function readLocalSeyaSettings(centerId: string) {
  if (typeof window === "undefined" || !centerId) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(seyaSettingsStorageKey(centerId));
    return stored
      ? normalizeSeyaAgentSettings(JSON.parse(stored) as Partial<SeyaAgentSettings>)
      : null;
  } catch {
    return null;
  }
}

export function writeLocalSeyaSettings(
  centerId: string,
  settings: SeyaAgentSettings,
) {
  if (typeof window === "undefined" || !centerId) {
    return;
  }

  window.localStorage.setItem(
    seyaSettingsStorageKey(centerId),
    JSON.stringify(normalizeSeyaAgentSettings(settings)),
  );
  window.dispatchEvent(new Event(SEYA_SETTINGS_UPDATED_EVENT));
}

export function readLocalSeyaConversations(centerId: string): SeyaConversation[] {
  if (typeof window === "undefined" || !centerId) {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(
      seyaConversationsStorageKey(centerId),
    );
    const parsed = stored ? (JSON.parse(stored) as SeyaConversation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalSeyaConversations(
  centerId: string,
  conversations: SeyaConversation[],
) {
  if (typeof window === "undefined" || !centerId) {
    return;
  }

  window.localStorage.setItem(
    seyaConversationsStorageKey(centerId),
    JSON.stringify(conversations),
  );
  window.dispatchEvent(new Event(SEYA_CONVERSATIONS_UPDATED_EVENT));
}

export async function loadSeyaAgentSettings() {
  const context = await getActiveCenterContext();
  const localSettings = readLocalSeyaSettings(context.centerId);
  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const remote = asRecord(asRecord(data?.settings).seya);
  const hasRemote = Boolean(asRecord(data?.settings).seya);
  const settings = normalizeSeyaAgentSettings({
    whatsappAgentEnabled: hasRemote
      ? remote.whatsappAgentEnabled !== false
      : (localSettings?.whatsappAgentEnabled ?? true),
    qualifyOnSignup: hasRemote
      ? remote.qualifyOnSignup !== false
      : (localSettings?.qualifyOnSignup ?? true),
    bookAppointment: hasRemote
      ? remote.bookAppointment !== false
      : (localSettings?.bookAppointment ?? true),
    brief:
      (typeof remote.brief === "string" && remote.brief.trim()) ||
      localSettings?.brief,
    treatmentBriefs: [
      ...(Array.isArray(remote.treatmentBriefs)
        ? (remote.treatmentBriefs as SeyaTreatmentBrief[])
        : []),
      ...(localSettings?.treatmentBriefs ?? []),
    ],
  });

  writeLocalSeyaSettings(context.centerId, settings);

  return {
    centerId: context.centerId,
    centerName: context.centerName,
    settings,
  };
}

export async function saveSeyaAgentSettings(settings: SeyaAgentSettings) {
  const context = await getActiveCenterContext();
  const nextSettings = normalizeSeyaAgentSettings(settings);
  writeLocalSeyaSettings(context.centerId, nextSettings);

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const currentSettings = asRecord(data?.settings);
  const currentSeya = asRecord(currentSettings.seya);
  const { error } = await supabase.from("centers").update({
    settings: {
      ...currentSettings,
      seya: {
        ...currentSeya,
        ...nextSettings,
      },
    },
  }).eq("id", context.centerId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    centerId: context.centerId,
    centerName: context.centerName,
    settings: nextSettings,
  };
}
