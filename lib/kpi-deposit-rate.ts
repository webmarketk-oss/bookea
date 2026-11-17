/**
 * Statuts encore dans le tunnel RDV / acompte.
 * Tout ce qui vient après « Acompte reçu » (devis, vendu, no-show, annulation…)
 * est hors calcul du % acompte validé.
 */
const DEPOSIT_FUNNEL_STATUSES = new Set([
  "rdv pris",
  "rdv confirme",
  "rdv programme",
  "rdv fixe",
  "acompte envoye",
  "acompte en attente",
  "acompte recu",
  "acompte valide",
]);

function foldStatus(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ratio(value: number, total: number) {
  if (total === 0) {
    return 0;
  }
  return (value / total) * 100;
}

export function isDepositFunnelStatus(status?: string | null) {
  return DEPOSIT_FUNNEL_STATUSES.has(foldStatus(status));
}

export function isValidatedDepositStatus(status?: string | null) {
  const folded = foldStatus(status);
  return folded === "acompte recu" || folded === "acompte valide";
}

/** Acomptes reçus / RDV encore ouverts, jusqu’à acompte reçu uniquement. */
export function validatedDepositRate(leads: Array<{ status: string }>) {
  const funnel = leads.filter((lead) => isDepositFunnelStatus(lead.status));
  const validated = funnel.filter((lead) =>
    isValidatedDepositStatus(lead.status),
  );
  return ratio(validated.length, funnel.length);
}
