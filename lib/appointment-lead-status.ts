export function shouldMarkLeadAsBooked(status: string) {
  return ![
    "RDV pris",
    "RDV confirmé",
    "Acompte envoyé",
    "Acompte reçu",
    "Acompte en attente",
    "Devis",
    "Vendu",
    "Client converti",
  ].includes(status);
}

export function isSeyaAppointmentSource(source?: string | null) {
  return String(source || "").trim().toLowerCase() === "seya";
}

export function leadStatusAfterAgendaBooking(
  source: string | null | undefined,
  currentStatus: string,
) {
  if (!shouldMarkLeadAsBooked(currentStatus)) {
    return currentStatus;
  }
  if (isSeyaAppointmentSource(source)) {
    return "RDV pris";
  }
  return "RDV confirmé";
}
