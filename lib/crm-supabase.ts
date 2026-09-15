import { createClient } from "@/lib/supabase";
import type { Lead, LeadActivity, LeadStatus } from "@/types/lead";

type SupabaseClient = ReturnType<typeof createClient>;

type CrmCenterContext = {
  centerId: string;
  centerName: string;
};

type LeadSource = Lead["source"];

type LeadRow = {
  id: string;
  center_id: string;
  client_id: string | null;
  source_id: string | null;
  campaign_id: string | null;
  service_id: string | null;
  status: string;
  recall_date: string | null;
  next_action: string | null;
  latest_comment: string | null;
  amount_cure_ttc: number | string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  clients: Relation<{
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  }>;
  lead_sources: Relation<{ name: string | null; slug: string | null }>;
  campaigns: Relation<{ name: string | null }>;
  services: Relation<{ name: string | null }>;
  profiles: Relation<{ full_name: string | null }>;
  lead_events:
    | Array<{
        id: string;
        event_type: string;
        from_value: string | null;
        to_value: string | null;
        note: string | null;
        created_at: string;
        profiles: Relation<{ full_name: string | null }>;
      }>
    | null;
};

type Relation<T> = T | T[] | null;

export type NewCrmLeadInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  treatment: string;
  source: LeadSource;
  campaign: string;
  commercial?: string;
  status: LeadStatus;
  dealAmount: number;
  nextAction: string;
  reminderDate?: string;
};

const sourceFallback: LeadSource = "Organique";

