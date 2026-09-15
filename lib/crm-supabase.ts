import { createClient } from "@/lib/supabase";
import type { Lead, LeadActivity, LeadStatus } from "@/types/lead";

type SupabaseClient = ReturnType<typeof createClient>;

type CrmCenterContext = {
  centerId: string;
  centerName: string;
};

type LeadSource = Lead["source"];

const clientLeadStatuses: LeadStatus[] = ["Vendu", "Client", "Client converti"];

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

export type CrmClientStatus = "Actif" | "Cure en cours" | "À relancer" | "Inactif";

export type CrmClientNote = {
  id: string;
  author: string;
  date: string;
  text: string;
  visibility?: "private" | "shared";
};

export type CrmClientCare = {
  id: string;
  label: string;
  date: string;
  amount: number;
  paid: number;
  status: "Payé" | "Acompte" | "À encaisser";
};

export type CrmClientDocument = {
  id: string;
  label: string;
  date: string;
  status: "À signer" | "Signé" | "À envoyer" | "Validé";
  type: "Consentement" | "Devis" | "Facture" | "Fiche cure";
};

export type CrmClient = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  postalCode: string;
  city: string;
  mainCare: string;
  category: string;
  source: string;
  campaign: string;
  status: CrmClientStatus;
  commercial: string;
  nextAppointment: string;
  lastVisit: string;
  totalSpent: number;
  balanceDue: number;
  notes: CrmClientNote[];
  cares: CrmClientCare[];
  documents: CrmClientDocument[];
};

type ClientRow = {
  id: string;
  center_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  gender: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  private_note: string | null;
  shared_note: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  lead_sources: Relation<{ name: string | null }>;
  campaigns: Relation<{ name: string | null }>;
  leads:
    | Array<{
        id: string;
        status: string | null;
        amount_cure_ttc: number | string | null;
        created_at: string;
        services: Relation<{ name: string | null }>;
      }>
    | null;
  appointments:
    | Array<{
        id: string;
        appointment_date: string;
        starts_at: string;
        duration_minutes: number;
        status: string;
        services: Relation<{ name: string | null }>;
        practitioners: Relation<{ name: string | null }>;
        rooms: Relation<{ name: string | null }>;
      }>
    | null;
  invoices:
    | Array<{
        id: string;
        type: string;
        status: string;
        total_ttc: number | string | null;
        paid_amount: number | string | null;
        balance_due: number | string | null;
        issued_on: string;
      }>
    | null;
  documents:
    | Array<{
        id: string;
        folder_name: string | null;
        name: string;
        status: string;
        file_type: string | null;
        created_at: string;
      }>
    | null;
};

export type CrmClientInput = Omit<
  CrmClient,
  "id" | "notes" | "cares" | "documents"
>;

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
  const centerId = await getLeadCenterId(supabase, lead.id);

  await updateLeadFields(supabase, lead.id, {
    status,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });

  await insertLeadEvent(supabase, centerId, lead.id, {
    event_type: "status",
    from_value: lead.status,
    to_value: status,
    note: `Statut changé : ${lead.status} → ${status}.`,
  });

  if (clientLeadStatuses.includes(status)) {
    await ensureClientForConvertedLead(supabase, centerId, lead.id, lead);
  }
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

