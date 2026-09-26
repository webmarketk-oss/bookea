import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export const SEYA_SETTINGS_UPDATED_EVENT = "bookea-seya-settings-updated";
export const SEYA_CONVERSATIONS_UPDATED_EVENT =
  "bookea-seya-conversations-updated";

export type SeyaTreatmentBrief = {
  name: string;
  brief: string;
  opening?: string;
};

export type SeyaOfferMap = {
  match: string;
  label: string;
};

export type SeyaAgentSettings = {
  whatsappAgentEnabled: boolean;
  autoMessageOnNewLead: boolean;
  qualifyOnSignup: boolean;
  askForAppointment: boolean;
  bookAppointment: boolean;
  handoffToHuman: boolean;
  relanceEnabled: boolean;
  relanceDays: number[];
  brief: string;
  treatmentBriefs: SeyaTreatmentBrief[];
  offerMaps: SeyaOfferMap[];
};

export type SeyaConversationStatus =
  | "À envoyer"
  | "En cours"
  | "Qualifié"
  | "RDV proposé"
  | "RDV pris"
  | "RDV confirmé"
  | "Chaud"
  | "À recontacter"
  | "Pas intéressé"
  | "Terminé";

export type SeyaInboxTag =
  | "court"
  | "chaud"
  | "humain"
  | "rdv"
  | "sans_reponse"
  | "ferme";

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
  campaign?: string;
  offerLabel?: string;
  messages: SeyaAgentMessage[];
  updatedAt: string;
  lastRelanceAt?: string | null;
  relanceCount?: number;
};

export const defaultTreatmentBriefs: SeyaTreatmentBrief[] = [
  {
    name: "Épilation Laser",
    brief:
      "Le lead vient pour une épilation définitive. Demande la zone (jambes, maillot, aisselles, visage…). Ne promets pas un tarif. Propose un bilan / première séance, puis un créneau.",
    opening:
      "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Quelles zones souhaitez-vous traiter ?",
  },
  {
    name: "Épilation définitive",
    brief:
      "Le lead vient pour une épilation définitive. Demande la zone (jambes, maillot, aisselles, visage…). Ne promets pas un tarif. Propose un bilan / première séance, puis un créneau.",
    opening:
      "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Quelles zones souhaitez-vous traiter ?",
  },
  {
    name: "Hydrafacial",
    brief:
      "Le lead vient pour un soin visage. Demande l’objectif peau (éclat, pores, acné). Propose un hydrafacial ou un soin visage, puis un créneau cette semaine.",
    opening:
      "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Quel est votre objectif peau ? Quelle zone souhaitez-vous traiter ?",
  },
  {
    name: "Soin visage",
    brief:
      "Le lead vient pour un soin visage. Demande l’objectif peau (éclat, pores, acné, hydratation). Propose un soin ou un bilan peau, puis un créneau.",
    opening:
      "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Quel est votre objectif peau ? Quelle zone souhaitez-vous traiter ?",
  },
  {
    name: "Soin minceur",
    brief:
      "Le lead vient pour un minceur. Demande la zone et l’objectif. Propose un bilan minceur, pas une série complète tout de suite, puis un créneau.",
    opening:
      "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Que recherchez-vous ? Quelles zones souhaitez-vous traiter ?",
  },
  {
    name: "Cryolipolyse",
    brief:
      "Le lead vient pour un minceur / cryolipolyse. Demande la zone et si un bilan a déjà été fait. Oriente vers un rendez-vous bilan avant de parler prix.",
    opening:
      "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Que recherchez-vous ? Quelles zones souhaitez-vous traiter ?",
  },
];

const treatmentAliases: Array<{ keys: string[]; name: string }> = [
  {
    keys: [
      "epilation",
      "épilation",
      "laser",
      "definitive",
      "définitive",
      "epil",
    ],
    name: "Épilation Laser",
  },
  {
    keys: ["minceur", "cryo", "cryolipolyse", "cellulite", "ventre"],
    name: "Soin minceur",
  },
  {
    keys: ["visage", "hydrafacial", "peau", "glow", "acne", "acné"],
    name: "Soin visage",
  },
];

