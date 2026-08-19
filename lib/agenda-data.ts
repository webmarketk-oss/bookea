import { Appointment, Cabin, Practitioner } from "@/types/agenda";
import { leads } from "@/lib/mock-data";

export const practitioners: Practitioner[] = [
  {
    id: "samantha",
    name: "Samantha",
    role: "Responsable",
    color: "bg-blue-500",
  },
  {
    id: "marie",
    name: "Marie L.",
    role: "Laser",
    color: "bg-violet-500",
  },
  {
    id: "camille",
    name: "Camille",
    role: "Soins visage",
    color: "bg-emerald-500",
  },
  {
    id: "ines",
    name: "Inès",
    role: "Cryo",
    color: "bg-amber-500",
  },
  {
    id: "aurelie",
    name: "Aurélie",
    role: "Polyvalente",
    color: "bg-rose-500",
  },
];

export const cabins: Cabin[] = [
  {
    id: "cabine-1",
    name: "Cabine 1",
    equipment: "Laser",
    color: "from-blue-500 to-cyan-400",
    softColor: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    id: "cabine-2",
    name: "Cabine 2",
    equipment: "Cryolipolyse",
    color: "from-violet-500 to-fuchsia-400",
    softColor: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    id: "cabine-3",
    name: "Cabine 3",
    equipment: "Hydrafacial / HIFU",
    color: "from-emerald-500 to-teal-400",
    softColor: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  {
    id: "cabine-4",
    name: "Cabine 4",
    equipment: "Consultation",
    color: "from-amber-500 to-orange-400",
    softColor: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    id: "cabine-5",
    name: "Cabine 5",
    equipment: "Polyvalente",
    color: "from-rose-500 to-pink-400",
    softColor: "bg-rose-50 text-rose-700 border-rose-100",
  },
];

export const appointments: Appointment[] = [
  {
    id: "rdv-1",
    personName: "Marie Dubois",
    phone: "06 12 34 56 78",
    treatment: "Épilation Laser",
    practitionerId: "marie",
    cabinId: "cabine-1",
    date: todayIso(),
    start: "09:00",
    duration: 60,
    status: "Confirmé",
    source: "Prospect",
    notes: "Premier RDV depuis Facebook.",
  },
  {
    id: "rdv-2",
    personName: "Julie Martin",
    phone: "06 22 33 44 55",
    treatment: "Cryolipolyse",
    practitionerId: "ines",
    cabinId: "cabine-2",
    date: todayIso(),
    start: "10:30",
    duration: 75,
    status: "À confirmer",
    source: "Prospect",
  },
  {
    id: "rdv-3",
    personName: "Sarah Bernard",
    phone: "06 98 76 54 32",
    treatment: "Hydrafacial",
    practitionerId: "camille",
    cabinId: "cabine-3",
    date: todayIso(),
    start: "11:00",
    duration: 45,
    status: "Confirmé",
    source: "Client",
  },
  {
    id: "rdv-4",
    personName: "Nadia Ali",
    phone: "06 64 58 49 90",
    treatment: "Bilan Laser",
    practitionerId: "samantha",
    cabinId: "cabine-4",
    date: todayIso(),
    start: "14:00",
    duration: 30,
    status: "Confirmé",
    source: "Seya",
    notes: "Créneau proposé automatiquement.",
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const agendaContacts = [
  ...leads.map((lead) => ({
    id: lead.id,
    name: `${lead.firstName} ${lead.lastName}`,
    phone: lead.phone,
    email: lead.email,
    treatment: lead.treatment,
    type: "Prospect" as const,
  })),
  {
    id: "client-1",
    name: "Claire Moreau",
    phone: "06 95 86 13 69",
    email: "claire@email.com",
    treatment: "Cryolipolyse",
    type: "Client" as const,
  },
  {
    id: "client-2",
    name: "Laura Petit",
    phone: "06 73 33 81 66",
    email: "laura@email.com",
    treatment: "Laser Aisselles",
    type: "Client" as const,
  },
];
