import { normalizeLeadStatus } from "./lead-statuses.ts";

/**
 * Statuts encore dans le tunnel RDV / acompte.
 * Tout ce qui vient après « Acompte reçu » (devis, vendu, no-show, annulation…)
 * est hors calcul du % acompte validé.
 */
const DEPOSIT_FUNNEL_STATUSES = new Set([
  "RDV pris",
  "RDV confirmé",
  "RDV programmé",
  "RDV fixé",
  "Acompte envoyé",
  "Acompte en attente",
  "Acompte reçu",
  "Acompte validé",
]);

function ratio(value: number, total: number) {
  if (total === 0) {
    return 0;
  }
  return (value / total) * 100;
}

export function isDepositFunnelStatus(status?: string | null) {
  const raw = String(status || "").trim();
  if (DEPOSIT_FUNNEL_STATUSES.has(raw)) {
    return true;
  }
  const normalized = normalizeLeadStatus(raw);
  return (
    normalized === "RDV pris" ||
    normalized === "RDV confirmé" ||
    normalized === "Acompte envoyé" ||
    normalized === "Acompte en attente" ||
    normalized === "Acompte reçu"
  );
}

export function isValidatedDepositStatus(status?: string | null) {
  const raw = String(status || "").trim();
  if (raw === "Acompte reçu" || raw === "Acompte validé") {
    return true;
  }
  return normalizeLeadStatus(raw) === "Acompte reçu";
}

/** Acomptes reçus / RDV encore ouverts, jusqu’à acompte reçu uniquement. */
export function validatedDepositRate(leads: Array<{ status: string }>) {
  const funnel = leads.filter((lead) => isDepositFunnelStatus(lead.status));
  const validated = funnel.filter((lead) =>
    isValidatedDepositStatus(lead.status),
  );
  return ratio(validated.length, funnel.length);
}