export const defaultSeyaOfferMaps: SeyaOfferMap[] = [
  {
    match: "offre 99",
    label: "une séance découverte / bilan à 99€",
  },
  {
    match: "cryo 99",
    label: "une séance découverte de cryolipolyse à 99€",
  },
];

export const defaultSeyaAgentSettings: SeyaAgentSettings = {
  whatsappAgentEnabled: true,
  autoMessageOnNewLead: true,
  qualifyOnSignup: true,
  askForAppointment: true,
  bookAppointment: false,
  handoffToHuman: true,
  relanceEnabled: true,
  relanceDays: [1, 5, 30],
  brief:
    "Tu es Seya, l’assistante du centre. Tu qualifies le besoin (soin, zone, délai) avec le vrai nom de l’offre, jamais le code campagne. Tu ne poses un RDV que si le centre l’a autorisé. Sinon tu demandes si la personne veut un rendez-vous et tu transmets à une conseillère.",
  treatmentBriefs: defaultTreatmentBriefs,
  offerMaps: defaultSeyaOfferMaps,
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

  const partial = settings.treatmentBriefs.find((item) => {
    const name = normalizeTreatmentName(item.name);
    return needle.includes(name) || name.includes(needle);
  })?.brief.trim();
  if (partial) {
    return partial;
  }

  const alias = treatmentAliases.find((item) =>
    item.keys.some((key) => needle.includes(normalizeTreatmentName(key))),
  );
  if (!alias) {
    return "";
  }

  return (
    settings.treatmentBriefs.find(
      (item) => normalizeTreatmentName(item.name) === normalizeTreatmentName(alias.name),
    )?.brief.trim() || ""
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

export function resolveSeyaOpening(
  settings: SeyaAgentSettings,
  {
    firstName,
    centerName,
    campaign,
    treatment,
  }: {
    firstName?: string | null;
    centerName?: string | null;
    campaign?: string | null;
    treatment?: string | null;
  },
) {
  const hay = `${campaign || ""} ${treatment || ""}`;
  const family = familyFromTreatment(hay);
  const offer =
    resolveOfferLabel(settings, campaign, treatment) || defaultOfferForFamily(family);
  const brief = findTreatmentBrief(settings, hay);
  const template =
    brief?.opening?.trim() ||
    defaultOpeningForFamily(family);
  const center = String(centerName || "").trim() || "le centre";

  return fillSeyaTemplate(template, {
    prenom: String(firstName || "").trim() || "bonjour",
    centre: center,
    offre: offer,
  });
}

function findTreatmentBrief(settings: SeyaAgentSettings, treatment?: string | null) {
  const needle = normalizeTreatmentName(treatment || "");
  if (!needle) {
    return null;
  }

  const exact = settings.treatmentBriefs.find(
    (item) => normalizeTreatmentName(item.name) === needle,
  );
  if (exact) {
    return exact;
  }

  const partial = settings.treatmentBriefs.find((item) => {
    const name = normalizeTreatmentName(item.name);
    return name && (needle.includes(name) || name.includes(needle));
  });
  if (partial) {
    return partial;
  }

  const alias = treatmentAliases.find((item) =>
    item.keys.some((key) => needle.includes(normalizeTreatmentName(key))),
  );
  if (!alias) {
    return null;
  }

  return (
    settings.treatmentBriefs.find(
      (item) => normalizeTreatmentName(item.name) === normalizeTreatmentName(alias.name),
    ) || null
  );
}

function familyFromTreatment(treatment?: string | null) {
  const needle = normalizeTreatmentName(treatment || "");
  if (!needle) {
    return "";
  }
  if (treatmentAliases[0].keys.some((key) => needle.includes(normalizeTreatmentName(key)))) {
    return "epilation";
  }
  if (treatmentAliases[1].keys.some((key) => needle.includes(normalizeTreatmentName(key)))) {
    return "minceur";
  }
  if (treatmentAliases[2].keys.some((key) => needle.includes(normalizeTreatmentName(key)))) {
    return "visage";
  }
  return "";
}

function defaultOfferForFamily(family: string) {
  if (family === "minceur") {
    return "notre offre découverte minceur";
  }
  if (family === "visage") {
    return "notre soin visage";
  }
  if (family === "epilation") {
    return "l’épilation définitive";
  }
  return "un soin";
}

function defaultOpeningForFamily(family: string) {
  if (family === "minceur") {
    return "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Que recherchez-vous ? Quelles zones souhaitez-vous traiter ?";
  }
  if (family === "visage") {
    return "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Quel est votre objectif peau ? Quelle zone souhaitez-vous traiter ?";
  }
  if (family === "epilation") {
    return "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande pour {offre}. Quelles zones souhaitez-vous traiter ?";
  }
  return "Bonjour, je suis Seya du centre {centre}. Vous avez fait une demande chez nous. Quel soin vous intéresse : minceur, visage ou épilation définitive ?";
}

function fillSeyaTemplate(
  template: string,
  vars: { prenom: string; centre: string; offre: string },
) {
  return template
    .replace(/\{prenom\}/gi, vars.prenom)
    .replace(/\{firstName\}/gi, vars.prenom)
    .replace(/\{centre\}/gi, vars.centre)
    .replace(/\{center\}/gi, vars.centre)
    .replace(/\{offre\}/gi, vars.offre)
    .replace(/\{offer\}/gi, vars.offre)
    .trim();
}

export function resolveOfferLabel(
  settings: SeyaAgentSettings,
  campaign?: string | null,
  treatment?: string | null,
) {
  const hay = `${campaign || ""} ${treatment || ""}`;
  const needle = normalizeTreatmentName(hay);
  if (!needle) {
    return "";
  }

  const found = settings.offerMaps.find((item) => {
    const match = normalizeTreatmentName(item.match);
    return match.length > 1 && needle.includes(match);
  });
  return found?.label.trim() || "";
}

export function inboxTag(conversation: SeyaConversation): SeyaInboxTag {
  const status = conversation.status;
  if (status === "Pas intéressé" || status === "Terminé") {
    return "ferme";
  }
  if (status === "RDV pris" || status === "RDV confirmé") {
    return "rdv";
  }
  if (status === "À recontacter") {
    return "humain";
  }
  if (status === "Chaud" || status === "RDV proposé") {
    return "chaud";
  }

  const leadReplied = conversation.messages.some((item) => item.author === "lead");
  if (!leadReplied) {
    return "sans_reponse";
  }

  return conversation.messages.length <= 4 ? "court" : "chaud";
}

export function sortSeyaInbox(conversations: SeyaConversation[]) {
  const rank: Record<SeyaInboxTag, number> = {
    court: 0,
    chaud: 1,
    humain: 2,
    rdv: 3,
    sans_reponse: 4,
    ferme: 5,
  };

  return [...conversations].sort((a, b) => {
    const tagGap = rank[inboxTag(a)] - rank[inboxTag(b)];
    if (tagGap !== 0) {
      return tagGap;
    }
    return a.messages.length - b.messages.length;
  });
}

export function inboxTagLabel(tag: SeyaInboxTag) {
  if (tag === "court") return "En cours";
  if (tag === "chaud") return "Chaud";
  if (tag === "humain") return "À recontacter";
  if (tag === "rdv") return "RDV";
  if (tag === "sans_reponse") return "Sans réponse";
  return "Fermé";
}

export function normalizeSeyaAgentSettings(
  value?: Partial<SeyaAgentSettings> | null,
): SeyaAgentSettings {
  const days = Array.isArray(value?.relanceDays)
    ? value.relanceDays.map(Number).filter((item) => item > 0)
    : defaultSeyaAgentSettings.relanceDays;

  return {
    whatsappAgentEnabled: value?.whatsappAgentEnabled !== false,
    autoMessageOnNewLead: value?.autoMessageOnNewLead !== false,
    qualifyOnSignup: value?.qualifyOnSignup !== false,
    askForAppointment: value?.askForAppointment !== false,
    bookAppointment: value?.bookAppointment === true,
    handoffToHuman: value?.handoffToHuman !== false,
    relanceEnabled: value?.relanceEnabled !== false,
    relanceDays: days.length ? days : [1, 5, 30],
    brief: String(value?.brief || "").trim() || defaultSeyaAgentSettings.brief,
    treatmentBriefs: normalizeTreatmentBriefs(value?.treatmentBriefs),
    offerMaps: normalizeOfferMaps(value?.offerMaps),
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
    const previous = merged.get(normalizeTreatmentName(name));
    merged.set(normalizeTreatmentName(name), {
      name,
      brief: String(item?.brief || "").trim(),
      opening: String(item?.opening || previous?.opening || "").trim(),
    });
  }

  return [...merged.values()];
}

function normalizeOfferMaps(value?: SeyaOfferMap[] | null) {
  const incoming = Array.isArray(value) ? value : defaultSeyaOfferMaps;
  return incoming
    .map((item) => ({
      match: String(item?.match || "").trim(),
      label: String(item?.label || "").trim(),
    }))
    .filter((item) => item.match && item.label);
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
    ...(localSettings ?? {}),
    ...(hasRemote ? (remote as Partial<SeyaAgentSettings>) : {}),
    brief:
      (typeof remote.brief === "string" && remote.brief.trim()) ||
      localSettings?.brief,
    treatmentBriefs: [
      ...(Array.isArray(remote.treatmentBriefs)
        ? (remote.treatmentBriefs as SeyaTreatmentBrief[])
        : []),
      ...(localSettings?.treatmentBriefs ?? []),
    ],
    offerMaps: [
      ...(Array.isArray(remote.offerMaps)
        ? (remote.offerMaps as SeyaOfferMap[])
        : []),
      ...(localSettings?.offerMaps ?? []),
    ],
  });

  writeLocalSeyaSettings(context.centerId, settings);

  const remoteConversations = Array.isArray(remote.conversations)
    ? (remote.conversations as SeyaConversation[])
    : [];
  const conversations = mergeSeyaConversations(
    remoteConversations,
    readLocalSeyaConversations(context.centerId),
  );
  writeLocalSeyaConversations(context.centerId, conversations);

  return {
    centerId: context.centerId,
    centerName: context.centerName,
    settings,
    conversations,
  };
}

export function mergeSeyaConversations(
  ...lists: SeyaConversation[][]
): SeyaConversation[] {
  const merged = new Map<string, SeyaConversation>();

  for (const list of lists) {
    for (const item of list) {
      if (!item?.leadId) {
        continue;
      }
      const current = merged.get(item.leadId);
      if (!current || String(item.updatedAt || "") >= String(current.updatedAt || "")) {
        merged.set(item.leadId, item);
      }
    }
  }

  return [...merged.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 80);
}

export async function saveSeyaConversations(conversations: SeyaConversation[]) {
  const context = await getActiveCenterContext();
  const next = mergeSeyaConversations(conversations);
  writeLocalSeyaConversations(context.centerId, next);

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const currentSettings = asRecord(data?.settings);
  const currentSeya = asRecord(currentSettings.seya);
  const { error } = await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        seya: {
          ...currentSeya,
          conversations: next,
        },
      },
    })
    .eq("id", context.centerId);

  if (error) {
    throw new Error(error.message);
  }

  return next;
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
