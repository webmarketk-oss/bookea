import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export type CenterDayHours = {
  weekday: number;
  label: string;
  startTime: string;
  endTime: string;
  closed: boolean;
};

const weekDays = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mer", value: 3 },
  { label: "Jeu", value: 4 },
  { label: "Ven", value: 5 },
  { label: "Sam", value: 6 },
  { label: "Dim", value: 0 },
];

export const defaultCenterDayHours: CenterDayHours[] = weekDays.map((day) => ({
  weekday: day.value,
  label: day.label,
  startTime: "08:00",
  endTime: "19:00",
  closed: false,
}));

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeCenterDayHours(value: unknown): CenterDayHours[] {
  const list = Array.isArray(value) ? value : [];

  return defaultCenterDayHours.map((fallback) => {
    const found = list.find(
      (item) =>
        item &&
        typeof item === "object" &&
        Number((item as { weekday?: unknown; day?: unknown }).weekday ??
          (item as { day?: unknown }).day) === fallback.weekday,
    ) as
      | {
          startTime?: string;
          start?: string;
          endTime?: string;
          end?: string;
          closed?: boolean;
        }
      | undefined;

    if (!found) {
      return fallback;
    }

    return {
      weekday: fallback.weekday,
      label: fallback.label,
      startTime: String(found.startTime || found.start || fallback.startTime).slice(
        0,
        5,
      ),
      endTime: String(found.endTime || found.end || fallback.endTime).slice(0, 5),
      closed: Boolean(found.closed),
    };
  });
}

export function readCenterHoursFromSettings(settings: unknown) {
  const record = asRecord(settings);
  const agenda = asRecord(record.agenda);

  return normalizeCenterDayHours(
    agenda.hours ?? record.hours ?? record.agendaHours,
  );
}

export async function loadCenterHours() {
  const context = await getActiveCenterContext();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return readCenterHoursFromSettings(data?.settings);
}

export async function saveCenterHours(hours: CenterDayHours[]) {
  const context = await getActiveCenterContext();
  const nextHours = normalizeCenterDayHours(hours);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
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
          hours: nextHours,
        },
      },
    })
    .eq("id", context.centerId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return nextHours;
}
