import type { BillingInvoice } from "./billing-supabase";
import type { Appointment, Practitioner } from "../types/agenda";
import type { Lead } from "../types/lead";

export const PRACTITIONER_SALE_MIN_EUR = 100;

export const practitionerSoldStatuses = ["Vendu", "Client", "Client converti"];
export const practitionerBookedStatuses = [
  "RDV programmé",
  "RDV pris",
  "RDV fixé",
  "RDV confirmé",
  "Acompte envoyé",
  "Acompte reçu",
  "Acompte validé",
  "Acompte en attente",
];
const honoredStatuses = new Set([
  "Confirmé",
  "Présent",
  "Terminé",
  "Vendu",
  "En cours",
]);

export type PractitionerStatRow = {
  id: string;
  name: string;
  color: string;
  leads: number;
  rdvLeads: number;
  sold: number;
  devis: number;
  invoices: number;
  appointments: number;
  honored: number;
  revenue: number;
  rdvRate: number;
  conversionRate: number;
  attendanceRate: number;
};

export function isLeadWithBookedRdv(lead: Pick<Lead, "status">) {
  return (
    practitionerBookedStatuses.includes(lead.status) ||
    practitionerSoldStatuses.includes(lead.status)
  );
}

export function isBookableAppointment(appointment: Pick<Appointment, "kind" | "status">) {
  if (appointment.kind && appointment.kind !== "Rendez-vous") {
    return false;
  }
  return appointment.status !== "Annulation";
}

export function isHonoredAppointment(appointment: Pick<Appointment, "status">) {
  return honoredStatuses.has(appointment.status);
}

export function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function namesMatch(left: string, right: string) {
  const first = normalizePersonName(left);
  const second = normalizePersonName(right);
  if (!first || !second) {
    return false;
  }
  return first === second || first.startsWith(second) || second.startsWith(first);
}

function isSaleOverMinimum(amount: number) {
  return Number(amount) > PRACTITIONER_SALE_MIN_EUR;
}

function compactIdentity(value?: string | null) {
  return normalizePersonName(String(value || ""));
}

function last9Phone(value?: string | null) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function matchLeadForInvoice(invoice: BillingInvoice, leads: Lead[]) {
  const email = compactIdentity(invoice.email);
  if (email) {
    const byEmail = leads.find((lead) => compactIdentity(lead.email) === email);
    if (byEmail) {
      return byEmail;
    }
  }

  const phone = last9Phone(invoice.phone);
  if (phone.length >= 9) {
    const byPhone = leads.find((lead) => last9Phone(lead.phone) === phone);
    if (byPhone) {
      return byPhone;
    }
  }

  const name = compactIdentity(invoice.client);
  if (!name) {
    return undefined;
  }

  return leads.find(
    (lead) => compactIdentity(`${lead.firstName} ${lead.lastName}`) === name,
  );
}

