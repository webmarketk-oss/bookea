import { getActiveCenterContext } from "@/lib/center-access";
import { normalizeLeadStatus } from "@/lib/lead-statuses";
import { createClient } from "@/lib/supabase";

export type MailingTemplate = {
  builtin?: boolean;
  id: string;
  imageDataUrl?: string;
  message: string;
  name: string;
  subject: string;
};

export type MailContact = {
  email: string;
  firstName: string;
  id: string;
  kind: "client" | "lead";
  lastName: string;
  status: string;
};

export type MailingCampaign = {
  audience: string;
  id: string;
  name: string;
  recipients: number;
  sentAt: string;
  status: "Brouillon" | "Envoyée";
  subject: string;
};

export const builtinMailingTemplates: MailingTemplate[] = [
  {
    id: "exemple-fidelite",
    builtin: true,
    name: "Fidélité",
    subject: "Un soin vous attend cette semaine",
    message:
      "Bonjour {{prenom}},\n\nVotre centre pense à vous. Un créneau est disponible cette semaine pour votre prochain soin.\n\nÀ très vite,",
  },
  {
    id: "exemple-anniversaire",
    builtin: true,
    name: "Anniversaire",
    subject: "Joyeux anniversaire — une attention de votre centre",
    message:
      "Bonjour {{prenom}},\n\nToute l’équipe vous souhaite un très bel anniversaire. Passez nous voir pour profiter d’une attention spéciale.\n\nAvec plaisir,",
  },
  {
    id: "exemple-offre",
    builtin: true,
    name: "Offre du moment",
    subject: "Offre du moment au centre",
    message:
      "Bonjour {{prenom}},\n\nNous avons une offre limitée sur votre soin habituel. Répondez à cet email ou réservez directement en ligne.\n\nBelle journée,",
  },
];

const templatesKey = (centerId: string) => `bookea-mailing-templates:${centerId}`;
const campaignsKey = (centerId: string) => `bookea-mailing-campaigns:${centerId}`;

export function loadMailingTemplates(centerId: string): MailingTemplate[] {
  const saved = readJson<MailingTemplate[]>(templatesKey(centerId), []);
  const savedIds = new Set(saved.map((template) => template.id));

  return [
    ...builtinMailingTemplates.filter((template) => !savedIds.has(template.id)),
    ...saved,
  ];
}

export function saveMailingTemplates(
  centerId: string,
  templates: MailingTemplate[],
) {
  const custom = templates.filter((template) => !template.builtin);
  window.localStorage.setItem(templatesKey(centerId), JSON.stringify(custom));
}

export function loadMailingCampaigns(centerId: string): MailingCampaign[] {
  return readJson<MailingCampaign[]>(campaignsKey(centerId), []);
}

export function saveMailingCampaigns(
  centerId: string,
  campaigns: MailingCampaign[],
) {
  window.localStorage.setItem(
    campaignsKey(centerId),
    JSON.stringify(campaigns.slice(0, 40)),
  );
}

export async function loadMailingWorkspace() {
  const supabase = createClient();
  const center = await getActiveCenterContext(supabase);
  const { data } = await supabase
    .from("centers")
    .select("name, email, settings")
    .eq("id", center.centerId)
    .maybeSingle();

  const remote = mailingFromSettings(data?.settings);
  const templates = mergeTemplates(
    loadMailingTemplates(center.centerId),
    remote.templates,
  );
  const campaigns = mergeCampaigns(
    loadMailingCampaigns(center.centerId),
    remote.campaigns,
  );

  saveMailingTemplates(center.centerId, templates);
  saveMailingCampaigns(center.centerId, campaigns);

  return {
    centerId: center.centerId,
    centerName: data?.name || center.centerName,
    centerEmail: String(data?.email || "").trim(),
    templates,
    campaigns,
    contacts: await loadMailingContactsForCenter(supabase, center.centerId),
  };
}

