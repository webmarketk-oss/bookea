import { naturalOfferPhrase } from "@/api/seya/care-family";
import { getActiveCenterContext } from "@/lib/center-access";
import { sanitizePersonName } from "@/lib/seya-person-name";
import { createClient } from "@/lib/supabase";

export const SEYA_SETTINGS_UPDATED_EVENT = "bookea-seya-settings-updated";
export const SEYA_CONVERSATIONS_UPDATED_EVENT =
  "bookea-seya-conversations-updated";

export type SeyaHealthSheet = {
  validated: boolean;
  contraindications: string;
  precautions: string;
  professionalQuestions: string;
  transferTo: string;
};

export type SeyaPricePolicy = {
  bilan: string;
  discovery: string;
  session: string;
  package: string;
  sessionPolicy: "fixed" | "from" | "range" | "after_bilan" | "callback";
};

export type SeyaTreatmentBrief = {
  name: string;
  brief: string;
  opening?: string;
  price?: string;
  pricing?: SeyaPricePolicy;
  health?: SeyaHealthSheet;
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
  | "Revue santé"
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

export type SeyaBookingState = {
  centerId: string | null;
  serviceIntent: string;
  requestedDate: string | null;
  requestedWeekday: number | null;
  rejectedDates: string[];
  rejectedWeekdays: number[];
  lastOfferedSlots: SeyaProposedSlot[];
  pendingQuestion: string | null;
  appointmentStatus: "none" | "proposed" | "confirmed";
  priceAskCount: number;
  lastPriceIntent?: string | null;
  unansweredPriceIntent?: string | null;
  lastLeadPriceText?: string;
};

export type SeyaHealthReview = {
  status: "none" | "awaiting_human_health_review" | "reviewed";
  kind: "general" | "personal" | "mixed" | null;
  note: string;
  transferTo: string;
  treatmentName: string;
  createdAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type SeyaHealthTask = {
  id: string;
  title: string;
  context: string;
  transferTo: string;
  status: "open" | "done";
  createdAt: string;
  kind?: string;
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
  centerId?: string;
  bookingState?: SeyaBookingState;
  healthReview?: SeyaHealthReview;
  healthTask?: SeyaHealthTask;
  messages: SeyaAgentMessage[];
  updatedAt: string;
  lastRelanceAt?: string | null;
  relanceCount?: number;
  sendError?: string | null;
  sentVia?: string | null;
};

export const defaultTreatmentBriefs: SeyaTreatmentBrief[] = [
  {
    name: "Épilation définitive",
    price: "",
    brief:
      "Tu accueilles pour l’épilation, comme au standard. Prix seulement si on te le demande. Pacemaker, grossesse ou doute santé : tu transmets à l’équipe, tu ne poses pas de rendez-vous.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Je peux regarder un créneau avec vous, si vous le souhaitez.",
  },
  {
    name: "Soin minceur",
    pricing: {
      bilan: "",
      discovery: "",
      session: "",
      package: "",
      sessionPolicy: "after_bilan",
    },
    price: "",
    brief:
      "Tu commences par la zone, comme tu le ferais au téléphone. Prix seulement si on te le demande. Si on te demande le tarif, tu le dis en une ou deux phrases, tu n’enchaînes pas avec des créneaux.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Sur quelle zone souhaitez-vous que l’on regarde ?",
  },
  {
    name: "Soin visage",
    price: "",
    brief:
      "Tu t’intéresses à l’objectif pour la peau. Prix seulement si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?",
  },
  {
    name: "Cryolipolyse",
    pricing: {
      bilan: "",
      discovery: "",
      session: "",
      package: "",
      sessionPolicy: "after_bilan",
    },
    price: "",
    brief:
      "Tu demandes la zone, simplement. Prix seulement si on te le demande. Doute santé : tu transmets à l’équipe.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quelle zone souhaitez-vous traiter ?",
  },
  {
    name: "Hydrafacial",
    price: "",
    brief:
      "Tu t’intéresses à l’objectif pour la peau. Prix seulement si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?",
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
    name: "Épilation définitive",
  },
  {
    keys: [
      "minceur",
      "cryo",
      "cryolipolyse",
      "cellulite",
      "ventre",
      "poids",
      "graisse",
      "bilan",
      "decouverte",
    ],
    name: "Soin minceur",
  },
  {
    keys: ["visage", "hydrafacial", "peau", "glow", "acne", "acné"],
    name: "Soin visage",
  },
];

export const defaultSeyaOfferMaps: SeyaOfferMap[] = [];

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
    "Tu es Seya, au standard du centre. Tu vouvoies. Tu parles comme au téléphone : simple, posée, sans script. Tu réponds d’abord à ce qu’on vient de te dire, une chose à la fois, tu n’enchaînes pas sur le planning si on ne te le demande pas. Prix, cure ou paiement : seulement si on te le demande, et alors tu dis le tarif paramétré en une ou deux phrases. Pacemaker, grossesse ou doute santé : tu transmets à l’équipe, tu ne poses pas de rendez-vous. Jamais « Lead Meta ».",
  treatmentBriefs: defaultTreatmentBriefs,
  offerMaps: defaultSeyaOfferMaps,
};

export function isJunkTreatmentName(value?: string | null) {
  const needle = normalizeTreatmentName(value || "");
  return (
    !needle ||
    /lead meta|meta lead|webhook|soin a preciser|a preciser/.test(needle) ||
    /^offre\s*\d+$/.test(needle)
  );
}

export function isSeyaOptOut(text: string) {
  const raw = String(text || "").trim();
  const needle = normalizeTreatmentName(raw).replace(/[!?.]+$/g, "");
  if (/^(stop|stoppez|arrete|arretez|stop svp)$/.test(needle)) {
    return true;
  }
  if (/pas int[eé]ress/.test(raw)) {
    return true;
  }
  if (/ne (me )?(plus )?(e[cç]rire|contacter|d[eé]ranger|appeler)/i.test(raw)) {
    return true;
  }
  return /^(non merci|plus jamais)$/i.test(raw);
}

export function asksSeyaPrice(text: string) {
  return /prix|tarif|combien|co[uû]te|\bcout\b/i.test(String(text || ""));
}

export function resolveTreatmentPrice(
  settings: SeyaAgentSettings,
  treatment?: string | null,
) {
  const brief = findTreatmentBrief(settings, treatment);
  return String(brief?.price || "").trim();
}

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
  const family = inferFamilyFromSettings(settings, campaign, treatment);
  const offer = naturalOfferPhrase(
    family,
    resolveOfferLabel(settings, campaign, treatment) || campaign || treatment,
  );
  const brief =
    findTreatmentBrief(settings, hay) ||
    findTreatmentBrief(
      settings,
      family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : "",
    );
  const stored = brief?.opening?.trim() || "";
  const template = looksRoboticOpening(stored)
    ? defaultOpeningForFamily(family)
    : stored || defaultOpeningForFamily(family);
  const center = String(centerName || "").trim() || "le centre";
  return fillSeyaTemplate(template, {
    prenom: greetingName(firstName),
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

export function inferFamilyFromSettings(
  settings: SeyaAgentSettings,
  campaign?: string | null,
  treatment?: string | null,
) {
  const offer = resolveOfferLabel(settings, campaign, treatment);
  return familyFromTreatment(`${campaign || ""} ${treatment || ""} ${offer}`);
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

function defaultOfferForFamily(family: string, rawOffer?: string | null) {
  return naturalOfferPhrase(family, rawOffer);
}

function greetingName(value?: string | null) {
  const name = String(value || "").trim();
  if (!name || /^(bonjour|hello|hi|bonsoir)$/i.test(name)) {
    return "";
  }
  return name;
}

function looksRoboticOpening(value?: string | null) {
  const text = String(value || "");
  return (
    /bonjour,?\s+je suis seya/i.test(text) ||
    /votre demande\s*\(/i.test(text) ||
    /le minceur/i.test(text)
  );
}

function defaultOpeningForFamily(family: string) {
  if (family === "minceur") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Sur quelle zone souhaitez-vous que l’on regarde ?";
  }
  if (family === "visage") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Quel est votre objectif pour la peau ?";
  }
  if (family === "epilation") {
    return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}. Je peux regarder un créneau avec vous, si vous le souhaitez.";
  }
  return "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande. Je peux regarder un créneau avec vous, si vous le souhaitez.";
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
    .replace(/\{offre\}/gi, vars.offre || "")
    .replace(/\{offer\}/gi, vars.offre || "")
    .replace(/Bonjour\s+,/g, "Bonjour,")
    .replace(/\(\s*\)/g, "")
    .replace(/ pour \./g, ".")
    .replace(/demande pour\s+\./gi, "demande.")
    .replace(/  +/g, " ")
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
  if (status === "À recontacter" || status === "Revue santé") {
    return "humain";
  }
  if (status === "Chaud" || status === "RDV proposé") {
    return "chaud";
  }

  const leadReplied = (conversation.messages || []).some((item) => item.author === "lead");
  if (!leadReplied) {
    return "sans_reponse";
  }

  return (conversation.messages || []).length <= 4 ? "court" : "chaud";
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

export function markSeyaHealthReviewed(
  conversation: SeyaConversation,
  reviewedBy = "équipe du centre",
): SeyaConversation {
  const current = conversation.healthReview;
  return {
    ...conversation,
    status: conversation.qualification?.need ? "Qualifié" : "En cours",
    healthReview: {
      status: "reviewed",
      kind: current?.kind || "personal",
      note: current?.note || "",
      transferTo: current?.transferTo || "",
      treatmentName: current?.treatmentName || conversation.treatment || "",
      createdAt: current?.createdAt || null,
      reviewedAt: new Date().toISOString(),
      reviewedBy,
    },
    healthTask: conversation.healthTask
      ? { ...conversation.healthTask, status: "done" }
      : conversation.healthTask,
    messages: [
      ...conversation.messages,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: "centre",
        text: "Vérification santé faite. Seya peut reprendre la conversation.",
        at: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function inboxTagLabel(tag: SeyaInboxTag) {
  if (tag === "court") return "En cours";
  if (tag === "chaud") return "Chaud";
  if (tag === "humain") return "À recontacter";
  if (tag === "rdv") return "RDV";
  if (tag === "sans_reponse") return "Sans réponse";
  return "Fermé";
}

const LEGACY_GENERAL_BRIEF =
  "Tu parles comme une réceptionniste, pas comme un robot. Une question à la fois. Tu ne parles jamais de prix, de cure, de 500€ ou de paiement tant que la cliente n’a pas demandé le tarif. Si elle demande le prix, tu donnes le tarif paramétré naturellement. Pacemaker ou grossesse : tu transmets à l’équipe, tu ne bookes pas. Jamais Lead Meta.";

const LEGACY_TREATMENT_BRIEFS = new Set([
  "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication (pacemaker, grossesse…) : transmets à l’équipe, ne booke pas.",
  "Parle comme une réceptionniste. Demande la zone. Ne parle de prix que si on te le demande. Pas de liste de créneaux à la place du tarif.",
  "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
  "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication : transmets à l’équipe.",
]);

function normalizeGeneralBrief(value?: string | null) {
  const current = String(value || "").trim();
  if (!current || current === LEGACY_GENERAL_BRIEF) {
    return defaultSeyaAgentSettings.brief;
  }
  return current;
}

function refreshLegacyTreatmentBrief(name: string, brief: string) {
  if (!LEGACY_TREATMENT_BRIEFS.has(brief)) {
    return brief;
  }
  const fresh = defaultTreatmentBriefs.find(
    (item) => normalizeTreatmentName(item.name) === normalizeTreatmentName(name),
  );
  return fresh?.brief || brief;
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
    brief: normalizeGeneralBrief(value?.brief),
    treatmentBriefs: normalizeTreatmentBriefs(value?.treatmentBriefs),
    offerMaps: normalizeOfferMaps(value?.offerMaps),
  };
}

function normalizeTreatmentBriefs(value?: SeyaTreatmentBrief[] | null) {
  const incoming = Array.isArray(value) ? value : defaultTreatmentBriefs;
  const merged = new Map<string, SeyaTreatmentBrief>();

  for (const item of incoming) {
    const name = String(item?.name || "").trim();
    if (!name) {
      continue;
    }
    const previous = merged.get(normalizeTreatmentName(name));
    merged.set(normalizeTreatmentName(name), {
      name,
      brief: refreshLegacyTreatmentBrief(name, String(item?.brief || "").trim()),
      opening: String(item?.opening || previous?.opening || "").trim(),
      price: String(item?.price || previous?.price || "").trim(),
      pricing: normalizePricePolicy(item?.pricing || previous?.pricing, item?.price || previous?.price),
      health: normalizeHealthSheet(item?.health || previous?.health),
    });
  }

  return [...merged.values()];
}

function normalizePricePolicy(
  value?: SeyaPricePolicy | null,
  fallbackPrice?: string,
): SeyaPricePolicy {
  const current: Partial<SeyaPricePolicy> =
    value && typeof value === "object" ? value : {};
  const legacy = String(fallbackPrice || "").trim();
  const allowed = ["fixed", "from", "range", "after_bilan", "callback"] as const;
  const sessionPolicy = current.sessionPolicy;
  return {
    bilan: String(current.bilan || (/bilan/i.test(legacy) && /gratuit|offert/i.test(legacy) ? "offert" : "")).trim(),
    discovery: String(
      current.discovery ||
        (/découverte|decouverte/i.test(legacy) && /gratuit|offert/i.test(legacy)
          ? "offerte"
          : ""),
    ).trim(),
    session: String(current.session || "").trim(),
    package: String(
      current.package || (/500/.test(legacy) ? "à partir de 500€, payable jusqu’en 10 fois" : ""),
    ).trim(),
    sessionPolicy:
      sessionPolicy && allowed.includes(sessionPolicy)
        ? sessionPolicy
        : "after_bilan",
  };
}

function normalizeHealthSheet(value?: SeyaHealthSheet | null): SeyaHealthSheet {
  const current: Partial<SeyaHealthSheet> =
    value && typeof value === "object" ? value : {};
  return {
    validated: current.validated === true,
    contraindications: String(current.contraindications || "").trim(),
    precautions: String(current.precautions || "").trim(),
    professionalQuestions: String(current.professionalQuestions || "").trim(),
    transferTo: String(current.transferTo || "").trim(),
  };
}

function normalizeOfferMaps(value?: SeyaOfferMap[] | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  const merged = new Map<string, SeyaOfferMap>();
  const emptyRows: SeyaOfferMap[] = [];
  for (const item of value) {
    const match = String(item?.match || "").trim();
    const label = String(item?.label || "").trim();
    if (!match) {
      emptyRows.push({ match: "", label });
      continue;
    }
    merged.set(normalizeTreatmentName(match), { match, label });
  }
  return [...merged.values(), ...emptyRows];
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

  try {
    window.localStorage.setItem(
      seyaSettingsStorageKey(centerId),
      JSON.stringify(normalizeSeyaAgentSettings(settings)),
    );
    window.dispatchEvent(new Event(SEYA_SETTINGS_UPDATED_EVENT));
  } catch (error) {
    console.error("[seya] local settings cache skipped", error);
  }
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

  try {
    window.localStorage.setItem(
      seyaConversationsStorageKey(centerId),
      JSON.stringify(conversations),
    );
    window.dispatchEvent(new Event(SEYA_CONVERSATIONS_UPDATED_EVENT));
  } catch (error) {
    console.error("[seya] local conversations too large, skipped cache", error);
  }
}

export function bindSeyaSettingsToCenter(
  remote?: Partial<SeyaAgentSettings> | null,
  local?: Partial<SeyaAgentSettings> | null,
): SeyaAgentSettings {
  if (remote != null) {
    return normalizeSeyaAgentSettings({
      ...remote,
      treatmentBriefs: Array.isArray(remote.treatmentBriefs)
        ? remote.treatmentBriefs
        : [],
      offerMaps: Array.isArray(remote.offerMaps) ? remote.offerMaps : [],
    });
  }
  return normalizeSeyaAgentSettings(local ?? {});
}

function assertExpectedCenter(expectedCenterId: string | undefined, actualCenterId: string) {
  if (expectedCenterId && expectedCenterId !== actualCenterId) {
    throw new Error("Centre actif différent : réglages non enregistrés.");
  }
}

export async function loadSeyaAgentSettings() {
  const context = await getActiveCenterContext();
  const localSettings = readLocalSeyaSettings(context.centerId);
  const localConversations = readLocalSeyaConversations(context.centerId);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  if (error) {
    return {
      centerId: context.centerId,
      centerName: context.centerName,
      settings: normalizeSeyaAgentSettings(localSettings ?? {}),
      conversations: localConversations,
    };
  }

  const remote = asRecord(asRecord(data?.settings).seya);
  const hasRemote = Boolean(asRecord(data?.settings).seya);
  const settings = bindSeyaSettingsToCenter(
    hasRemote ? (remote as Partial<SeyaAgentSettings>) : null,
    localSettings,
  );

  writeLocalSeyaSettings(context.centerId, settings);

  const remoteConversations = Array.isArray(remote.conversations)
    ? (remote.conversations as SeyaConversation[])
    : [];
  const conversations = conversationsForCenter(
    mergeSeyaConversations(
      remoteConversations,
      readLocalSeyaConversations(context.centerId),
    ),
    context.centerId,
  );
  writeLocalSeyaConversations(context.centerId, conversations);

  return {
    centerId: context.centerId,
    centerName: context.centerName,
    settings,
    conversations,
  };
}

function conversationsForCenter(
  conversations: SeyaConversation[],
  centerId: string,
) {
  return conversations.filter(
    (item) => !item.centerId || item.centerId === centerId,
  );
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
        const person = sanitizePersonName(item.firstName, item.lastName);
        const { _seya, ...rest } = item as SeyaConversation & { _seya?: unknown };
        merged.set(item.leadId, {
          ...rest,
          firstName: person.firstName,
          lastName: person.lastName,
        });
      }
    }
  }

  return [...merged.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 80);
}

export async function saveSeyaConversations(
  conversations: SeyaConversation[],
  expectedCenterId?: string,
) {
  const context = await getActiveCenterContext();
  assertExpectedCenter(expectedCenterId, context.centerId);
  const next = conversationsForCenter(
    mergeSeyaConversations(conversations),
    context.centerId,
  );
  writeLocalSeyaConversations(context.centerId, next);

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const currentSettings = asRecord(data?.settings);
  const currentSeya = asRecord(currentSettings.seya);
  const remoteConversations = Array.isArray(currentSeya.conversations)
    ? (currentSeya.conversations as SeyaConversation[])
    : [];
  if (next.length === 0 && remoteConversations.length > 0) {
    return mergeSeyaConversations(remoteConversations);
  }
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

export async function saveSeyaAgentSettings(
  settings: SeyaAgentSettings,
  expectedCenterId?: string,
) {
  const context = await getActiveCenterContext();
  assertExpectedCenter(expectedCenterId, context.centerId);
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
          conversations: currentSeya.conversations,
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
