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
  source: "Facebook" | "Instagram" | "Google" | "Site Web" | "Organique";
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
  latestComment?: string;
  activityLog: LeadActivity[];
}

export interface LeadActivity {
  id: string;
  author: string;
  date: string;
  text: string;
  type: "comment" | "status" | "system";
  occurredAt?: string;
}
