export type LeadStatus =
  | "Nouveau"
  | "Apl en abs"
  | "PI"
  | "Reviendra vers nous"
  | "En réflexion"
  | "Souhaite être rappelé(e) plus tard"
  | "À rappeler"
  | "RDV pris"
  | "RDV fixé"
  | "RDV confirmé"
  | "RDV programmé"
  | "No show"
  | "Client converti"
  | "Acompte envoyé"
  | "Acompte reçu"
  | "Acompte validé"
  | "Acompte en attente"
  | "Devis"
  | "Vendu"
  | "Client"
  | "Perdu"
  | "Numéro invalide"
  | "Prospect perdu"
  | "Doublon"
  | "Hors zone"
  | "Message WhatsApp envoyé"
  | "SMS envoyé"
  | "Message vocal laissé"
  | "Mail envoyé"
  | "Mail/SMS Injoignable"
  | "Msg vocal + Mail";

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  treatment: string;
  source: "Facebook" | "Instagram" | "Google" | "Site Web" | "Organique";
  campaign: string;
  status: LeadStatus;
  dealAmount: number;
  commercial: string;
  createdAt: string;
  createdDate: string;
  updatedDate?: string;
  nextAction: string;
  reminderDate?: string;
  activityLog: LeadActivity[];
}

export interface LeadActivity {
  id: string;
  author: string;
  date: string;
  text: string;
  type: "comment" | "status" | "system";
}
