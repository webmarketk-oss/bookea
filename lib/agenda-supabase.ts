import { cabins, practitioners } from "@/lib/agenda-data";
import { getActiveCenterContext } from "@/lib/center-access";
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
  practitioners: Relation<{ name: string | null }>;
};

type Relation<T> = T | T[] | null;

type AppointmentLinks = {
  centerId: string;
  clientId: string;
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
        practitioners(name)
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
        practitioners(name)
      `,
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toAppointment(data as unknown as AppointmentRow);
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

  return { centerId, clientId, serviceId, roomId, practitionerId };
}

async function ensureAppointmentClient(
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
      .ilike("email", email)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
  }

  const phone = appointment.phone.trim();

  if (phone) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("center_id", centerId)
      .eq("phone", phone)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
  }

  const [firstName, ...lastNameParts] = appointment.personName.trim().split(/\s+/);
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: firstName || "Cliente",
      last_name: lastNameParts.join(" ") || "Bookea",
      email: email || null,
      phone: phone || null,
      status: appointment.source === "Client" ? "active" : "to_recall",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
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
  const { data: existing, error: existingError } = await supabase
    .from("practitioners")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("practitioners")
    .insert({ center_id: centerId, name, role: practitioner?.role ?? null, is_active: true })
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
    personName:
      [client?.first_name, client?.last_name].filter(Boolean).join(" ") ||
      "Cliente Bookea",
    phone: client?.phone ?? "",
    email: client?.email ?? undefined,
    treatment: service?.name ?? "Soin à préciser",
    practitionerId: getPractitionerIdByName(practitioner?.name),
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
