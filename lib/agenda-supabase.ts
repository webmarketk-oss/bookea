import { cabins, practitioners } from "@/lib/agenda-data";
import { getActiveCenterContext } from "@/lib/center-access";
import { normalizeLeadStatus } from "@/lib/lead-statuses";
import { createClient } from "@/lib/supabase";
import type { Appointment, AppointmentStatus } from "@/types/agenda";

type SupabaseClient = ReturnType<typeof createClient>;

type AppointmentRow = {
  id: string;
  center_id: string;
  client_id: string | null;
  lead_id: string | null;
  service_id: string | null;
  room_id: string | null;
  practitioner_id: string | null;
  appointment_date: string;
  starts_at: string;
  duration_minutes: number;
  status: string;
  origin: string;
  notes: string | null;
  clients: Relation<{
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  }>;
  services: Relation<{ name: string | null }>;
  rooms: Relation<{ name: string | null }>;
  practitioners: Relation<{ first_name: string | null; last_name: string | null }>;
};

type Relation<T> = T | T[] | null;

type AppointmentLinks = {
  centerId: string;
  clientId: string;
  leadId: string | null;
  serviceId: string | null;
  roomId: string | null;
  practitionerId: string | null;
};

export async function loadCrmAppointments() {
  const supabase = createClient();
  const centerId = await getAgendaCenterId(supabase);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
        id,
        center_id,
        client_id,
        lead_id,
        service_id,
        room_id,
        practitioner_id,
        appointment_date,
        starts_at,
        duration_minutes,
        status,
        origin,
        notes,
        clients(first_name,last_name,phone,email),
        services(name),
        rooms(name),
        practitioners(first_name,last_name)
      `,
    )
    .eq("center_id", centerId)
    .order("appointment_date", { ascending: true })
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as AppointmentRow[]).map(toAppointment);
}

export async function createCrmAppointment(appointment: Appointment) {
  const supabase = createClient();
  const links = await ensureAppointmentLinks(supabase, appointment);
  const { data, error } = await supabase
    .from("appointments")
    .insert(toAppointmentFields(appointment, links))
    .select(
      `
        id,
        center_id,
        client_id,
        lead_id,
        service_id,
        room_id,
        practitioner_id,
        appointment_date,
        starts_at,
        duration_minutes,
        status,
        origin,
        notes,
        clients(first_name,last_name,phone,email),
        services(name),
        rooms(name),
        practitioners(first_name,last_name)
      `,
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toAppointment(data as unknown as AppointmentRow);
}

export function isPersistedAppointmentId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export async function persistCrmAppointment(appointment: Appointment) {
  if (isPersistedAppointmentId(appointment.id)) {
    await updateCrmAppointment(appointment);
    return appointment;
  }

  return createCrmAppointment(appointment);
}

export async function updateCrmAppointment(appointment: Appointment) {
  const supabase = createClient();
  const links = await ensureAppointmentLinks(supabase, appointment);
  const { error } = await supabase
    .from("appointments")
    .update(toAppointmentFields(appointment, links))
    .eq("id", appointment.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCrmAppointment(appointmentId: string) {
  if (!isPersistedAppointmentId(appointmentId)) {
    return;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId);

  if (error) {
    throw new Error(error.message);
  }
}

async function getAgendaCenterId(supabase: SupabaseClient) {
  const context = await getActiveCenterContext(supabase);

  return context.centerId;
}

async function ensureAppointmentLinks(
  supabase: SupabaseClient,
  appointment: Appointment,
): Promise<AppointmentLinks> {
  const centerId = await getAgendaCenterId(supabase);
  const [clientId, serviceId, roomId, practitionerId] = await Promise.all([
    ensureAppointmentClient(supabase, centerId, appointment),
    ensureAppointmentService(supabase, centerId, appointment.treatment),
    ensureRoom(supabase, centerId, appointment.cabinId),
    ensurePractitioner(supabase, centerId, appointment.practitionerId),
  ]);
  const leadId = await linkAppointmentLead(
    supabase,
    centerId,
    clientId,
    appointment,
  );

  return { centerId, clientId, leadId, serviceId, roomId, practitionerId };
}

async function ensureAppointmentClient(
  supabase: SupabaseClient,
  centerId: string,
  appointment: Appointment,
) {
  const existingId = await findAppointmentClientId(
    supabase,
    centerId,
    appointment,
  );

  if (existingId) {
    if (isBookableAppointment(appointment)) {
      const [firstName, ...lastNameParts] = appointment.personName
        .trim()
        .split(/\s+/);
      const { data, error } = await supabase
        .from("clients")
        .update({
          first_name: firstName || "Cliente",
          last_name: lastNameParts.join(" ") || "Bookea",
          email: appointment.email?.trim() || null,
          phone: appointment.phone.trim() || null,
          ...(appointment.birthDate ? { birthdate: appointment.birthDate } : {}),
          status: "in_care",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data?.id) {
        throw new Error("La fiche client n'a pas pu être mise à jour.");
      }
    }

    return existingId;
  }

  const [firstName, ...lastNameParts] = appointment.personName.trim().split(/\s+/);
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: firstName || "Cliente",
      last_name: lastNameParts.join(" ") || "Bookea",
      email: appointment.email?.trim() || null,
      phone: appointment.phone.trim() || null,
      ...(appointment.birthDate ? { birthdate: appointment.birthDate } : {}),
      status: isBookableAppointment(appointment) ? "in_care" : "to_recall",
      private_note: isBookableAppointment(appointment)
        ? `Converti depuis un rendez-vous agenda le ${new Date().toLocaleDateString("fr-FR")}.`
        : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
}

async function findAppointmentClientId(
  supabase: SupabaseClient,
  centerId: string,
  appointment: Appointment,
) {
  const email = appointment.email?.trim();

  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("center_id", centerId)
      .is("merged_into_client_id", null)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
  }

  const phoneKey = lastPhoneDigits(appointment.phone);

  if (!phoneKey) {
    return null;
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id,phone")
    .eq("center_id", centerId)
    .is("merged_into_client_id", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message);

  return (
    (data ?? []).find(
      (row) => lastPhoneDigits(String(row.phone || "")) === phoneKey,
    )?.id ?? null
  );
}

async function linkAppointmentLead(
  supabase: SupabaseClient,
  centerId: string,
  clientId: string,
  appointment: Appointment,
) {
  if (!isBookableAppointment(appointment)) {
    return null;
  }

  const lead = await findAppointmentLead(supabase, centerId, clientId, appointment);

  if (!lead) {
    return null;
  }

  const currentStatus = normalizeLeadStatus(lead.status);
  const nextStatus = shouldMarkLeadAsBooked(currentStatus)
    ? "RDV pris"
    : currentStatus;

  const { error } = await supabase
    .from("leads")
    .update({
      client_id: clientId,
      status: nextStatus,
      next_action: `RDV ${appointment.date} ${appointment.start}`,
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (error) throw new Error(error.message);

  await supabase.from("lead_events").insert({
    center_id: centerId,
    lead_id: lead.id,
    event_type: "status",
    from_value: lead.status,
    to_value: nextStatus,
    note: `RDV posé dans l'agenda : ${lead.status} → ${nextStatus}.`,
  });

  return lead.id as string;
}