export function buildPractitionerStats(
  appointments: Appointment[],
  leads: Lead[],
  team: Practitioner[],
  invoices: BillingInvoice[] = [],
): PractitionerStatRow[] {
  const rows = new Map<string, PractitionerStatRow>();

  function ensure(id: string, name: string, color: string) {
    const existing = rows.get(id);
    if (existing) {
      return existing;
    }
    const row: PractitionerStatRow = {
      id,
      name,
      color,
      leads: 0,
      rdvLeads: 0,
      sold: 0,
      devis: 0,
      invoices: 0,
      appointments: 0,
      honored: 0,
      revenue: 0,
      rdvRate: 0,
      conversionRate: 0,
      attendanceRate: 0,
    };
    rows.set(id, row);
    return row;
  }

  for (const practitioner of team) {
    ensure(practitioner.id, practitioner.name, practitioner.color);
  }

  for (const lead of leads) {
    const commercial = lead.commercial.trim() || "Non attribué";
    const matched = team.find((practitioner) =>
      namesMatch(practitioner.name, commercial),
    );
    const row = matched
      ? ensure(matched.id, matched.name, matched.color)
      : ensure(
          `lead:${normalizePersonName(commercial)}`,
          commercial,
          "bg-slate-400",
        );
    row.leads += 1;
    if (isLeadWithBookedRdv(lead)) {
      row.rdvLeads += 1;
    }
    if (practitionerSoldStatuses.includes(lead.status)) {
      row.sold += 1;
      row.revenue += Number(lead.dealAmount) || 0;
    }
    if (lead.status === "Devis" && isSaleOverMinimum(lead.dealAmount)) {
      row.devis += 1;
    }
  }

  for (const appointment of appointments) {
    if (!isBookableAppointment(appointment)) {
      continue;
    }

    const byId = team.find(
      (practitioner) => practitioner.id === appointment.practitionerId,
    );
    const byName = appointment.practitionerName
      ? team.find((practitioner) =>
          namesMatch(practitioner.name, appointment.practitionerName || ""),
        )
      : undefined;
    const matched = byId ?? byName;
    const fallbackName =
      appointment.practitionerName?.trim() ||
      matched?.name ||
      "Non attribué";
    const row = matched
      ? ensure(matched.id, matched.name, matched.color)
      : ensure(
          `rdv:${normalizePersonName(fallbackName)}`,
          fallbackName,
          "bg-slate-400",
        );
    row.appointments += 1;
    if (isHonoredAppointment(appointment)) {
      row.honored += 1;
    }
  }

  const countedDevisLeads = new Set<string>();
  for (const lead of leads) {
    if (lead.status === "Devis" && isSaleOverMinimum(lead.dealAmount)) {
      countedDevisLeads.add(lead.id);
    }
  }

  for (const invoice of invoices) {
    if (invoice.status === "Annulée" || !isSaleOverMinimum(invoice.total)) {
      continue;
    }
    const lead = matchLeadForInvoice(invoice, leads);
    if (!lead) {
      continue;
    }
    const commercial = lead.commercial.trim() || "Non attribué";
    const matched = team.find((practitioner) =>
      namesMatch(practitioner.name, commercial),
    );
    const row = matched
      ? ensure(matched.id, matched.name, matched.color)
      : ensure(
          `invoice:${normalizePersonName(commercial)}`,
          commercial,
          "bg-slate-400",
        );

    if (
      invoice.type === "Devis" &&
      !(lead && countedDevisLeads.has(lead.id))
    ) {
      row.devis += 1;
    }
    if (invoice.type === "Facture finale") {
      row.invoices += 1;
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      rdvRate: ratio(row.rdvLeads, row.leads),
      conversionRate: ratio(row.sold, row.leads),
      attendanceRate: ratio(row.honored, row.appointments),
    }))
    .filter(
      (row) =>
        team.some((practitioner) => practitioner.id === row.id) ||
        row.leads > 0 ||
        row.appointments > 0 ||
        row.devis > 0 ||
        row.invoices > 0,
    )
    .sort(
      (left, right) =>
        right.appointments - left.appointments || right.leads - left.leads,
    );
}

export function summarizePractitionerStats(rows: PractitionerStatRow[]) {
  const leads = rows.reduce((sum, row) => sum + row.leads, 0);
  const rdvLeads = rows.reduce((sum, row) => sum + row.rdvLeads, 0);
  const sold = rows.reduce((sum, row) => sum + row.sold, 0);
  const devis = rows.reduce((sum, row) => sum + row.devis, 0);
  const invoices = rows.reduce((sum, row) => sum + row.invoices, 0);
  const appointments = rows.reduce((sum, row) => sum + row.appointments, 0);
  const honored = rows.reduce((sum, row) => sum + row.honored, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);

  return {
    leads,
    rdvLeads,
    sold,
    devis,
    invoices,
    appointments,
    honored,
    revenue,
    rdvRate: ratio(rdvLeads, leads),
    conversionRate: ratio(sold, leads),
    attendanceRate: ratio(honored, appointments),
  };
}

export function ratio(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
