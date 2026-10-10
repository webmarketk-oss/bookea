import { cabins, cabinVisuals, practitioners } from "@/lib/agenda-data";
import {
  applyPositionedAppointmentStatus,
  AGENDA_BLOCK_CLIENT_MARKER,
  agendaBlockTitle,
  isAgendaBlockKind,
  resolveAgendaBlockKind,
  stripAgendaKindNote,
  withAgendaBlockIdentity,
  withAgendaKindNote,
} from "@/lib/appointment-position-status";
import { markPastAppointmentsPresent } from "@/lib/appointment-presence";
import { getActiveCenterContext } from "@/lib/center-access";
import { leadStatusAfterAgendaBooking } from "@/lib/appointment-lead-status";
import { normalizeLeadStatus } from "@/lib/lead-statuses";
import { closeSeyaThreadsForBookedLead } from "@/lib/seya-close-booking";
import { createClient } from "@/lib/supabase";
import type { Appointment, AppointmentStatus, Cabin, Practitioner } from "@/types/agenda";

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

  const appointments = ((data ?? []) as unknown as AppointmentRow[]).map(
    toAppointment,
  );
  const positionedAppointments = appointments.map(
    applyPositionedAppointmentStatus,
  );
  const markedAppointments = markPastAppointmentsPresent(
    positionedAppointments,
  );

  void persistPastAppointmentPresence(appointments, markedAppointments);

  return markedAppointments;
}

async function persistPastAppointmentPresence(
  originalAppointments: Appointment[],
  markedAppointments: Appointment[],
) {
  const updates = markedAppointments.filter((appointment, index) => {
    const original = originalAppointments[index];

    return (
      original &&
      original.status !== appointment.status &&
      isPersistedAppointmentId(appointment.id)
    );
  });

  await Promise.all(
    updates.map((appointment) =>
      updateCrmAppointment(appointment).catch(() => null),
    ),
  );
}

function prepareAgendaAppointment(appointment: Appointment) {
  return applyPositionedAppointmentStatus(withAgendaBlockIdentity(appointment));
}

export async function createCrmAppointment(appointment: Appointment) {
  const supabase = createClient();
  const positioned = prepareAgendaAppointment(appointment);
  const links = await ensureAppointmentLinks(supabase, positioned);
  const { data, error } = await supabase
    .from("appointments")
    .insert(toAppointmentFields(positioned, links))
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

  return withSavedAppointmentIdentity(
    toAppointment(data as unknown as AppointmentRow),
    positioned,
  );
}

export function isPersistedAppointmentId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export async function persistCrmAppointment(appointment: Appointment) {
  const positioned = prepareAgendaAppointment(appointment);

  if (isPersistedAppointmentId(positioned.id)) {
    await updateCrmAppointment(positioned);
    return positioned;
  }

  return createCrmAppointment(positioned);
}

async function appointmentMoveHistoryFields(
  supabase: SupabaseClient,
  appointment: Appointment,
) {
  if (!isPersistedAppointmentId(appointment.id)) {
    return {};
  }

  const { data } = await supabase
    .from("appointments")
    .select("appointment_date,starts_at,origin,notes,status_history,confirmation_token_slot")
    .eq("id", appointment.id)
    .maybeSingle();

  if (!data) {
    return {};
  }

  const previousDate = String(data.appointment_date || "").slice(0, 10);
  const previousStart = String(data.starts_at || "").slice(0, 5);

  if (previousDate === appointment.date && previousStart === appointment.start) {
    return {};
  }

  const notes = String(data.notes || appointment.notes || "");
  const origin = String(data.origin || "");
  const isOnline =
    origin === "public_bookea" || /booking:|réservation publique/i.test(notes);
  const source = data.confirmation_token_slot
    ? "sms_link"
    : isOnline
      ? "public"
      : "staff_agenda";
  const history = Array.isArray(data.status_history) ? data.status_history : [];

  return {
    status_history: [
      ...history,
      {
        at: new Date().toISOString(),
        source,
        action: "move",
        from: `${previousDate}|${previousStart}`,
        to: `${appointment.date}|${appointment.start}`,
      },
    ].slice(-30),
  };
}