async function findAppointmentLead(
  supabase: SupabaseClient,
  centerId: string,
  clientId: string,
  appointment: Appointment,
) {
  const { data: byClient, error: byClientError } = await supabase
    .from("leads")
    .select("id,status")
    .eq("center_id", centerId)
    .eq("client_id", clientId)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byClientError) throw new Error(byClientError.message);
  if (byClient?.id) return byClient;

  const email = appointment.email?.trim();
  const phoneKey = lastPhoneDigits(appointment.phone);

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id,status,client_id,clients(email,phone)")
    .eq("center_id", centerId)
    .order("last_activity_at", { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message);

  return (
    (leads ?? []).find((row) => {
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      const leadEmail = String(client?.email || "").trim().toLowerCase();
      const leadPhone = lastPhoneDigits(String(client?.phone || ""));

      return (
        (email && leadEmail === email.toLowerCase()) ||
        (phoneKey && leadPhone === phoneKey)
      );
    }) ?? null
  );
}

function isBookableAppointment(appointment: Appointment) {
  return !appointment.kind || appointment.kind === "Rendez-vous";
}

function shouldMarkLeadAsBooked(status: string) {
  return ![
    "RDV pris",
    "RDV confirmé",
    "Acompte envoyé",
    "Acompte reçu",
    "Acompte en attente",
    "Devis",
    "Vendu",
    "Client converti",
  ].includes(status);
}

function lastPhoneDigits(value: string) {
  return value.replace(/[^\d]/g, "").slice(-9);
}

