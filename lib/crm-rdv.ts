import type { Lead, LeadAppointment, LeadStatus } from "../types/lead.ts";

const BOOKED_STATUSES = new Set<LeadStatus>([
  "RDV pris",
  "RDV confirmé",
  "Acompte envoyé",
  "Acompte reçu",
  "Acompte en attente",
]);

export const RDV_DATE_EVENT = "rdv_date";

export function bookedHistoryStatuses(): LeadStatus[] {
  return [...BOOKED_STATUSES, ...VISIT_FOLLOW_UP_STATUSES];
}

const VISIT_FOLLOW_UP_STATUSES = new Set<LeadStatus>([
  "Devis",
  "Vendu",
  "Client converti",
  "No show",
  "Annulation",
]);

type RdvDateEvent = {
  event_type: string;
  to_value?: string | null;
  created_at: string;
};

function latestVisitValue(events: RdvDateEvent[]): string | undefined {
  let latest: { at: number; value: string } | null = null;
  for (const event of events) {
    if (event.event_type !== RDV_DATE_EVENT) {
      continue;
    }
    const at = Date.parse(event.created_at);
    const stamp = Number.isNaN(at) ? 0 : at;
    if (latest && latest.at >= stamp) {
      continue;
    }
    latest = { at: stamp, value: String(event.to_value || "").trim() };
  }
  return latest ? latest.value : undefined;
}

export function parseVisitDate(events: RdvDateEvent[]): string | undefined {
  const value = latestVisitValue(events);
  if (value === undefined) {
    return undefined;
  }
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** Heure saisie avec la date (`AAAA-MM-JJTHH:mm`). Vide si la date n’a pas d’heure. */
export function parseVisitTime(events: RdvDateEvent[]): string | undefined {
  const value = latestVisitValue(events);
  if (value === undefined) {
    return undefined;
  }
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

export function visitEventValue(date: string, time: string) {
  const day = date.trim().slice(0, 10);
  const clock = time.trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return "";
  }
  return /^\d{2}:\d{2}$/.test(clock) ? `${day}T${clock}` : day;
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function logShowsBookedVisit(lead: Lead) {
  return lead.activityLog.some((activity) => {
    if (activity.type === "comment") {
      return false;
    }
    const text = activity.text.trim();
    const arrow = text.match(/→\s*([^.\n]+)/);
    const target = (arrow?.[1] || text) as LeadStatus;
    if (BOOKED_STATUSES.has(target) || VISIT_FOLLOW_UP_STATUSES.has(target)) {
      return true;
    }
    return /réservation publique confirmée|rdv posé dans l'agenda|acompte\s+(envoyé|reçu|validé|posé|en attente)|posé\s+acompte/i.test(
      text,
    );
  });
}

export function appointmentVisitDate(lead: Lead): string {
  const dates = (lead.appointments ?? [])
    .map((item) => String(item.date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (!dates.length) {
    return "";
  }
  const today = todayIso();
  return dates.find((date) => date >= today) || dates[dates.length - 1];
}

/** Date affichée : saisie CRM, sinon le rendez-vous d’agenda le plus proche. */
export function displayVisitDate(lead: Lead): string {
  if (lead.visitDate !== undefined) {
    return lead.visitDate;
  }
  return appointmentVisitDate(lead);
}

/** Heure affichée : saisie CRM, sinon l’heure du rendez-vous d’agenda à cette date. */
export function displayVisitTime(lead: Lead): string {
  if (lead.visitTime) {
    return lead.visitTime.slice(0, 5);
  }
  const date = displayVisitDate(lead);
  if (!date) {
    return "";
  }
  const match = (lead.appointments ?? []).find(
    (item) => item.date.slice(0, 10) === date && item.start,
  );
  return match?.start?.slice(0, 5) || "";
}

export function isEverBookedLead(lead: Lead): boolean {
  if (lead.visitDate) {
    return true;
  }
  if (BOOKED_STATUSES.has(lead.status) || VISIT_FOLLOW_UP_STATUSES.has(lead.status)) {
    return true;
  }
  if ((lead.appointments ?? []).some((item) => item.date || item.bookedOn)) {
    return true;
  }
  return logShowsBookedVisit(lead);
}

export function appointmentIdForVisitDate(
  appointments: LeadAppointment[] | undefined,
  previousDate: string,
): string | undefined {
  const list = appointments ?? [];
  if (!list.length) {
    return undefined;
  }
  const previous = previousDate.slice(0, 10);
  const match = list.find((item) => item.date === previous);
  if (match) {
    return match.id;
  }
  if (list.length === 1) {
    return list[0].id;
  }
  const dated = list
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  const today = todayIso();
  const upcoming = dated.find((item) => item.date >= today);
  return (upcoming || dated[dated.length - 1] || list[0]).id;
}

export function leadWithVisitDate(lead: Lead, date: string, time?: string): Lead {
  const previous = displayVisitDate(lead);
  const nextTime = time !== undefined ? time.slice(0, 5) : displayVisitTime(lead);
  const appointmentId = date
    ? appointmentIdForVisitDate(lead.appointments, previous)
    : undefined;
  return {
    ...lead,
    visitDate: date,
    visitTime: date ? nextTime : "",
    appointments:
      appointmentId && date
        ? (lead.appointments ?? []).map((item) =>
            item.id === appointmentId
              ? { ...item, date, ...(nextTime ? { start: nextTime } : {}) }
              : item,
          )
        : lead.appointments,
  };
}

export function compareBookedLeads(left: Lead, right: Lead): number {
  const leftDate = displayVisitDate(left);
  const rightDate = displayVisitDate(right);
  if (!leftDate && rightDate) {
    return -1;
  }
  if (leftDate && !rightDate) {
    return 1;
  }
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  const leftName = `${left.lastName} ${left.firstName}`;
  const rightName = `${right.lastName} ${right.firstName}`;
  return leftName.localeCompare(rightName, "fr");
}
