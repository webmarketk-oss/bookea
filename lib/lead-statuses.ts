import type { LeadStatus } from "@/types/lead";

export const leadStatuses: LeadStatus[] = [
  "Nouveau",
  "Apl en abs",
  "Appel 1",
  "Appel 2",
  "Appel 3",
  "Appel 4",
  "Appel 5",
  "Appel 6",
  "Appel 7",
  "Appel 8",
  "Appel 9",
  "Appel 10",
  "Appel 11",
  "Appel 12",
  "Appel 12+",
  "Pas intéressé",
  "Reviendra vers nous",
  "En réflexion",
  "À relancer",
  "RDV pris",
  "RDV confirmé",
  "No show",
  "Annulation",
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
  "Contre-indications",
  "Message WhatsApp envoyé",
  "SMS envoyé",
  "Message vocal envoyé",
  "Msg vocal laissé + SMS envoyé",
  "Mail envoyé",
  "Mail/SMS Injoignable",
  "Message vocal",
];

export const followUpLeadStatuses: LeadStatus[] = [
  "Nouveau",
  "Apl en abs",
  "Appel 1",
  "Appel 2",
  "Appel 3",
  "Appel 4",
  "Appel 5",
  "Appel 6",
  "Appel 7",
  "Appel 8",
  "Appel 9",
  "Appel 10",
  "Appel 11",
  "Appel 12",
  "Appel 12+",
  "SMS envoyé",
  "Mail envoyé",
  "Message vocal envoyé",
  "Message vocal",
  "Msg vocal laissé + SMS envoyé",
  "À relancer",
];

export const inactiveLeadStatuses: LeadStatus[] = [
  "Pas intéressé",
  "Prospect perdu",
  "Intraitable",
  "Numéro invalide",
  "Doublon",
  "Hors zone",
  "Contre-indications",
  "No show",
];

const leadStatusAliasMap: Record<string, LeadStatus> = {
  PI: "Pas intéressé",
  "Pas intéressé": "Pas intéressé",
  "À rappeler": "À relancer",
  "A rappeler": "À relancer",
  "Souhaite être rappelé(e) plus tard": "À relancer",
  "Souhaite être rappelé(e) plus trad": "À relancer",
  "À relancer": "À relancer",
  "À relancer, RDV PRIS": "RDV pris",
  "À relancer, Reviendra vers nous": "Reviendra vers nous",
  "À relancer, Doublon": "Doublon",
  "RDV PRIS": "RDV pris",
  "RDV fixé": "RDV pris",
  "RDV programmé": "RDV pris",
  "appel en absence": "Apl en abs",
  "appel en absent": "Apl en abs",
  "Appel en absence": "Apl en abs",
  "Apl en absence": "Apl en abs",
  "Acompte validé": "Acompte reçu",
  Client: "Client converti",
  Perdu: "Prospect perdu",
  "msg WA envoyé": "Message WhatsApp envoyé",
  "Msg WA envoyé": "Message WhatsApp envoyé",
  "Message vocal laissé": "Message vocal envoyé",
  "Msg vocal laissé": "Message vocal envoyé",
  "Msg vocal laissé + SMS envoyé": "Msg vocal laissé + SMS envoyé",
  "msg vocal laisser + sms envoyer": "Msg vocal laissé + SMS envoyé",
  "Message vocal laissé + SMS envoyé": "Msg vocal laissé + SMS envoyé",
  "Msg vocal + Mail": "Message vocal",
  "Message vocal + Mail": "Message vocal",
};

export const leadStatusClasses: Record<LeadStatus, string> = {
  Nouveau: "bg-blue-100 text-blue-700 ring-blue-200",
  "Apl en abs": "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "Appel 1": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 2": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 3": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 4": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 5": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 6": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 7": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 8": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 9": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 10": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 11": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 12": "bg-sky-100 text-sky-800 ring-sky-200",
  "Appel 12+": "bg-sky-100 text-sky-800 ring-sky-200",
  "Pas intéressé": "bg-red-700 text-white ring-red-700",
  "Reviendra vers nous": "bg-indigo-100 text-indigo-700 ring-indigo-200",
  "En réflexion": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  "À relancer": "bg-orange-100 text-orange-700 ring-orange-200",
  "RDV pris": "bg-green-100 text-green-700 ring-green-200",
  "RDV confirmé": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "No show": "bg-zinc-800 text-white ring-zinc-800",
  Annulation: "bg-rose-100 text-rose-700 ring-rose-200",
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
  "Contre-indications": "bg-red-700 text-white ring-red-700",
  "Message WhatsApp envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "SMS envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Message vocal envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Msg vocal laissé + SMS envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Mail envoyé": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Mail/SMS Injoignable": "bg-zinc-100 text-zinc-800 ring-zinc-200",
  "Message vocal": "bg-cyan-100 text-cyan-800 ring-cyan-200",
};

