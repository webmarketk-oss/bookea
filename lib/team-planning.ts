import { getActiveCenterContext } from "@/lib/center-access";
import { practitioners as defaultPractitioners } from "@/lib/agenda-data";
import { createClient } from "@/lib/supabase";
import type { Practitioner } from "@/types/agenda";

export const teamAbsenceTypes = [
  "Congé payé",
  "Congé sans solde",
  "Exceptionnel",
  "Vacance",
  "Repos exceptionnel",
  "Arrêt maladie",
  "Autre",
] as const;

export type TeamAbsenceType = (typeof teamAbsenceTypes)[number];

export type TeamAbsence = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
  type: TeamAbsenceType;
};

export type TeamDayHours = {
  endTime: string;
  startTime: string;
  weekday: number;
};

export type TeamSchedule = {
  absenceEndDate: string;
  absenceNote: string;
  absenceStartDate: string;
  absenceType: TeamAbsenceType;
  absences: TeamAbsence[];
  dayHours: TeamDayHours[];
  endTime: string;
  months: 1 | 3 | 6;
  practitionerId: string;
  startDate: string;
  startTime: string;
  workingDays: number[];
};

export const practitionerColorOptions = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-sky-500",
  "bg-lime-500",
  "bg-fuchsia-500",
  "bg-slate-500",
];

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function storageKey(centerId: string) {
  return `bookea-team-planning:${centerId}`;
}

export function emptyTeamSchedule(practitionerId: string): TeamSchedule {
  return {
    practitionerId,
    startDate: todayIso(),
    months: 3,
    workingDays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    dayHours: [],
    absenceStartDate: todayIso(),
    absenceEndDate: todayIso(),
    absenceType: "Congé payé",
    absenceNote: "",
    absences: [],
  };
}

function normalizeAbsenceType(value: unknown): TeamAbsenceType {
  const raw = asString(value);
  return teamAbsenceTypes.includes(raw as TeamAbsenceType)
    ? (raw as TeamAbsenceType)
    : raw === "Repos exceptionnel"
      ? "Repos exceptionnel"
      : "Autre";
}

export function normalizeTeamAbsence(value: unknown): TeamAbsence | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const startDate = asString(row.startDate || row.date).slice(0, 10);
  const endDate = asString(row.endDate || startDate).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return null;
  }

  return {
    id: asString(row.id) || `${startDate}-${endDate}-${asString(row.type)}`,
    startDate,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : startDate,
    type: normalizeAbsenceType(row.type),
    note: asString(row.note || row.motif),
  };
}

export function normalizeTeamSchedule(
  value: unknown,
  fallbackId: string,
): TeamSchedule {
  const row = asRecord(value);
  const base = emptyTeamSchedule(asString(row.practitionerId, fallbackId));
  const workingDays = Array.isArray(row.workingDays)
    ? row.workingDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : base.workingDays;
  const months = Number(row.months);
  const absences = Array.isArray(row.absences)
    ? row.absences
        .map((item) => normalizeTeamAbsence(item))
        .filter((item): item is TeamAbsence => Boolean(item))
    : [];
  const dayHours = Array.isArray(row.dayHours)
    ? row.dayHours
        .map((item) => {
          const hours = asRecord(item);
          const weekday = Number(hours.weekday);
          if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
            return null;
          }
          return {
            weekday,
            startTime: asString(hours.startTime, base.startTime).slice(0, 5),
            endTime: asString(hours.endTime, base.endTime).slice(0, 5),
          } satisfies TeamDayHours;
        })
        .filter((item): item is TeamDayHours => Boolean(item))
    : [];

  return {
    ...base,
    startDate: asString(row.startDate, base.startDate).slice(0, 10),
    months: months === 1 || months === 6 ? months : 3,
    workingDays,
    startTime: asString(row.startTime, base.startTime).slice(0, 5),
    endTime: asString(row.endTime, base.endTime).slice(0, 5),
    dayHours,
    absenceStartDate: asString(row.absenceStartDate || row.absenceDate, base.absenceStartDate).slice(0, 10),
    absenceEndDate: asString(row.absenceEndDate || row.absenceDate, base.absenceEndDate).slice(0, 10),
    absenceType: normalizeAbsenceType(row.absenceType || "Congé payé"),
    absenceNote: asString(row.absenceNote),
    absences,
  };
}

export function normalizeTeamPractitioner(value: unknown): Practitioner | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const name = asString(row.name);

  if (!id || !name) {
    return null;
  }

  const color = asString(row.color);
  return {
    id,
    name,
    role: asString(row.role, "Polyvalente"),
    color: practitionerColorOptions.includes(color)
      ? color
      : practitionerColorOptions[0],
  };
}

