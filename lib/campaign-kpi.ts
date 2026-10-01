import type { BillingInvoice } from "@/lib/billing-supabase";
import type { Lead } from "@/types/lead";

export type CampaignKpiRow = {
  name: string;
  leads: number;
  rdv: number;
  devis: number;
  invoices: number;
};

function compactIdentity(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function last9Phone(value?: string | null) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

export function campaignLabel(lead: Lead) {
  return lead.campaign.trim() || "Sans campagne";
}

export function matchLeadForInvoice(invoice: BillingInvoice, leads: Lead[]) {
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

export function isActiveInvoice(invoice: BillingInvoice) {
  return invoice.status !== "Annulée";
}

export function buildCampaignKpiRows(
  leads: Lead[],
  invoices: BillingInvoice[],
  allLeads: Lead[],
  hasTakenRdv: (lead: Lead) => boolean,
): CampaignKpiRow[] {
  const groups = new Map<string, CampaignKpiRow>();
  const devisLeadIds = new Set<string>();

  function ensure(name: string) {
    const current = groups.get(name);
    if (current) {
      return current;
    }
    const next = { name, leads: 0, rdv: 0, devis: 0, invoices: 0 };
    groups.set(name, next);
    return next;
  }

  for (const lead of leads) {
    const row = ensure(campaignLabel(lead));
    row.leads += 1;
    if (hasTakenRdv(lead)) {
      row.rdv += 1;
    }
    if (lead.status === "Devis") {
      row.devis += 1;
      devisLeadIds.add(lead.id);
    }
  }

  for (const invoice of invoices) {
    if (!isActiveInvoice(invoice)) {
      continue;
    }
    const lead = matchLeadForInvoice(invoice, allLeads);
    const row = ensure(lead ? campaignLabel(lead) : "Sans campagne");
    if (invoice.type === "Devis" && !(lead && devisLeadIds.has(lead.id))) {
      row.devis += 1;
    }
    if (invoice.type === "Facture finale") {
      row.invoices += 1;
    }
  }

  return [...groups.values()].sort((left, right) => right.leads - left.leads);
}