function mapOneLeadStatus(raw: string): LeadStatus | "" {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if ((leadStatuses as readonly string[]).includes(value)) {
    return value as LeadStatus;
  }
  const mapped = leadStatusAliasMap[value];
  if (mapped) {
    return mapped;
  }
  const lower = value.toLowerCase();
  const aliasMatch = Object.entries(leadStatusAliasMap).find(
    ([alias]) => alias.toLowerCase() === lower,
  );
  if (aliasMatch) {
    return aliasMatch[1];
  }
  const canonicalMatch = leadStatuses.find(
    (status) => status.toLowerCase() === lower,
  );
  if (canonicalMatch) {
    return canonicalMatch;
  }
  if (/appel en abs|apl en abs/i.test(value)) {
    return "Apl en abs";
  }
  if (/\brdv pris\b/i.test(value)) {
    return "RDV pris";
  }
  return "";
}

const COMBINED_STATUS_PRIORITY: LeadStatus[] = [
  "Vendu",
  "RDV confirmé",
  "RDV pris",
  "Pas intéressé",
  "Doublon",
  "Reviendra vers nous",
  "À relancer",
  "Apl en abs",
];

export function normalizeLeadStatus(value?: string | null): LeadStatus {
  const raw = (value || "").trim();
  if (!raw) {
    return "Nouveau";
  }

  const direct = mapOneLeadStatus(raw);
  if (direct) {
    return direct;
  }

  if (raw.includes(",")) {
    const mapped = raw
      .split(",")
      .map((part) => mapOneLeadStatus(part))
      .filter((status): status is LeadStatus => Boolean(status));
    const preferred = COMBINED_STATUS_PRIORITY.find((status) =>
      mapped.includes(status),
    );
    if (preferred) {
      return preferred;
    }
    if (mapped[0]) {
      return mapped[0];
    }
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

/** Trait fin, même teinte que l’étiquette, pour les lignes du menu. */
const leadStatusMenuClasses: Record<LeadStatus, string> = {
  Nouveau: "border-blue-400 text-blue-700",
  "Apl en abs": "border-cyan-500 text-cyan-800",
  "Appel 1": "border-sky-400 text-sky-800",
  "Appel 2": "border-sky-400 text-sky-800",
  "Appel 3": "border-sky-400 text-sky-800",
  "Appel 4": "border-sky-400 text-sky-800",
  "Appel 5": "border-sky-400 text-sky-800",
  "Appel 6": "border-sky-400 text-sky-800",
  "Appel 7": "border-sky-400 text-sky-800",
  "Appel 8": "border-sky-400 text-sky-800",
  "Appel 9": "border-sky-400 text-sky-800",
  "Appel 10": "border-sky-400 text-sky-800",
  "Appel 11": "border-sky-400 text-sky-800",
  "Appel 12": "border-sky-400 text-sky-800",
  "Appel 12+": "border-sky-400 text-sky-800",
  "Pas intéressé": "border-red-600 text-red-700",
  "Reviendra vers nous": "border-indigo-400 text-indigo-700",
  "En réflexion": "border-yellow-500 text-yellow-800",
  "À relancer": "border-orange-400 text-orange-700",
  "RDV pris": "border-green-500 text-green-700",
  "RDV confirmé": "border-emerald-500 text-emerald-700",
  "No show": "border-zinc-700 text-zinc-800",
  Annulation: "border-rose-400 text-rose-700",
  "Client converti": "border-emerald-600 text-emerald-800",
  "Acompte envoyé": "border-amber-400 text-amber-700",
  "Acompte reçu": "border-emerald-500 text-emerald-700",
  "Acompte en attente": "border-yellow-500 text-yellow-800",
  Devis: "border-cyan-400 text-cyan-700",
  Vendu: "border-lime-500 text-lime-700",
  "Prospect perdu": "border-red-600 text-red-700",
  Intraitable: "border-red-600 text-red-700",
  "Numéro invalide": "border-red-600 text-red-700",
  Doublon: "border-red-600 text-red-700",
  "Hors zone": "border-red-600 text-red-700",
  "Contre-indications": "border-red-600 text-red-700",
  "Message WhatsApp envoyé": "border-zinc-400 text-zinc-700",
  "SMS envoyé": "border-zinc-400 text-zinc-700",
  "Message vocal envoyé": "border-zinc-400 text-zinc-700",
  "Msg vocal laissé + SMS envoyé": "border-zinc-400 text-zinc-700",
  "Mail envoyé": "border-zinc-400 text-zinc-700",
  "Mail/SMS Injoignable": "border-zinc-400 text-zinc-700",
  "Message vocal": "border-cyan-500 text-cyan-800",
};

export function leadStatusMenuClassName(status: string) {
  return (
    leadStatusMenuClasses[status as LeadStatus] ??
    "border-slate-300 text-slate-700"
  );
}

export function leadStatusSelectOptions(current: string) {
  if ((leadStatuses as readonly string[]).includes(current)) {
    return leadStatuses;
  }

  return [current as LeadStatus, ...leadStatuses];
}
