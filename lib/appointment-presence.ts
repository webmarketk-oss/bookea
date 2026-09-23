import type { Appointment, AppointmentStatus } from "@/types/agenda";

const autoPresentStatuses = new Set<AppointmentStatus>([
  "Confirmé",
  "À confirmer",
  "En cours",
]);

export function hasAppointmentEnded(appointment: {
  date: string;
  start: string;
  duration: number;
}) {
  const start = new Date(`${appointment.date}T${appointment.start}:00`);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const durationMs = Math.max(appointment.duration, 0) * 60 * 1000;
  return start.getTime() + durationMs <= Date.now();
}

const nonVisitTreatments = new Set([
  "Pause",
  "Formation",
  "Indisponible",
  "Fermeture",
]);

export function withPastAppointmentPresence(appointment: Appointment) {
  if ((appointment.kind ?? "Rendez-vous") !== "Rendez-vous") {
    return appointment;
  }

  if (appointment.source === "Seya") {
    return appointment;
  }

  if (nonVisitTreatments.has(appointment.treatment)) {
    return appointment;
  }

  if (!autoPresentStatuses.has(appointment.status)) {
    return appointment;
  }

  if (!hasAppointmentEnded(appointment)) {
    return appointment;
  }

  return {
    ...appointment,
    status: "Présent" as const,
  };
}

export function markPastAppointmentsPresent(appointments: Appointment[]) {
  return appointments.map(withPastAppointmentPresence);
}