export async function updateCrmAppointment(appointment: Appointment) {
  const supabase = createClient();
  const positioned = prepareAgendaAppointment(appointment);
  const links = await ensureAppointmentLinks(supabase, positioned);
  const moveHistory = await appointmentMoveHistoryFields(supabase, positioned);
  const { error } = await supabase
    .from("appointments")
    .update({
      ...toAppointmentFields(positioned, links),
      ...moveHistory,
    })
    .eq("id", positioned.id);

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

export async function loadCenterAssignmentOptions() {
  try {
    const supabase = createClient();
    const centerId = await getAgendaCenterId(supabase);
    const [{ data: rooms }, { data: staff }] = await Promise.all([
      supabase.from("rooms").select("name").eq("center_id", centerId).order("name"),
      supabase
        .from("practitioners")
        .select("first_name,last_name")
        .eq("center_id", centerId)
        .order("first_name"),
    ]);

    return {
      cabins: uniqueNonEmpty(
        (rooms ?? []).map((row) => String(row.name ?? "")),
      ),
      practitioners: uniqueNonEmpty(
        (staff ?? []).map((row) =>
          [row.first_name, row.last_name].filter(Boolean).join(" "),
        ),
      ),
    };
  } catch {
    return { cabins: [] as string[], practitioners: [] as string[] };
  }
}

export function alignAppointmentCabinId(cabinId: string, cabinList: Cabin[]) {
  if (cabinList.some((cabin) => cabin.id === cabinId)) {
    return cabinId;
  }

  const legacy = /^cabine-(\d+)$/i.exec(cabinId);
  if (legacy) {
    const index = Number(legacy[1]) - 1;
    return cabinList[index]?.id ?? cabinList[0]?.id ?? cabinId;
  }

  const normalized = cabinId.trim().toLowerCase();
  const byName = cabinList.find(
    (cabin) => cabin.name.trim().toLowerCase() === normalized,
  );
  return byName?.id ?? cabinList[0]?.id ?? cabinId;
}

export function alignAppointmentPractitionerId(
  appointment: Appointment,
  practitionerList: Practitioner[],
) {
  if (practitionerList.some((item) => item.id === appointment.practitionerId)) {
    return appointment.practitionerId;
  }

  const name = appointment.practitionerName?.trim().toLowerCase();
  if (name) {
    const byName = practitionerList.find(
      (item) => item.name.trim().toLowerCase() === name,
    );
    if (byName) {
      return byName.id;
    }
  }

  return practitionerList[0]?.id ?? appointment.practitionerId;
}

export async function loadCenterCabins() {
  try {
    const supabase = createClient();
    const centerId = await getAgendaCenterId(supabase);
    const [{ data: rooms, error: roomsError }, { data: center }] =
      await Promise.all([
        supabase
          .from("rooms")
          .select("id,name,color,display_order,is_active")
          .eq("center_id", centerId)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("centers")
          .select("settings")
          .eq("id", centerId)
          .maybeSingle(),
      ]);

    if (roomsError) {
      throw new Error(roomsError.message);
    }

    const equipmentMap = readRoomEquipment(center?.settings);
    let rows = (rooms ?? []).filter(
      (row) => row?.id && row.is_active !== false,
    );

    if (rows.length === 0) {
      rows = await seedDefaultRooms(supabase, centerId);
    }

    return rows.map((row, index) =>
      mapRoomToCabin(row, index, equipmentMap),
    );
  } catch {
    return cabins;
  }
}

export async function createCenterCabin(currentCount: number) {
  const supabase = createClient();
  const centerId = await getAgendaCenterId(supabase);
  const index = Math.max(0, currentCount);
  const visuals = cabinVisuals(index);
  const name = `Cabine ${index + 1}`;
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      center_id: centerId,
      name,
      color: visuals.hex,
      display_order: index + 1,
      is_active: true,
    })
    .select("id,name,color,display_order,is_active")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const cabin = mapRoomToCabin(data, index, {});
  await patchRoomEquipment(supabase, centerId, { [cabin.id]: cabin.equipment });
  return cabin;
}

