import { LeadStatus } from "@/types/lead";

export const leadStatuses: LeadStatus[] = [
  "Nouveau",
  "Apl en abs",
  "Pas intéressé",
  "Reviendra vers nous",
  "En réflexion",
  "À relancer",
  "RDV pris",
  "RDV confirmé",
  "No show",
  "Client converti",
  "Acompte envoyé",
  "Acompte reçu",
  "Acompte en attente",
  "Devis",
  "Vendu",
  "Prospect perdu",
  "Intraitable",
  "Numéro invalide",
  "Doublon",
  "Hors zone",
  "Message WhatsApp envoyé",
  "SMS envoyé",
  "Message vocal envoyé",
  "Mail envoyé",
  "Mail/SMS Injoignable",
  "Message vocal",
];

export const inactiveLeadStatuses: LeadStatus[] = [
  "Pas intéressé",
  "Prospect perdu",
  "Intraitable",
  "Numéro invalide",
  "Doublon",
  "Hors zone",
  "No show",
];

const leadStatusAliasMap: Record<string, LeadStatus> = {
  PI: "Pas intéressé",
  "Pas intéressé": "Pas intéressé",
  "À rappeler": "À relancer",
  "A rappeler": "À relancer",
  "Souhaite être rappelé(e) plus tard": "À relancer",
  "À relancer": "À relancer",
  "RDV fixé": "RDV pris",
  "RDV programmé": "RDV pris",
  "Acompte validé": "Acompte reçu",
  Client: "Client converti",
  Perdu: "Prospect perdu",
  "Message vocal laissé": "Message vocal envoyé",
  "Msg vocal + Mail": "Message vocal",
  "Message vocal + Mail": "Message vocal",
};

export const leadStatusClasses: Record<LeadStatus, string> = {
  Nouveau: "bg-blue-100 text-blue-700 ring-blue-200",
  "Apl en abs": "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "Pas intéressé": "bg-red-700 text-white ring-red-700",
  "Reviendra vers nous": "bg-indigo-100 text-indigo-700 ring-indigo-200",
  "En réflexion": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  "À relancer": "bg-orange-100 text-orange-700 ring-orange-200",
  "RDV pris": "bg-green-100 text-green-700 ring-green-200",
  "RDV confirmé": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "No show": "bg-zinc-800 text-white ring-zinc-800",
  "Client converti": "bg-emerald-700 text-white ring-emerald-700",
  "Acompte envoyé": "bg-amber-100 text-amber-700 ring-amber-200",
  "Acompte reçu": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Acompte en attente": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  Devis: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  Vendu: "bg-lime-100 text-lime-700 ring-lime-200",
  "Prospect perdu": "bg-red-700 text-white ring-red-700",
  Intraitable: "bg-red-700 text-white ring-red-700",
  "Numéro invalide": "bg-red-700 text-white ring-red-700",
  Doublon: "bg-red-700 text-white ring-red-700",
  "Hors zone": "bg-red-700 text-white ring-red-700",
  "Message WhatsApp envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "SMS envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Message vocal envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Mail envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Mail/SMS Injoignable": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Message vocal": "bg-cyan-100 text-cyan-800 ring-cyan-200",
};

export function normalizeLeadStatus(value?: string | null): LeadStatus {
  const raw = (value || "").trim();
  if (!raw) {
    return "Nouveau";
  }

  if ((leadStatuses as readonly string[]).includes(raw)) {
    return raw as LeadStatus;
  }

  const mapped = leadStatusAliasMap[raw];
  if (mapped) {
    return mapped;
  }

  const lower = raw.toLowerCase();
  const aliasMatch = Object.entries(leadStatusAliasMap).find(
    ([alias]) => alias.toLowerCase() === lower
  );
  if (aliasMatch) {
    return aliasMatch[1];
  }

  const canonicalMatch = leadStatuses.find(
    (status) => status.toLowerCase() === lower
  );
  if (canonicalMatch) {
    return canonicalMatch;
  }

  return "Nouveau";
}

export function isInactiveLeadStatus(status: string) {
  return inactiveLeadStatuses.includes(normalizeLeadStatus(status));
}

export function leadStatusClassName(status: string) {
  return (
    leadStatusClasses[status as LeadStatus] ??
    "bg-slate-100 text-slate-700 ring-slate-200"
  );
}

export function leadStatusSelectOptions(current: string) {
  if ((leadStatuses as readonly string[]).includes(current)) {
    return leadStatuses;
  }

  return [current as LeadStatus, ...leadStatuses];
}
