export type AppointmentStatus =
  | "Confirmé"
  | "À confirmer"
  | "En cours"
  | "Terminé"
  | "No show"
  | "Présent"
  | "Annulation"
  | "Pas venu pas prévenu"
  | "Devis"
  | "Vendu"
  | "Devis vendu";

export type AppointmentSource = "Prospect" | "Client" | "Seya" | "Organique";

export type AppointmentKind =
  | "Rendez-vous"
  | "Pause"
  | "Formation"
  | "Indisponible";

export interface Practitioner {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface Cabin {
  id: string;
  name: string;
  equipment: string;
  color: string;
  softColor: string;
}

export interface Appointment {
  id: string;
  clientId?: string;
  personName: string;
  phone: string;
  email?: string;
  treatment: string;
  practitionerId: string;
  cabinId: string;
  date: string;
  start: string;
  duration: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  kind?: AppointmentKind;
  notes?: string;
  birthDate?: string;
}
