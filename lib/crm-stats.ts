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

const rdvBookedStatuses = new Set<LeadStatus>(["RDV pris", "RDV confirmé"]);

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