export async function loadCrmClients() {
  const supabase = createClient();
  const context = await getCrmCenterContext(supabase);

  const { data, error } = await supabase
    .from("clients")
    .select(
      `
        id,
        center_id,
        first_name,
        last_name,
        email,
        phone,
        birthdate,
        gender,
        address_line1,
        postal_code,
        city,
        private_note,
        shared_note,
        status,
        created_at,
        updated_at,
        lead_sources(name),
        campaigns(name),
        leads(id,status,amount_cure_ttc,created_at,services(name)),
        appointments(
          id,
          appointment_date,
          starts_at,
          duration_minutes,
          status,
          services(name),
          practitioners(name),
          rooms(name)
        ),
        invoices(id,type,status,total_ttc,paid_amount,balance_due,issued_on),
        documents(id,folder_name,name,status,file_type,created_at)
      `,
    )
    .eq("center_id", context.centerId)
    .is("merged_into_client_id", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return {
    center: context,
    clients: ((data ?? []) as unknown as ClientRow[]).map(toCrmClient),
  };
}

export async function createCrmClient(input: CrmClientInput) {
  const supabase = createClient();
  const context = await getCrmCenterContext(supabase);
  const [sourceId, campaignId] = await Promise.all([
    input.source ? ensureLeadSource(supabase, context.centerId, input.source) : null,
    input.campaign ? ensureCampaign(supabase, context.centerId, input.campaign) : null,
  ]);

  const { data, error } = await supabase
    .from("clients")
    .insert(toClientFields(context.centerId, input, sourceId, campaignId))
    .select(
      `
        id,
        center_id,
        first_name,
        last_name,
        email,
        phone,
        birthdate,
        gender,
        address_line1,
        postal_code,
        city,
        private_note,
        shared_note,
        status,
        created_at,
        updated_at,
        lead_sources(name),
        campaigns(name),
        leads(id,status,amount_cure_ttc,created_at,services(name)),
        appointments(id,appointment_date,starts_at,duration_minutes,status,services(name),practitioners(name),rooms(name)),
        invoices(id,type,status,total_ttc,paid_amount,balance_due,issued_on),
        documents(id,folder_name,name,status,file_type,created_at)
      `,
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toCrmClient(data as unknown as ClientRow);
}

export async function updateCrmClient(input: CrmClient) {
  const supabase = createClient();
  const centerId = await getClientCenterId(supabase, input.id);
  const [sourceId, campaignId] = await Promise.all([
    input.source ? ensureLeadSource(supabase, centerId, input.source) : null,
    input.campaign ? ensureCampaign(supabase, centerId, input.campaign) : null,
  ]);

  const { error } = await supabase
    .from("clients")
    .update(toClientFields(centerId, input, sourceId, campaignId))
    .eq("id", input.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function addCrmClientNote(
  client: CrmClient,
  text: string,
  visibility: "private" | "shared",
) {
  const supabase = createClient();
  const currentNotes = client.notes
    .filter((note) => note.visibility === visibility)
    .map((note) => `${note.date} - ${note.text}`);
  const nextValue = [`${formatActivityDateForStorage()} - ${text.trim()}`, ...currentNotes]
    .filter(Boolean)
    .join("\n");
  const field = visibility === "shared" ? "shared_note" : "private_note";

  const { error } = await supabase
    .from("clients")
    .update({
      [field]: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", client.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function addCrmClientDocument(
  clientId: string,
  document: Omit<CrmClientDocument, "id">,
) {
  const supabase = createClient();
  const centerId = await getClientCenterId(supabase, clientId);
  const { data, error } = await supabase
    .from("documents")
    .insert({
      center_id: centerId,
      client_id: clientId,
      folder_name: document.type,
      name: document.label.trim(),
      file_type: document.type,
      status: toDocumentStatusValue(document.status),
      updated_at: new Date().toISOString(),
    })
    .select("id,folder_name,name,status,file_type,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toClientDocument(data);
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

async function getClientCenterId(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("center_id")
    .eq("id", clientId)
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

async function ensureClientForConvertedLead(
  supabase: SupabaseClient,
  centerId: string,
  leadId: string,
  lead: Lead,
) {
  const { data: currentLead, error: leadError } = await supabase
    .from("leads")
    .select("client_id,source_id,campaign_id,service_id")
    .eq("id", leadId)
    .single();

  if (leadError) {
    throw new Error(leadError.message);
  }

  const matchedClientId =
    (currentLead.client_id as string | null) ??
    (await findExistingClientId(supabase, centerId, lead));

  if (matchedClientId) {
    await updateConvertedClient(supabase, matchedClientId, lead, {
      sourceId: currentLead.source_id as string | null,
      campaignId: currentLead.campaign_id as string | null,
    });

    if (!currentLead.client_id) {
      await updateLeadFields(supabase, leadId, {
        client_id: matchedClientId,
        updated_at: new Date().toISOString(),
      });
    }

    return matchedClientId;
  }

  const { data: createdClient, error: clientError } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: lead.firstName.trim() || "Cliente",
      last_name: lead.lastName.trim() || "Bookea",
      email: lead.email.trim() || null,
      phone: lead.phone.trim() || null,
      source_id: currentLead.source_id,
      campaign_id: currentLead.campaign_id,
      status: "in_care",
      private_note: `Converti depuis le prospect le ${formatActivityDateForStorage()}.`,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (clientError) {
    throw new Error(clientError.message);
  }

  await updateLeadFields(supabase, leadId, {
    client_id: createdClient.id,
    updated_at: new Date().toISOString(),
  });

  return createdClient.id as string;
}

async function findExistingClientId(
  supabase: SupabaseClient,
  centerId: string,
  lead: Lead,
) {
  const email = lead.email.trim();

  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("center_id", centerId)
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      return data.id as string;
    }
  }

  const phone = lead.phone.trim();

  if (!phone) {
    return null;
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("center_id", centerId)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.id as string | undefined) ?? null;
}

async function updateConvertedClient(
  supabase: SupabaseClient,
  clientId: string,
  lead: Lead,
  links: { sourceId: string | null; campaignId: string | null },
) {
  const { error } = await supabase
    .from("clients")
    .update({
      first_name: lead.firstName.trim() || "Cliente",
      last_name: lead.lastName.trim() || "Bookea",
      email: lead.email.trim() || null,
      phone: lead.phone.trim() || null,
      source_id: links.sourceId,
      campaign_id: links.campaignId,
      status: "in_care",
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);

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

function toCrmClient(row: ClientRow): CrmClient {
  const source = relationObject(row.lead_sources)?.name ?? "À compléter";
  const campaign = relationObject(row.campaigns)?.name ?? "À compléter";
  const leads = row.leads ?? [];
  const appointments = row.appointments ?? [];
  const invoices = row.invoices ?? [];
  const documents = row.documents ?? [];
  const latestLead = leads
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const nextAppointment = appointments
    .filter((appointment) =>
      ["confirmed", "to_confirm", "in_progress"].includes(appointment.status),
    )
    .sort((a, b) =>
      `${a.appointment_date} ${a.starts_at}`.localeCompare(
        `${b.appointment_date} ${b.starts_at}`,
      ),
    )[0];
  const paidTotal = invoices.reduce(
    (total, invoice) => total + Number(invoice.paid_amount ?? 0),
    0,
  );
  const balanceDue = invoices.reduce(
    (total, invoice) => total + Number(invoice.balance_due ?? 0),
    0,
  );
  const leadAmount = leads.reduce(
    (total, lead) => total + Number(lead.amount_cure_ttc ?? 0),
    0,
  );
  const mainCare =
    relationObject(nextAppointment?.services)?.name ??
    relationObject(latestLead?.services)?.name ??
    "À compléter";

  return {
    id: row.id,
    firstName: row.first_name || "Cliente",
    lastName: row.last_name || "",
    phone: row.phone || "",
    email: row.email || "",
    birthDate: row.birthdate ? formatDisplayDateForCrm(row.birthdate) : "À compléter",
    gender: row.gender || "À compléter",
    address: row.address_line1 || "À compléter",
    postalCode: row.postal_code || "",
    city: row.city || "",
    mainCare,
    category: getClientCategoryFromCareName(mainCare),
    source,
    campaign,
    status: normalizeClientStatus(row.status, latestLead?.status),
    commercial: "Équipe",
    nextAppointment: nextAppointment
      ? `${formatDisplayDateForCrm(nextAppointment.appointment_date)} ${nextAppointment.starts_at.slice(0, 5)}`
      : "Aucun RDV",
    lastVisit: formatDisplayDateForCrm(row.updated_at.slice(0, 10)),
    totalSpent: paidTotal || leadAmount,
    balanceDue,
    notes: [
      ...toClientNotes(row.private_note, "private"),
      ...toClientNotes(row.shared_note, "shared"),
    ],
    cares: toClientCares(leads, invoices),
    documents: documents.map(toClientDocument),
  };
}

function toClientFields(
  centerId: string,
  input: CrmClientInput,
  sourceId: string | null,
  campaignId: string | null,
) {
  return {
    center_id: centerId,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
    birthdate: toIsoDate(input.birthDate),
    gender: input.gender && input.gender !== "À compléter" ? input.gender : null,
    address_line1:
      input.address && input.address !== "À compléter" ? input.address.trim() : null,
    postal_code: input.postalCode.trim() || null,
    city: input.city.trim() || null,
    source_id: sourceId,
    campaign_id: campaignId,
    status: toClientStatusValue(input.status),
    updated_at: new Date().toISOString(),
  };
}

function toClientNotes(
  value: string | null,
  visibility: "private" | "shared",
): CrmClientNote[] {
  if (!value) {
    return [];
  }

  return value
    .split("\n")
    .map((line, index) => {
      const [date, ...textParts] = line.split(" - ");

      return {
        id: `${visibility}-${index}`,
        author: visibility === "shared" ? "Équipe" : "Samantha",
        date: textParts.length > 0 ? date : "Note",
        text: textParts.length > 0 ? textParts.join(" - ") : line,
        visibility,
      };
    })
    .filter((note) => note.text.trim().length > 0);
}

function toClientCares(
  leads: NonNullable<ClientRow["leads"]>,
  invoices: NonNullable<ClientRow["invoices"]>,
): CrmClientCare[] {
  const invoiceCares = invoices.map((invoice) => ({
    id: invoice.id,
    label: invoice.type === "devis" ? "Devis client" : "Facture client",
    date: formatDisplayDateForCrm(invoice.issued_on),
    amount: Number(invoice.total_ttc ?? 0),
    paid: Number(invoice.paid_amount ?? 0),
    status: normalizeCareStatus(invoice.status, Number(invoice.balance_due ?? 0)),
  }));

  if (invoiceCares.length > 0) {
    return invoiceCares;
  }

  return leads.map((lead) => {
    const amount = Number(lead.amount_cure_ttc ?? 0);

    return {
      id: lead.id,
      label: relationObject(lead.services)?.name ?? "Soin à préciser",
      date: formatDisplayDateForCrm(lead.created_at.slice(0, 10)),
      amount,
      paid: ["Vendu", "Client", "Client converti"].includes(lead.status ?? "")
        ? amount
        : 0,
      status: ["Vendu", "Client", "Client converti"].includes(lead.status ?? "")
        ? "Payé"
        : "À encaisser",
    };
  });
}

function toClientDocument(row: {
  id: string;
  folder_name: string | null;
  name: string;
  status: string;
  file_type: string | null;
  created_at: string;
}): CrmClientDocument {
  return {
    id: row.id,
    label: row.name,
    date: formatDisplayDateForCrm(row.created_at.slice(0, 10)),
    status: normalizeDocumentStatus(row.status),
    type: normalizeDocumentType(row.file_type ?? row.folder_name),
  };
}

function normalizeClientStatus(
  value?: string | null,
  leadStatus?: string | null,
): CrmClientStatus {
  if (value === "in_care") return "Cure en cours";
  if (value === "to_recall") return "À relancer";
  if (value === "inactive") return "Inactif";
  if (["Vendu", "Client", "Client converti"].includes(leadStatus ?? "")) {
    return "Cure en cours";
  }

  return "Actif";
}

function toClientStatusValue(status: CrmClientStatus) {
  if (status === "Cure en cours") return "in_care";
  if (status === "À relancer") return "to_recall";
  if (status === "Inactif") return "inactive";
  return "active";
}

function normalizeCareStatus(
  status: string,
  balanceDue: number,
): CrmClientCare["status"] {
  if (status === "paid" || balanceDue <= 0) return "Payé";
  if (status === "pending_payment") return "Acompte";
  return "À encaisser";
}

function normalizeDocumentStatus(status: string): CrmClientDocument["status"] {
  if (status === "signed") return "Signé";
  if (status === "validated") return "Validé";
  if (status === "sent") return "À signer";
  return "À envoyer";
}

function toDocumentStatusValue(status: CrmClientDocument["status"]) {
  if (status === "Signé") return "signed";
  if (status === "Validé") return "validated";
  if (status === "À signer") return "sent";
  return "draft";
}

function normalizeDocumentType(value?: string | null): CrmClientDocument["type"] {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("devis")) return "Devis";
  if (normalized.includes("facture")) return "Facture";
  if (normalized.includes("fiche")) return "Fiche cure";
  return "Consentement";
}

function getClientCategoryFromCareName(care: string) {
  const normalizedCare = care
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalizedCare.includes("cryo") || normalizedCare.includes("minceur")) {
    return "Minceur";
  }

  if (
    normalizedCare.includes("hydra") ||
    normalizedCare.includes("visage") ||
    normalizedCare.includes("facial")
  ) {
    return "Soin du visage";
  }

  if (normalizedCare.includes("ongle") || normalizedCare.includes("gel")) {
    return "Beauté des ongles";
  }

  if (
    normalizedCare.includes("regard") ||
    normalizedCare.includes("cil") ||
    normalizedCare.includes("sourcil")
  ) {
    return "Beauté du regard";
  }

  return "Institut beauté";
}

function toIsoDate(value: string) {
  if (!value || value === "À compléter") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const [day, month, year] = value.split("/");

  if (!day || !month || !year) return null;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatDisplayDateForCrm(value: string) {
  if (!value) return "À compléter";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatActivityDateForStorage() {
  return `Aujourd'hui ${new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
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