export async function persistMailingWorkspace(
  centerId: string,
  next: {
    campaigns?: MailingCampaign[];
    templates?: MailingTemplate[];
  },
) {
  if (next.templates) {
    saveMailingTemplates(centerId, next.templates);
  }

  if (next.campaigns) {
    saveMailingCampaigns(centerId, next.campaigns);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();

  const currentSettings =
    data?.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const currentMailing =
    currentSettings.mailing && typeof currentSettings.mailing === "object"
      ? (currentSettings.mailing as Record<string, unknown>)
      : {};

  await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        mailing: {
          ...currentMailing,
          templates: (next.templates ?? loadMailingTemplates(centerId)).filter(
            (template) => !template.builtin,
          ),
          campaigns: (next.campaigns ?? loadMailingCampaigns(centerId)).slice(0, 40),
        },
      },
    })
    .eq("id", centerId);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

type Relation<T> = T | T[] | null;

type MailLeadRow = {
  id: string;
  status: string | null;
  clients: Relation<{
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }>;
};

type MailClientRow = {
  email: string | null;
  first_name: string | null;
  id: string;
  last_name: string | null;
  status: string | null;
};

export async function loadMailingContacts(): Promise<{
  centerId: string;
  contacts: MailContact[];
}> {
  const supabase = createClient();
  const center = await getActiveCenterContext(supabase);

  return {
    centerId: center.centerId,
    contacts: await loadMailingContactsForCenter(supabase, center.centerId),
  };
}

async function loadMailingContactsForCenter(
  supabase: ReturnType<typeof createClient>,
  centerId: string,
) {
  const [leadsResult, clientsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id, status, clients(first_name, last_name, email)")
      .eq("center_id", centerId)
      .limit(800),
    supabase
      .from("clients")
      .select("id, first_name, last_name, email, status")
      .eq("center_id", centerId)
      .limit(800),
  ]);

  const leads = ((leadsResult.data ?? []) as MailLeadRow[]).map((row) => {
    const client = firstRelation(row.clients);

    return {
      id: `lead:${row.id}`,
      kind: "lead" as const,
      firstName: client?.first_name?.trim() || "Prospect",
      lastName: client?.last_name?.trim() || "",
      email: client?.email?.trim() || "",
      status: normalizeLeadStatus(row.status),
    };
  });

  const clients = ((clientsResult.data ?? []) as MailClientRow[])
    .filter((row) => (row.status || "").trim().toLowerCase() !== "prospect")
    .map((row) => ({
      id: `client:${row.id}`,
      kind: "client" as const,
      firstName: row.first_name?.trim() || "Cliente",
      lastName: row.last_name?.trim() || "",
      email: row.email?.trim() || "",
      status: normalizeMailClientStatus(row.status),
    }));

  if (leadsResult.error && clientsResult.error) {
    throw new Error(leadsResult.error.message || clientsResult.error.message);
  }

  return [...leads, ...clients];
}

function mailingFromSettings(settings: unknown) {
  const mailing =
    settings &&
    typeof settings === "object" &&
    "mailing" in settings &&
    settings.mailing &&
    typeof settings.mailing === "object"
      ? (settings.mailing as {
          campaigns?: MailingCampaign[];
          templates?: MailingTemplate[];
        })
      : {};

  return {
    templates: Array.isArray(mailing.templates) ? mailing.templates : [],
    campaigns: Array.isArray(mailing.campaigns) ? mailing.campaigns : [],
  };
}

function mergeTemplates(
  local: MailingTemplate[],
  remote: MailingTemplate[],
) {
  const byId = new Map<string, MailingTemplate>();

  for (const template of [...builtinMailingTemplates, ...remote, ...local]) {
    byId.set(template.id, template);
  }

  return [...byId.values()];
}

function mergeCampaigns(
  local: MailingCampaign[],
  remote: MailingCampaign[],
) {
  return [...local, ...remote]
    .filter(
      (campaign, index, list) =>
        list.findIndex((item) => item.id === campaign.id) === index,
    )
    .slice(0, 40);
}

function normalizeMailClientStatus(value?: string | null) {
  if (value === "in_care") return "Cure en cours";
  if (value === "to_recall") return "À relancer";
  if (value === "inactive") return "Inactif";
  return "Actif";
}

function firstRelation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
