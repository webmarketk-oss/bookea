import { normalizeLeadStatus } from "@/lib/lead-statuses";
import type { Lead, LeadActivity, LeadStatus } from "@/types/lead";

export type CrmQuickFilter =
  | "Tous"
  | "Aujourd'hui"
  | "Hier"
  | "7 derniers jours"
  | "Ce mois"
  | "RDV aujourd'hui"
  | "RDV hier"
  | "RDV 7 jours";

export const rdvBookedStatusList: LeadStatus[] = [
  "RDV pris",
  "RDV confirmé",
  "Acompte envoyé",
  "Acompte reçu",
  "Acompte en attente",
];

const rdvBookedStatuses = new Set<LeadStatus>(rdvBookedStatusList);

export function isRdvBookedStatus(status?: string | null) {
  return rdvBookedStatuses.has(normalizeLeadStatus(status));
}

export function todayIso() {
  return toLocalIsoDate(new Date());
}

export function monthStartIso(date = todayIso()) {
  return `${date.slice(0, 7)}-01`;
}

export function addDaysIso(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return toLocalIsoDate(new Date(year, month - 1, day + days));
}

export function toLocalIsoDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateOnlyIso(value?: string | Date | null) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : toLocalIsoDate(value);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const prefix = trimmed.slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(prefix) && (trimmed[10] === "T" || trimmed[10] === " ")) {
    return toLocalIsoDate(trimmed);
  }

  const localized = toLocalIsoDate(trimmed);
  return /^\d{4}-\d{2}-\d{2}$/.test(localized) ? localized : undefined;
}

export function reminderDayOffset(date?: string | null, today = todayIso()) {
  const reminderDate = toDateOnlyIso(date);

  if (!reminderDate) {
    return null;
  }

  const [reminderYear, reminderMonth, reminderDay] = reminderDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const reminderUtc = Date.UTC(reminderYear, reminderMonth - 1, reminderDay);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);

  return Math.round((reminderUtc - todayUtc) / 86_400_000);
}

export function isReminderDueOn(date?: string | null, today = todayIso()) {
  const offset = reminderDayOffset(date, today);
  return offset !== null && offset <= 0;
}

export function formatReminderDayLabel(date?: string | null, today = todayIso()) {
  const offset = reminderDayOffset(date, today);

  if (offset === null) {
    return null;
  }

  if (offset <= 0) {
    return "J";
  }

  return `J+${offset}`;
}

export function isLeadCreatedToday(lead: Lead) {
  return isLeadCreatedOn(lead, todayIso());
}

export function isLeadCreatedOn(lead: Lead, date: string) {
  if (
    date === todayIso() &&
    lead.createdAt.toLowerCase().includes("aujourd")
  ) {
    return true;
  }

  if (
    date === addDaysIso(todayIso(), -1) &&
    lead.createdAt.toLowerCase().includes("hier")
  ) {
    return true;
  }

  return lead.createdDate === date;
}

export function isLeadCreatedBetween(
  lead: Lead,
  startDate: string,
  endDate: string,
) {
  if (lead.createdAt.toLowerCase().includes("aujourd")) {
    return isDateInRange(todayIso(), startDate, endDate);
  }

  if (lead.createdAt.toLowerCase().includes("hier")) {
    return isDateInRange(addDaysIso(todayIso(), -1), startDate, endDate);
  }

  return isDateInRange(lead.createdDate, startDate, endDate);
}

export function isLeadCreatedSince(lead: Lead, startDate: string) {
  return isLeadCreatedBetween(lead, startDate, todayIso());
}

export function getLeadRdvTakenDates(lead: Lead) {
  return Array.from(
    new Set(
      lead.activityLog
        .filter(isRdvTakenActivity)
        .map((activity) => activityDateToIso(activity))
        .filter((date): date is string => Boolean(date)),
    ),
  ).sort();
}

export function isLeadRdvTakenOn(lead: Lead, date: string) {
  return getLeadRdvTakenDates(lead).includes(date);
}

export function isLeadRdvTakenBetween(
  lead: Lead,
  startDate: string,
  endDate: string,
) {
  return getLeadRdvTakenDates(lead).some((takenDate) =>
    isDateInRange(takenDate, startDate, endDate),
  );
}

export function matchesCrmQuickFilter(lead: Lead, filter: CrmQuickFilter) {
  if (filter === "Tous") {
    return true;
  }

  const today = todayIso();
  const yesterday = addDaysIso(today, -1);
  const last7Start = addDaysIso(today, -6);

  if (filter === "Aujourd'hui") {
    return isLeadCreatedOn(lead, today);
  }

  if (filter === "Hier") {
    return isLeadCreatedOn(lead, yesterday);
  }

  if (filter === "7 derniers jours") {
    return isLeadCreatedBetween(lead, last7Start, today);
  }

  if (filter === "Ce mois") {
    return isLeadCreatedSince(lead, monthStartIso(today));
  }

  if (filter === "RDV aujourd'hui") {
    return isLeadRdvTakenOn(lead, today);
  }

  if (filter === "RDV hier") {
    return isLeadRdvTakenOn(lead, yesterday);
  }

  return isLeadRdvTakenBetween(lead, last7Start, today);
}

function isRdvTakenActivity(activity: LeadActivity) {
  if (activity.type === "comment") {
    return false;
  }

  const text = activity.text.trim();
  const arrowMatch = text.match(/→\s*([^.\n]+)/);

  if (arrowMatch) {
    return rdvBookedStatuses.has(normalizeLeadStatus(arrowMatch[1].trim()));
  }

  if (rdvBookedStatuses.has(normalizeLeadStatus(text))) {
    return true;
  }

  return /réservation publique confirmée|rdv posé dans l'agenda/i.test(text);
}

function activityDateToIso(activity: LeadActivity) {
  if (activity.occurredAt) {
    return toLocalIsoDate(activity.occurredAt);
  }

  const label = activity.date.toLowerCase();

  if (label.includes("aujourd")) {
    return todayIso();
  }

  if (label.includes("hier")) {
    return addDaysIso(todayIso(), -1);
  }

  const withYear = activity.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (withYear) {
    const [, day, month, year] = withYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const shortDate = activity.date.match(/(\d{1,2})\/(\d{1,2})/);
  if (!shortDate) {
    return null;
  }

  const [, day, month] = shortDate;
  return `${new Date().getFullYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isDateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}