export function defaultTeamSchedules(): TeamSchedule[] {
  return defaultPractitioners.map((practitioner) =>
    normalizeTeamSchedule(
      {
        ...emptyTeamSchedule(practitioner.id),
        months: practitioner.id === "samantha" || practitioner.id === "aurelie" ? 6 : 3,
        workingDays:
          practitioner.id === "marie"
            ? [1, 2, 3, 5]
            : practitioner.id === "camille"
              ? [2, 3, 4, 5, 6]
              : practitioner.id === "ines"
                ? [1, 3, 5]
                : practitioner.id === "aurelie"
                  ? [1, 2, 3, 5, 6]
                  : [1, 2, 3, 4, 5],
        startTime:
          practitioner.id === "camille"
            ? "10:00"
            : practitioner.id === "ines"
              ? "09:30"
              : "09:00",
        endTime:
          practitioner.id === "marie"
            ? "17:00"
            : practitioner.id === "camille"
              ? "19:00"
              : practitioner.id === "ines"
                ? "16:30"
                : "18:00",
      },
      practitioner.id,
    ),
  );
}

export function dayHoursForSchedule(schedule: TeamSchedule, weekday: number) {
  return (
    schedule.dayHours.find((item) => item.weekday === weekday) ?? {
      weekday,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    }
  );
}

export function isDateInAbsence(absence: TeamAbsence, date: string) {
  const start = absence.startDate <= absence.endDate ? absence.startDate : absence.endDate;
  const end = absence.endDate >= absence.startDate ? absence.endDate : absence.startDate;
  return date >= start && date <= end;
}

export function isPractitionerWorkingOnDate(schedule: TeamSchedule, date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  const hasAbsence = schedule.absences.some((absence) =>
    isDateInAbsence(absence, date),
  );

  return schedule.workingDays.includes(day) && !hasAbsence;
}

function readLocalTeamPlanning(centerId: string) {
  if (typeof window === "undefined" || !centerId) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey(centerId));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function writeLocalTeamPlanning(
  centerId: string,
  practitioners: Practitioner[],
  schedules: TeamSchedule[],
) {
  if (typeof window === "undefined" || !centerId) {
    return;
  }

  window.localStorage.setItem(
    storageKey(centerId),
    JSON.stringify({ practitioners, schedules }),
  );
}

export function parseTeamPlanning(value: unknown) {
  const record = asRecord(value);
  const practitioners = Array.isArray(record.practitioners)
    ? record.practitioners
        .map((item) => normalizeTeamPractitioner(item))
        .filter((item): item is Practitioner => Boolean(item))
    : [];
  const schedules = Array.isArray(record.schedules)
    ? record.schedules.map((item, index) =>
        normalizeTeamSchedule(
          item,
          practitioners[index]?.id || `praticienne-${index + 1}`,
        ),
      )
    : [];

  return { practitioners, schedules };
}

export async function loadTeamPlanning() {
  const context = await getActiveCenterContext();
  const local = parseTeamPlanning(readLocalTeamPlanning(context.centerId));
  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  const remote = parseTeamPlanning(
    asRecord(asRecord(data?.settings).agenda).team,
  );
  const practitioners =
    remote.practitioners.length > 0
      ? remote.practitioners
      : local.practitioners.length > 0
        ? local.practitioners
        : defaultPractitioners;
  const schedulesSource =
    remote.schedules.length > 0
      ? remote.schedules
      : local.schedules.length > 0
        ? local.schedules
        : defaultTeamSchedules();
  const schedules = practitioners.map(
    (practitioner) =>
      schedulesSource.find((item) => item.practitionerId === practitioner.id) ??
      emptyTeamSchedule(practitioner.id),
  );

  writeLocalTeamPlanning(context.centerId, practitioners, schedules);

  return {
    centerId: context.centerId,
    practitioners,
    schedules,
  };
}

export async function saveTeamPlanning(input: {
  practitioners: Practitioner[];
  schedules: TeamSchedule[];
}) {
  const context = await getActiveCenterContext();
  const practitioners = input.practitioners
    .map((item) => normalizeTeamPractitioner(item))
    .filter((item): item is Practitioner => Boolean(item));
  const schedules = practitioners.map(
    (practitioner) =>
      normalizeTeamSchedule(
        input.schedules.find((item) => item.practitionerId === practitioner.id) ??
          emptyTeamSchedule(practitioner.id),
        practitioner.id,
      ),
  );

  writeLocalTeamPlanning(context.centerId, practitioners, schedules);

  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();
  const currentSettings = asRecord(data?.settings);
  const currentAgenda = asRecord(currentSettings.agenda);
  const { error } = await supabase
    .from("centers")
    .update({
      settings: {
        ...currentSettings,
        agenda: {
          ...currentAgenda,
          team: { practitioners, schedules },
        },
      },
    })
    .eq("id", context.centerId);

  if (error) {
    throw new Error(error.message);
  }

  return { practitioners, schedules };
}
