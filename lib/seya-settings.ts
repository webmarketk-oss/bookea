import { getActiveCenterContext } from "@/lib/center-access";
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
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication (pacemaker, grossesse…) : transmets à l’équipe, ne booke pas.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Je peux vous proposer un créneau rapidement, vous êtes plutôt dispo en début ou fin de semaine ?",
  },
  {
    name: "Soin minceur",
    pricing: {
      bilan: "offert",
      discovery: "offerte",
      session: "",
      package: "à partir de 500€, payable jusqu’en 10 fois",
      sessionPolicy: "after_bilan",
    },
    price:
      "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
    brief:
      "Parle comme une réceptionniste. Demande la zone. Ne parle de prix que si on te le demande. Pas de liste de créneaux à la place du tarif.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! C’est plutôt quelle zone ? Je peux ensuite regarder un créneau.",
  },
  {
    name: "Soin visage",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quel est votre objectif peau ? Je peux ensuite regarder un créneau.",
  },
  {
    name: "Cryolipolyse",
    pricing: {
      bilan: "offert",
      discovery: "offerte",
      session: "",
      package: "à partir de 500€, payable jusqu’en 10 fois",
      sessionPolicy: "after_bilan",
    },
    price:
      "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande. Contre-indication : transmets à l’équipe.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quelle zone souhaitez-vous traiter ?"
  },
  {
    name: "Hydrafacial",
    price: "",
    brief:
      "Parle comme une réceptionniste. Ne parle de prix que si on te le demande.",
    opening:
      "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quel est votre objectif peau ?"
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

export const defaultSeyaOfferMaps: SeyaOfferMap[] = [
  {
    match: "offre 99",
    label: "le bilan et la séance découverte offerts",
  },
  {
    match: "cryo 99",
    label: "le bilan et la séance découverte offerts",
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
    "Tu parles comme une réceptionniste, pas comme un robot. Une question à la fois. Tu ne parles jamais de prix, de cure, de 500€ ou de paiement tant que la cliente n’a pas demandé le tarif. Si elle demande le prix, tu donnes le tarif paramétré naturellement. Pacemaker ou grossesse : tu transmets à l’équipe, tu ne bookes pas. Jamais Lead Meta.",
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
  const offer =
    resolveOfferLabel(settings, campaign, treatment) || defaultOfferForFamily(family);
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
  const direct = familyFromTreatment(`${campaign || ""} ${treatment || ""} ${offer}`);
  if (direct) {
    return direct;
  }
  const families = [
    ...new Set(
      settings.offerMaps
        .map((item) => familyFromTreatment(`${item.match} ${item.label}`))
        .filter(Boolean),
    ),
  ];
  return families.length === 1 ? families[0] : "";
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
    return "le minceur";
  }
  if (family === "visage") {
    return "notre soin visage";
  }
  if (family === "epilation") {
    return "l’épilation définitive";
  }
  return "un soin";
}

function greetingName(value?: string | null) {
  const name = String(value || "").trim();
  if (!name || /^(bonjour|hello|hi|bonsoir)$/i.test(name)) {
    return "";
  }
  return name;
}

function looksRoboticOpening(value?: string | null) {
  return /bonjour,?\s+je suis seya/i.test(String(value || ""));
}

function defaultOpeningForFamily(family: string) {
  if (family === "minceur") {
    return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! C’est plutôt quelle zone ? Je peux ensuite regarder un créneau.";
  }
  if (family === "visage") {
    return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Quel est votre objectif peau ?";
  }
  if (family === "epilation") {
    return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande ({offre}) ! Je peux vous proposer un créneau rapidement, vous êtes plutôt dispo en début ou fin de semaine ?";
  }
  return "Bonjour {prenom}, c’est Seya du {centre} :) On vient juste de recevoir votre demande. Je peux vous proposer un créneau rapidement, vous êtes plutôt dispo en début ou fin de semaine ?";
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
    .replace(/Bonjour\s+,/g, "Bonjour,")
    .replace(/\(\s*\)/g, "")
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
  const current = value && typeof value === "object" ? value : {};
  const legacy = String(fallbackPrice || "").trim();
  const allowed = ["fixed", "from", "range", "after_bilan", "callback"] as const;
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
    sessionPolicy: allowed.includes(current.sessionPolicy)
      ? current.sessionPolicy
      : "after_bilan",
  };
}

function normalizeHealthSheet(value?: SeyaHealthSheet | null): SeyaHealthSheet {
  const current = value && typeof value === "object" ? value : {};
  return {
    validated: current.validated === true,
    contraindications: String(current.contraindications || "").trim(),
    precautions: String(current.precautions || "").trim(),
    professionalQuestions: String(current.professionalQuestions || "").trim(),
    transferTo: String(current.transferTo || "").trim(),
  };
}

function normalizeOfferMaps(value?: SeyaOfferMap[] | null) {
  const incoming = Array.isArray(value) ? value : defaultSeyaOfferMaps;
  const merged = new Map<string, SeyaOfferMap>();
  for (const item of incoming) {
    const match = String(item?.match || "").trim();
    const label = String(item?.label || "").trim();
    if (!match || !label) {
      continue;
    }
    merged.set(normalizeTreatmentName(match), { match, label });
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
    ...(localSettings ?? {}),
    ...(hasRemote ? (remote as Partial<SeyaAgentSettings>) : {}),
    brief:
      (typeof remote.brief === "string" && remote.brief.trim()) ||
      localSettings?.brief,
    treatmentBriefs: Array.isArray(remote.treatmentBriefs)
      ? (remote.treatmentBriefs as SeyaTreatmentBrief[])
      : (localSettings?.treatmentBriefs ?? []),
    offerMaps: Array.isArray(remote.offerMaps)
      ? (remote.offerMaps as SeyaOfferMap[])
      : (localSettings?.offerMaps ?? []),
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
