import type { SeyaConversation, SeyaProposedSlot } from "@/lib/seya-settings";
import type { Appointment } from "@/types/agenda";

export const AGENDA_SEYA_LEAD_ID = "agenda-desk";
export const AGENDA_SEYA_DURATION_MINUTES = 75;

function compactCommand(command: string) {
  return String(command || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, "");
}

export function isSeyaAgendaBlockCommand(command: string) {
  const compact = compactCommand(command);
  if (!compact) {
    return false;
  }

  const hasBlockNoun =
    compact.includes("pause") ||
    compact.includes("formation") ||
    compact.includes("indisponible") ||
    compact.includes("nondisponible") ||
    compact.includes("fermeture");
  const closesCabinOrDay =
    compact.includes("fermer") &&
    (compact.includes("cabine") ||
      compact.includes("journee") ||
      compact.includes("centre") ||
      compact.includes("institut"));
  const hasDelete =
    compact.includes("supprime") ||
    compact.includes("enleve") ||
    compact.includes("retire") ||
    compact.includes("efface");

  if (hasDelete) {
    return hasBlockNoun || closesCabinOrDay;
  }

  return hasBlockNoun || closesCabinOrDay;
}

export function createAgendaDeskConversation(
  centerId: string,
): SeyaConversation {
  return {
    id: AGENDA_SEYA_LEAD_ID,
    leadId: AGENDA_SEYA_LEAD_ID,
    firstName: "l'équipe",
    lastName: "",
    phone: "",
    treatment: "",
    status: "En cours",
    qualification: { need: "", zone: "", delay: "", availability: "" },
    proposedSlots: [],
    centerId,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

function timeToMinutes(time: string) {
  const [hours, minutes] = String(time || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);

  return (hours || 0) * 60 + (minutes || 0);
}

export function pickFreeCabinId({
  appointments,
  cabinIds,
  date,
  start,
  duration,
}: {
  appointments: Appointment[];
  cabinIds: string[];
  date: string;
  start: string;
  duration: number;
}) {
  const startMin = timeToMinutes(start);
  const endMin =
    startMin + (duration > 0 ? duration : AGENDA_SEYA_DURATION_MINUTES);

  for (const cabinId of cabinIds) {
    const busy = appointments.some((item) => {
      if (item.cabinId !== cabinId || item.date !== date) {
        return false;
      }
      if (/annul/i.test(String(item.status || ""))) {
        return false;
      }
      const otherStart = timeToMinutes(item.start);
      const otherEnd = otherStart + (item.duration || 60);
      return startMin < otherEnd && otherStart < endMin;
    });

    if (!busy) {
      return cabinId;
    }
  }

  return cabinIds[0] ?? "cabine-1";
}

export function seyaAgendaOccupancyAppointments(appointments: Appointment[]) {
  return appointments.map((item) => ({
    date: item.date,
    start: item.start,
    duration: item.duration,
    status: item.status,
    kind: item.kind === "Pause" ? "Indisponible" : item.kind,
    cabinId: item.cabinId,
  }));
}

export function agendaSeyaSuggestionTexts({
  slots,
  toConfirm,
}: {
  slots: SeyaProposedSlot[];
  toConfirm?: { personName: string; date: string; start: string } | null;
}) {
  const items: string[] = [];

  if (toConfirm?.personName) {
    items.push(
      `Relancer ${toConfirm.personName} pour confirmer le ${toConfirm.date} à ${toConfirm.start}.`,
    );
  }

  for (const slot of slots.slice(0, Math.max(0, 3 - items.length))) {
    items.push(`Créneau libre : ${slot.label}.`);
  }

  if (items.length === 0) {
    items.push(
      "Aucun créneau libre selon les horaires et le planning du centre.",
    );
  }
  if (items.length < 3) {
    items.push(
      "Demandez un créneau, un tarif, ou posez une pause sur le planning.",
    );
  }
  if (items.length < 3) {
    items.push("Seya Planning suit les briefs, horaires et le planning du centre.");
  }

  return items.slice(0, 3);
}

export function agendaSeyaClientName(firstName?: string, lastName?: string) {
  const name = [firstName, lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  if (!name || /equipe|équipe/i.test(name)) {
    return "Cliente Seya";
  }

  return name;
}

function last9Phone(value?: string | null) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function isLiveAgendaAppointment(appointment: Appointment) {
  if (appointment.kind && appointment.kind !== "Rendez-vous") {
    return false;
  }
  return !/annul/i.test(String(appointment.status || ""));
}

function compactPersonName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findSeyaConversationAppointment(
  conversation: {
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    bookedSlot?: { date?: string; time?: string } | null;
  },
  appointments: Appointment[],
) {
  const live = (appointments || []).filter(isLiveAgendaAppointment);
  const phone = last9Phone(conversation.phone);
  const byPhone =
    phone.length >= 9
      ? live.filter((item) => last9Phone(item.phone) === phone)
      : [];
  const bookedDate = String(conversation.bookedSlot?.date || "").slice(0, 10);
  const bookedTime = String(conversation.bookedSlot?.time || "").slice(0, 5);

  if (bookedDate && bookedTime) {
    const sameSlot = (item: Appointment) =>
      String(item.date).slice(0, 10) === bookedDate &&
      String(item.start).slice(0, 5) === bookedTime;
    const exactPhone = byPhone.find(sameSlot);
    if (exactPhone) {
      return exactPhone;
    }
    const exactAll = live.filter(sameSlot);
    if (exactAll.length === 1) {
      return exactAll[0];
    }
    const sameDay = byPhone.find(
      (item) => String(item.date).slice(0, 10) === bookedDate,
    );
    if (sameDay) {
      return sameDay;
    }
  }

  const wantedName = compactPersonName(
    `${conversation.firstName || ""} ${conversation.lastName || ""}`,
  );
  const byName =
    wantedName.length > 2
      ? live.filter((item) => {
          const person = compactPersonName(item.personName);
          return person.includes(wantedName) || wantedName.includes(person);
        })
      : [];
  const candidates = byPhone.length ? byPhone : byName;
  if (!candidates.length) {
    return null;
  }

  const ranked = [...candidates].sort((a, b) =>
    `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
  );
  const today = new Date().toISOString().slice(0, 10);
  return ranked.find((item) => String(item.date).slice(0, 10) >= today) || ranked.at(-1) || null;
}

export function agendaFocusHref(appointment: {
  id?: string;
  date: string;
  start?: string;
  phone?: string;
}) {
  const params = new URLSearchParams({
    date: String(appointment.date || "").slice(0, 10),
    view: "day",
  });
  if (
    appointment.id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      appointment.id,
    )
  ) {
    params.set("rdv", appointment.id);
  }
  const start = String(appointment.start || "").slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(start)) {
    params.set("heure", start);
  }
  const phone = last9Phone(appointment.phone);
  if (phone.length >= 9) {
    params.set("tel", phone);
  }
  return `/dashboard/agenda?${params.toString()}`;
}

export function seyaPlanningHref(
  conversation: {
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    bookedSlot?: { date?: string; time?: string } | null;
  },
  appointments: Appointment[],
) {
  const found = findSeyaConversationAppointment(conversation, appointments);
  if (found) {
    return agendaFocusHref(found);
  }
  const booked = conversation.bookedSlot;
  if (booked?.date && booked?.time) {
    return agendaFocusHref({
      date: booked.date,
      start: booked.time,
      phone: conversation.phone || undefined,
    });
  }
  return null;
}

