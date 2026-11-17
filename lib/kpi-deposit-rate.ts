/**
 * % acompte = reçus / (reçus + en attente + envoyés).
 * Un RDV sans acompte, un devis, une vente, un no-show ou une annulation
 * ne rentrent pas dans le calcul.
 */
const DEPOSIT_RATE_STATUSES = new Set([
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
  return DEPOSIT_RATE_STATUSES.has(foldStatus(status));
}

export function isValidatedDepositStatus(status?: string | null) {
  const folded = foldStatus(status);
  return folded === "acompte recu" || folded === "acompte valide";
}

/** Acomptes reçus / (reçus + en attente + envoyés). */
export function validatedDepositRate(leads: Array<{ status: string }>) {
  const counted = leads.filter((lead) => isDepositFunnelStatus(lead.status));
  const received = counted.filter((lead) =>
    isValidatedDepositStatus(lead.status),
  );
  return ratio(received.length, counted.length);
}
