export type InscriptionOutcome = "Devis" | "Vendu" | "Annulation" | "PVPP";

function ratio(value: number, total: number) {
  if (total === 0) {
    return 0;
  }
  return (value / total) * 100;
}

function hasOutcome(
  outcomes: InscriptionOutcome[],
  wanted: InscriptionOutcome[],
) {
  return wanted.some((outcome) => outcomes.includes(outcome));
}

/** Transformation et présentiel des prospects arrivés sur la période, quel que soit le jour du rendez-vous ou du changement de statut. */
export function inscriptionVisitRates(
  leads: Array<{ outcomes: InscriptionOutcome[]; dealAmount: number }>,
) {
  const sold = leads.filter((lead) => hasOutcome(lead.outcomes, ["Vendu"]));
  const quoted = leads.filter((lead) => hasOutcome(lead.outcomes, ["Devis"]));
  const attended = leads.filter((lead) =>
    hasOutcome(lead.outcomes, ["Devis", "Vendu"]),
  );
  const missed = leads.filter(
    (lead) =>
      !attended.includes(lead) &&
      hasOutcome(lead.outcomes, ["Annulation", "PVPP"]),
  );
  const conversionSales = sold.filter(
    (lead) => !(lead.dealAmount > 0) || lead.dealAmount >= 100,
  );

  return {
    conversion: ratio(conversionSales.length, quoted.length + conversionSales.length),
    attendance: ratio(attended.length, attended.length + missed.length),
  };
}

/** Annulations et no-show des prospects arrivés sur la période, quel que soit le jour du rendez-vous. */
export function countByInscriptionOutcome(
  leads: Array<{ outcomes: InscriptionOutcome[] }>,
  outcome: InscriptionOutcome,
) {
  return leads.filter((lead) => lead.outcomes.includes(outcome)).length;
}