export async function updateCenterCabin(cabin: Cabin, index: number) {
  if (!isPersistedAppointmentId(cabin.id)) {
    return cabin;
  }

  const supabase = createClient();
  const centerId = await getAgendaCenterId(supabase);
  const visuals = cabinVisuals(index);
  const name = cabin.name.trim() || `Cabine ${index + 1}`;
  const { error } = await supabase
    .from("rooms")
    .update({
      name,
      color: visuals.hex,
      display_order: index + 1,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cabin.id)
    .eq("center_id", centerId);

  if (error) {
    throw new Error(error.message);
  }

  await patchRoomEquipment(supabase, centerId, {
    [cabin.id]: cabin.equipment.trim(),
  });

  return {
    ...cabin,
    name,
    color: visuals.color,
    softColor: visuals.softColor,
  };
}

export async function saveCenterCabins(nextCabins: Cabin[]) {
  const supabase = createClient();
  const centerId = await getAgendaCenterId(supabase);
  const equipment: Record<string, string> = {};

  for (let index = 0; index < nextCabins.length; index += 1) {
    const cabin = nextCabins[index];
    if (!isPersistedAppointmentId(cabin.id)) {
      continue;
    }

    const visuals = cabinVisuals(index);
    const name = cabin.name.trim() || `Cabine ${index + 1}`;
    const { error } = await supabase
      .from("rooms")
      .update({
        name,
        color: visuals.hex,
        display_order: index + 1,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cabin.id)
      .eq("center_id", centerId);

    if (error) {
      throw new Error(error.message);
    }

    equipment[cabin.id] = cabin.equipment.trim();
  }

  if (Object.keys(equipment).length > 0) {
    await patchRoomEquipment(supabase, centerId, equipment);
  }
}

export async function deleteCenterCabin(cabinId: string) {
  if (!isPersistedAppointmentId(cabinId)) {
    return;
  }

  const supabase = createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", cabinId);

  if (error) {
    throw new Error(error.message);
  }
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
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
    isBookableAppointment(appointment)
      ? ensureAppointmentClient(supabase, centerId, appointment)
      : ensureAgendaBlockClient(supabase, centerId),
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
  if (isBookableAppointment(appointment)) {
    await closeSeyaThreadsForBookedLead(supabase, centerId, {
      leadId,
      phone: appointment.phone,
      date: appointment.date,
      start: appointment.start,
    });
  }

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
      const names = clientNameFields(appointment);
      const { data, error } = await supabase
        .from("clients")
        .update({
          first_name: names.first_name,
          last_name: names.last_name,
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

  const names = clientNameFields(appointment);
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: names.first_name,
      last_name: names.last_name,
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
  const nextStatus = leadStatusAfterAgendaBooking(
    appointment.source,
    currentStatus,
  );

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

  if (nextStatus !== lead.status) {
    await supabase.from("lead_events").insert({
      center_id: centerId,
      lead_id: lead.id,
      event_type: "status",
      from_value: lead.status,
      to_value: nextStatus,
      note: `RDV posé dans l'agenda : ${lead.status} → ${nextStatus}.`,
    });
  }

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

function appointmentPersonName(
  client?: { first_name?: string | null; last_name?: string | null } | null,
  serviceName?: string | null,
  notes?: string | null,
) {
  const joined = [client?.first_name, client?.last_name].filter(Boolean).join(" ");
  const kind = resolveAgendaBlockKind(undefined, serviceName, joined, notes);

  if (kind) {
    return agendaBlockTitle(kind, serviceName, joined, notes);
  }

  return joined || "Cliente Bookea";
}

function isBookableAppointment(appointment: Appointment) {
  return !isAgendaBlockKind(
    appointment.kind,
    appointment.treatment,
    appointment.personName,
    appointment.notes,
  );
}

async function ensureAgendaBlockClient(
  supabase: SupabaseClient,
  centerId: string,
) {
  const { data: existing, error: existingError } = await supabase
    .from("clients")
    .select("id")
    .eq("center_id", centerId)
    .ilike("private_note", `%${AGENDA_BLOCK_CLIENT_MARKER}%`)
    .is("merged_into_client_id", null)
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: "Agenda",
      last_name: "Interne",
      email: `agenda-block.${centerId.replace(/-/g, "")}@internal.bookea`,
      phone: null,
      status: "inactive",
      private_note: `${AGENDA_BLOCK_CLIENT_MARKER} Support des pauses, formations et indisponibilités du planning.`,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
}

function clientNameFields(appointment: Appointment) {
  if (isAgendaBlockKind(appointment.kind, appointment.treatment)) {
    return {
      first_name: agendaBlockTitle(
        appointment.kind,
        appointment.treatment,
        appointment.personName,
      ),
      last_name: "",
    };
  }

  const [firstName, ...lastNameParts] = appointment.personName.trim().split(/\s+/);
  return {
    first_name: firstName || "Cliente",
    last_name: lastNameParts.join(" ") || "Bookea",
  };
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
  if (isPersistedAppointmentId(cabinId)) {
    const { data, error } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", cabinId)
      .eq("center_id", centerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
  }

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
  if (isPersistedAppointmentId(practitionerId)) {
    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("id", practitionerId)
      .eq("center_id", centerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
  }

  const name = await resolvePractitionerName(
    supabase,
    centerId,
    practitionerId,
  );
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

async function resolvePractitionerName(
  supabase: SupabaseClient,
  centerId: string,
  practitionerId: string,
) {
  const hardcoded = practitioners.find((item) => item.id === practitionerId);
  if (hardcoded?.name) {
    return hardcoded.name;
  }

  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const team = asRecord(asRecord(asRecord(data?.settings).agenda).team);
  const list = Array.isArray(team.practitioners) ? team.practitioners : [];
  const found = list.find(
    (item) =>
      item &&
      typeof item === "object" &&
      String((item as { id?: unknown }).id || "") === practitionerId,
  ) as { name?: unknown } | undefined;

  const name = String(found?.name || "").trim();
  return name || "Praticienne";
}

function withSavedAppointmentIdentity(
  saved: Appointment,
  original: Appointment,
): Appointment {
  const originalName = original.personName.trim();

  return applyPositionedAppointmentStatus({
    ...saved,
    personName:
      originalName && originalName !== "Cliente Bookea"
        ? original.personName
        : saved.personName,
    phone: original.phone.trim() || saved.phone,
    email: original.email || saved.email,
    kind: original.kind ?? saved.kind,
    birthDate: original.birthDate || saved.birthDate,
    treatment: original.treatment.trim() || saved.treatment,
    clientId: saved.clientId || original.clientId,
    source: original.source || saved.source,
  });
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
    notes: withAgendaKindNote(appointment.notes, appointment.kind) ?? null,
    updated_at: new Date().toISOString(),
  };
}

function toAppointment(row: AppointmentRow): Appointment {
  const client = relationObject(row.clients);
  const service = relationObject(row.services);
  const room = relationObject(row.rooms);
  const practitioner = relationObject(row.practitioners);
  const joinedName = [client?.first_name, client?.last_name]
    .filter(Boolean)
    .join(" ");
  const kind = resolveAgendaBlockKind(
    undefined,
    service?.name,
    joinedName,
    row.notes,
  );
  const notes = stripAgendaKindNote(row.notes) || undefined;

  return {
    id: row.id,
    clientId: row.client_id || undefined,
    personName: appointmentPersonName(client, service?.name, row.notes),
    phone: client?.phone ?? "",
    email: client?.email ?? undefined,
    treatment: kind || service?.name || "Soin à préciser",
    practitionerId: getPractitionerIdByName(practitionerDisplayName(practitioner)),
    practitionerName: practitionerDisplayName(practitioner) ?? undefined,
    cabinId: row.room_id || getCabinIdByName(room?.name),
    date: row.appointment_date,
    start: row.starts_at.slice(0, 5),
    duration: row.duration_minutes,
    status: fromAppointmentStatusValue(row.status),
    source: row.origin === "client" ? "Client" : row.origin === "seya" ? "Seya" : "Prospect",
    kind,
    notes,
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

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

type RoomRow = {
  id: string;
  name?: string | null;
  color?: string | null;
  display_order?: number | null;
  is_active?: boolean | null;
};

function mapRoomToCabin(
  row: RoomRow,
  index: number,
  equipmentMap: Record<string, string>,
): Cabin {
  const visuals = cabinVisuals(index);
  const fallback = cabins[index];

  return {
    id: row.id,
    name: String(row.name || fallback?.name || `Cabine ${index + 1}`).trim(),
    equipment:
      equipmentMap[row.id] ||
      fallback?.equipment ||
      "",
    color: visuals.color,
    softColor: visuals.softColor,
  };
}

function readRoomEquipment(settings: unknown) {
  const raw = asRecord(asRecord(asRecord(settings).agenda).roomEquipment);
  const result: Record<string, string> = {};

  for (const [id, value] of Object.entries(raw)) {
    if (id && typeof value === "string") {
      result[id] = value;
    }
  }

  return result;
}

async function patchRoomEquipment(
  supabase: SupabaseClient,
  centerId: string,
  patch: Record<string, string>,
) {
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const currentSettings = asRecord(data?.settings);
  const currentAgenda = asRecord(currentSettings.agenda);
  const { error: updateError } = await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        agenda: {
          ...currentAgenda,
          roomEquipment: {
            ...readRoomEquipment(currentSettings),
            ...patch,
          },
        },
      },
    })
    .eq("id", centerId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function seedDefaultRooms(supabase: SupabaseClient, centerId: string) {
  const payload = cabins.map((cabin, index) => {
    const visuals = cabinVisuals(index);
    return {
      center_id: centerId,
      name: cabin.name,
      color: visuals.hex,
      display_order: index + 1,
      is_active: true,
    };
  });
  const { data, error } = await supabase
    .from("rooms")
    .insert(payload)
    .select("id,name,color,display_order,is_active");

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const equipment = Object.fromEntries(
    rows.map((row, index) => [row.id, cabins[index]?.equipment ?? ""]),
  );
  await patchRoomEquipment(supabase, centerId, equipment);
  return rows;
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
