export type LeadStatus =
  | "Nouveau"
  | "Apl en abs"
  | "Pas intéressé"
  | "Reviendra vers nous"
  | "En réflexion"
  | "À relancer"
  | "RDV pris"
  | "RDV confirmé"
  | "No show"
  | "Annulation"
  | "Client converti"
  | "Acompte envoyé"
  | "Acompte reçu"
  | "Acompte en attente"
  | "Devis"
  | "Vendu"
  | "Prospect perdu"
  | "Intraitable"
  | "Numéro invalide"
  | "Doublon"
  | "Hors zone"
  | "Message WhatsApp envoyé"
  | "SMS envoyé"
  | "Message vocal envoyé"
  | "Msg vocal laissé + SMS envoyé"
  | "Mail envoyé"
  | "Mail/SMS Injoignable"
  | "Message vocal";

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate?: string;
  gender?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  treatment: string;
  source: string;
  importTool?: string;
  imported?: boolean;
  importCandidate?: string;
  campaign: string;
  status: LeadStatus;
  dealAmount: number;
  commercial: string;
  createdAt: string;
  createdDate: string;
  lastActivityAt?: string;
  updatedDate?: string;
  nextAction: string;
  reminderDate?: string;
  /** Date du rendez-vous saisie dans le CRM (YYYY-MM-DD). Vide = effacée. Absent = non saisie. */
  visitDate?: string;
  centerId?: string;
  centerName?: string;
  /** Suivi acomptes : date/heure ISO des 4 relances (même fiche CRM). */
  depositReminders?: {
    1?: string;
    2?: string;
    3?: string;
    4?: string;
  };
  /** Commentaire associé à chaque date de relance acompte. */
  depositReminderNotes?: {
    1?: string;
    2?: string;
    3?: string;
    4?: string;
  };
  /** Passé par « Acompte envoyé » : reste visible dans Gestion des acomptes. */
  depositTracked?: boolean;
  latestComment?: string;
  activityLog: LeadActivity[];
  appointments?: LeadAppointment[];
}

export type LeadAppointmentOutcome = "Devis" | "Vendu" | "Annulation" | "PVPP";

export interface LeadAppointment {
  id: string;
  bookedOn: string;
  date: string;
  outcome?: LeadAppointmentOutcome;
}

export interface LeadActivity {
  id: string;
  author: string;
  date: string;
  text: string;
  type: "comment" | "status" | "system";
  occurredAt?: string;
}
