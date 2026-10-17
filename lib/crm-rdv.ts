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

export function parseVisitDate(events: RdvDateEvent[]): string | undefined {
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
    latest = { at: stamp, value: String(event.to_value || "").trim().slice(0, 10) };
  }
  if (!latest) {
    return undefined;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(latest.value) ? latest.value : "";
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

export function leadWithVisitDate(lead: Lead, date: string): Lead {
  const previous = displayVisitDate(lead);
  const appointmentId = date
    ? appointmentIdForVisitDate(lead.appointments, previous)
    : undefined;
  return {
    ...lead,
    visitDate: date,
    appointments:
      appointmentId && date
        ? (lead.appointments ?? []).map((item) =>
            item.id === appointmentId ? { ...item, date } : item,
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