export async function loadCrmLeads() {
  const supabase = createClient();
  const context = await getCrmCenterContext(supabase);

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
        id,
        center_id,
        client_id,
        source_id,
        campaign_id,
        service_id,
        status,
        recall_date,
        next_action,
        latest_comment,
        amount_cure_ttc,
        created_at,
        updated_at,
        last_activity_at,
        clients(first_name,last_name,phone,email),
        lead_sources(name,slug),
        campaigns(name),
        services(name),
        profiles(full_name),
        lead_events(
          id,
          event_type,
          from_value,
          to_value,
          note,
          created_at,
          profiles(full_name)
        )
      `,
    )
    .eq("center_id", context.centerId)
    .order("last_activity_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return {
    center: context,
    leads: ((data ?? []) as unknown as LeadRow[]).map(toLead),
  };
}

export async function createCrmLead(input: NewCrmLeadInput) {
  const supabase = createClient();
  const context = await getCrmCenterContext(supabase);

  const [sourceId, campaignId, serviceId] = await Promise.all([
    ensureLeadSource(supabase, context.centerId, input.source),
    ensureCampaign(supabase, context.centerId, input.campaign),
    ensureService(supabase, context.centerId, input.treatment),
  ]);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      center_id: context.centerId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      source_id: sourceId,
      campaign_id: campaignId,
      status: "prospect",
    })
    .select("id")
    .single();

  if (clientError) {
    throw new Error(clientError.message);
  }

  const now = new Date().toISOString();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      center_id: context.centerId,
      client_id: client.id,
      source_id: sourceId,
      campaign_id: campaignId,
      service_id: serviceId,
      status: input.status,
      recall_date: input.reminderDate || null,
      next_action: input.nextAction.trim() || "À contacter",
      latest_comment: `Lead créé avec le statut ${input.status}.`,
      amount_cure_ttc: input.dealAmount || 0,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
    })
    .select("id")
    .single();

  if (leadError) {
    throw new Error(leadError.message);
  }

  await insertLeadEvent(supabase, context.centerId, lead.id, {
    event_type: "system",
    note: `Lead créé avec le statut ${input.status}.`,
  });

  const { leads } = await loadCrmLeads();
  const createdLead = leads.find((item) => item.id === lead.id);

  if (!createdLead) {
    throw new Error("Le prospect a été créé, mais la fiche n'a pas pu être relue.");
  }

  return createdLead;
}

export async function updateCrmLeadStatus(
  lead: Lead,
  status: LeadStatus,
) {
  const supabase = createClient();
  await updateLeadFields(supabase, lead.id, {
    status,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });

  await insertLeadEvent(supabase, await getLeadCenterId(supabase, lead.id), lead.id, {
    event_type: "status",
    from_value: lead.status,
    to_value: status,
    note: `Statut changé : ${lead.status} → ${status}.`,
  });
}

export async function addCrmLeadActivity(leadId: string, text: string) {
  const supabase = createClient();
  const centerId = await getLeadCenterId(supabase, leadId);

  await updateLeadFields(supabase, leadId, {
    latest_comment: text,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });

  await insertLeadEvent(supabase, centerId, leadId, {
    event_type: "comment",
    note: text,
  });
}

export async function deleteCrmLeadActivity(activityId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("lead_events").delete().eq("id", activityId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateCrmLeadAmount(leadId: string, amount: number) {
  await updateLeadFields(createClient(), leadId, {
    amount_cure_ttc: amount,
    updated_at: new Date().toISOString(),
  });
}

export async function updateCrmLeadReminder(leadId: string, reminderDate: string) {
  await updateLeadFields(createClient(), leadId, {
    recall_date: reminderDate || null,
    updated_at: new Date().toISOString(),
  });
}

export async function updateCrmLeadNextAction(leadId: string, nextAction: string) {
  await updateLeadFields(createClient(), leadId, {
    next_action: nextAction.trim() || "À contacter",
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });
}

async function getCrmCenterContext(supabase: SupabaseClient): Promise<CrmCenterContext> {
  const { data: member, error: memberError } = await supabase
    .from("center_members")
    .select("center_id, centers(name)")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(memberError.message);
  }

  if (member?.center_id) {
    return {
      centerId: member.center_id,
      centerName: relationObject(member.centers)?.name ?? "Centre Bookea",
    };
  }

  const slug = process.env.NEXT_PUBLIC_DEFAULT_CENTER_SLUG ?? "jfg-clinique-clermont";
  const { data: center, error: centerError } = await supabase
    .from("centers")
    .select("id,name")
    .eq("slug", slug)
    .maybeSingle();

  if (centerError) {
    throw new Error(centerError.message);
  }

  if (!center) {
    throw new Error("Aucun centre CRM accessible pour ce compte.");
  }

  return {
    centerId: center.id,
    centerName: center.name ?? "Centre Bookea",
  };
}

async function getLeadCenterId(supabase: SupabaseClient, leadId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("center_id")
    .eq("id", leadId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.center_id as string;
}

async function updateLeadFields(
  supabase: SupabaseClient,
  leadId: string,
  fields: Record<string, unknown>,
) {
  const { error } = await supabase.from("leads").update(fields).eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }
}

async function insertLeadEvent(
  supabase: SupabaseClient,
  centerId: string,
  leadId: string,
  event: {
    event_type: string;
    from_value?: string | null;
    to_value?: string | null;
    note?: string | null;
  },
) {
  const { error } = await supabase.from("lead_events").insert({
    center_id: centerId,
    lead_id: leadId,
    event_type: event.event_type,
    from_value: event.from_value ?? null,
    to_value: event.to_value ?? null,
    note: event.note ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureLeadSource(
  supabase: SupabaseClient,
  centerId: string,
  name: string,
) {
  const slug = slugify(name);
  const { data: existing, error: existingError } = await supabase
    .from("lead_sources")
    .select("id")
    .eq("center_id", centerId)
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("lead_sources")
    .insert({
      center_id: centerId,
      name,
      slug,
      is_organic: slug === "organique",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

async function ensureCampaign(
  supabase: SupabaseClient,
  centerId: string,
  name: string,
) {
  const normalizedName = name.trim() || "CRM manuel";
  const { data: existing, error: existingError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", normalizedName)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      center_id: centerId,
      name: normalizedName,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

async function ensureService(
  supabase: SupabaseClient,
  centerId: string,
  name: string,
) {
  const normalizedName = name.trim() || "Soin à préciser";
  const { data: existing, error: existingError } = await supabase
    .from("services")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", normalizedName)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      center_id: centerId,
      name: normalizedName,
      duration_minutes: 60,
      price_ttc: 0,
      is_public: false,
      requires_room: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

function toLead(row: LeadRow): Lead {
  const client = relationObject(row.clients);
  const leadSource = relationObject(row.lead_sources);
  const campaign = relationObject(row.campaigns);
  const service = relationObject(row.services);
  const assignee = relationObject(row.profiles);
  const source = normalizeSource(leadSource?.name);
  const createdDate = row.created_at.slice(0, 10);
  const events = row.lead_events ?? [];
  const activityLog: LeadActivity[] = events
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((event) => ({
      id: event.id,
      author:
        relationObject(event.profiles)?.full_name ??
        authorFromEvent(event.event_type),
      date: formatLeadDateTime(event.created_at),
      text: event.note ?? event.to_value ?? "Activité CRM",
      type: normalizeEventType(event.event_type),
    }));

  if (activityLog.length === 0) {
    activityLog.push({
      id: `${row.id}-created`,
      author: "Système",
      date: formatLeadDateTime(row.created_at),
      text: `Lead reçu via ${source}.`,
      type: "system",
    });
  }

  return {
    id: row.id,
    firstName: client?.first_name || "Prospect",
    lastName: client?.last_name || "",
    phone: client?.phone || "",
    email: client?.email || "",
    treatment: service?.name || "Soin à préciser",
    source,
    campaign: campaign?.name || "CRM manuel",
    status: normalizeLeadStatus(row.status),
    dealAmount: Number(row.amount_cure_ttc ?? 0),
    commercial: assignee?.full_name || "Équipe",
    createdAt: formatLeadDateTime(row.created_at),
    createdDate,
    updatedDate: row.updated_at?.slice(0, 10),
    nextAction: row.next_action || "À contacter",
    reminderDate: row.recall_date ?? undefined,
    activityLog,
  };
}

function normalizeLeadStatus(value?: string | null): LeadStatus {
  const fallback: LeadStatus = "Nouveau";
  return (value || fallback) as LeadStatus;
}

function normalizeSource(value?: string | null): LeadSource {
  const source = (value || "").toLowerCase();

  if (source.includes("facebook")) return "Facebook";
  if (source.includes("instagram")) return "Instagram";
  if (source.includes("google")) return "Google";
  if (source.includes("site")) return "Site Web";
  if (source.includes("organique")) return "Organique";

  return sourceFallback;
}

function normalizeEventType(value: string): LeadActivity["type"] {
  if (value === "comment") return "comment";
  if (value === "status") return "status";
  return "system";
}

function authorFromEvent(value: string) {
  if (value === "comment") return "Équipe";
  if (value === "status") return "Système";
  return "Système";
}

function formatLeadDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "crm";
}

function relationObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