async function ensureAppointmentService(
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

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("services")
    .insert({
      center_id: centerId,
      name: normalizedName,
      duration_minutes: 60,
      price_ttc: 0,
      is_public: false,
      requires_room: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
}

async function ensureRoom(
  supabase: SupabaseClient,
  centerId: string,
  cabinId: string,
) {
  const cabin = cabins.find((item) => item.id === cabinId);
  const name = cabin?.name ?? "Cabine";
  const { data: existing, error: existingError } = await supabase
    .from("rooms")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("rooms")
    .insert({ center_id: centerId, name, is_active: true })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
}

async function ensurePractitioner(
  supabase: SupabaseClient,
  centerId: string,
  practitionerId: string,
) {
  const practitioner = practitioners.find((item) => item.id === practitionerId);
  const name = practitioner?.name ?? "Praticienne";
  const names = splitPersonName(name);
  const { data: existingRows, error: existingError } = await supabase
    .from("practitioners")
    .select("id, first_name, last_name")
    .eq("center_id", centerId);

  if (existingError) throw new Error(existingError.message);

  const existing = (existingRows ?? []).find(
    (row) =>
      practitionerDisplayName(row) === name ||
      (normalizeName(row.first_name) === normalizeName(names.first_name) &&
        normalizeName(row.last_name) === normalizeName(names.last_name)),
  );

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("practitioners")
    .insert({
      center_id: centerId,
      first_name: names.first_name,
      last_name: names.last_name,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
}

function toAppointmentFields(
  appointment: Appointment,
  links: AppointmentLinks,
) {
  return {
    center_id: links.centerId,
    client_id: links.clientId,
    lead_id: links.leadId,
    service_id: links.serviceId,
    room_id: links.roomId,
    practitioner_id: links.practitionerId,
    appointment_date: appointment.date,
    starts_at: appointment.start,
    ends_at: addMinutesToTime(appointment.start, appointment.duration),
    duration_minutes: appointment.duration,
    status: toAppointmentStatusValue(appointment.status),
    origin: appointment.source.toLowerCase(),
    notes: appointment.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

function toAppointment(row: AppointmentRow): Appointment {
  const client = relationObject(row.clients);
  const service = relationObject(row.services);
  const room = relationObject(row.rooms);
  const practitioner = relationObject(row.practitioners);

  return {
    id: row.id,
    clientId: row.client_id || undefined,
    personName:
      [client?.first_name, client?.last_name].filter(Boolean).join(" ") ||
      "Cliente Bookea",
    phone: client?.phone ?? "",
    email: client?.email ?? undefined,
    treatment: service?.name ?? "Soin à préciser",
    practitionerId: getPractitionerIdByName(practitionerDisplayName(practitioner)),
    cabinId: getCabinIdByName(room?.name),
    date: row.appointment_date,
    start: row.starts_at.slice(0, 5),
    duration: row.duration_minutes,
    status: fromAppointmentStatusValue(row.status),
    source: row.origin === "client" ? "Client" : row.origin === "seya" ? "Seya" : "Prospect",
    notes: row.notes ?? undefined,
  };
}

function toAppointmentStatusValue(status: AppointmentStatus) {
  const values: Record<AppointmentStatus, string> = {
    Confirmé: "confirmed",
    "À confirmer": "to_confirm",
    "En cours": "in_progress",
    Terminé: "done",
    "No show": "no_show",
    Présent: "present",
    Annulation: "cancelled",
    "Pas venu pas prévenu": "no_show",
    Devis: "quote",
    Vendu: "sold",
    "Devis vendu": "sold",
  };

  return values[status];
}

function fromAppointmentStatusValue(status: string): AppointmentStatus {
  const values: Record<string, AppointmentStatus> = {
    confirmed: "Confirmé",
    to_confirm: "À confirmer",
    in_progress: "En cours",
    done: "Terminé",
    no_show: "No show",
    present: "Présent",
    cancelled: "Annulation",
    quote: "Devis",
    sold: "Vendu",
  };

  return values[status] ?? "À confirmer";
}

function getPractitionerIdByName(name?: string | null) {
  return (
    practitioners.find((practitioner) => practitioner.name === name)?.id ??
    practitioners[0]?.id ??
    "samantha"
  );
}

function practitionerDisplayName(
  row?: { first_name?: string | null; last_name?: string | null } | null,
) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ") || null;
}

function splitPersonName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return {
    first_name: parts[0] || "Praticienne",
    last_name: parts.slice(1).join(" ") || null,
  };
}

function normalizeName(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function getCabinIdByName(name?: string | null) {
  return cabins.find((cabin) => cabin.name === name)?.id ?? cabins[0]?.id ?? "cabine-1";
}

function addMinutesToTime(time: string, minutes: number) {
  const [hours = "0", mins = "0"] = time.split(":");
  const totalMinutes = Number(hours) * 60 + Number(mins) + minutes;
  const nextHours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");

  return `${nextHours}:${nextMinutes}`;
}

function relationObject<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}
