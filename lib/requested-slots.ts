import type { CenterDayHours } from "@/lib/center-hours";
import type { Appointment } from "@/types/agenda";

const fallbackHours: CenterDayHours[] = [
  { weekday: 1, label: "Lun", startTime: "08:00", endTime: "19:00", closed: false },
  { weekday: 2, label: "Mar", startTime: "08:00", endTime: "19:00", closed: false },
  { weekday: 3, label: "Mer", startTime: "08:00", endTime: "19:00", closed: false },
  { weekday: 4, label: "Jeu", startTime: "08:00", endTime: "19:00", closed: false },
  { weekday: 5, label: "Ven", startTime: "08:00", endTime: "19:00", closed: false },
  { weekday: 6, label: "Sam", startTime: "08:00", endTime: "19:00", closed: false },
  { weekday: 0, label: "Dim", startTime: "08:00", endTime: "19:00", closed: false },
];

export type RequestedSlotRow = {
  slot: string;
  demand: number;
  bookings: number;
  missed: number;
};

const SLOT_MINUTES = 120;

function timeToMinutes(value: string) {
  const [hours, minutes] = String(value || "0:0").split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function minutesToLabel(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0
    ? `${String(hours).padStart(2, "0")}h`
    : `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}`;
}

function weekdayFromIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function dayHoursForDate(
  hours: CenterDayHours[],
  date: string,
): CenterDayHours | null {
  const list = hours.length > 0 ? hours : fallbackHours;
  const day =
    list.find((item) => item.weekday === weekdayFromIso(date)) ??
    fallbackHours.find((item) => item.weekday === weekdayFromIso(date));

  if (!day || day.closed) {
    return null;
  }

  const start = timeToMinutes(day.startTime);
  const end = timeToMinutes(day.endTime);
  if (end <= start) {
    return null;
  }

  return day;
}

export function slotWindowLabel(day: CenterDayHours, startTime: string) {
  const start = timeToMinutes(day.startTime);
  const end = timeToMinutes(day.endTime);
  const appointment = timeToMinutes(startTime);

  if (appointment < start || appointment >= end) {
    return "";
  }

  const offset = Math.floor((appointment - start) / SLOT_MINUTES);
  const windowStart = start + offset * SLOT_MINUTES;
  const windowEnd = Math.min(windowStart + SLOT_MINUTES, end);

  return `${day.label} ${minutesToLabel(windowStart)}-${minutesToLabel(windowEnd)}`;
}

export function buildRequestedSlots(
  appointments: Appointment[],
  hours: CenterDayHours[] = fallbackHours,
): RequestedSlotRow[] {
  const grouped = new Map<string, { bookings: number; missed: number }>();

  for (const appointment of appointments) {
    if (appointment.kind && appointment.kind !== "Rendez-vous") {
      continue;
    }
    if (appointment.status === "Annulation") {
      continue;
    }

    const day = dayHoursForDate(hours, appointment.date);
    if (!day) {
      continue;
    }

    const label = slotWindowLabel(day, appointment.start);
    if (!label) {
      continue;
    }

    const current = grouped.get(label) ?? { bookings: 0, missed: 0 };
    current.bookings += 1;
    if (
      appointment.status === "No show" ||
      appointment.status === "Pas venu pas prévenu"
    ) {
      current.missed += 1;
    }
    grouped.set(label, current);
  }

  const maxBookings = Math.max(
    1,
    ...[...grouped.values()].map((item) => item.bookings),
  );

  return [...grouped.entries()]
    .map(([slot, item]) => ({
      slot,
      demand: Math.round((item.bookings / maxBookings) * 100),
      bookings: item.bookings,
      missed: item.missed,
    }))
    .sort((left, right) => right.bookings - left.bookings)
    .slice(0, 4);
}
