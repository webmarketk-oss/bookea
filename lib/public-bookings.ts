import { Appointment } from "@/types/agenda";
import { Lead } from "@/types/lead";

export const PUBLIC_BOOKINGS_STORAGE_KEY = "bookea-public-bookings";
export const PUBLIC_BOOKINGS_UPDATED_EVENT = "bookea-public-bookings-updated";

export type PublicBookingRecord = {
  id: string;
  centerName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  treatment: string;
  date: string;
  start: string;
  duration: number;
  price: number;
  deposit: number;
  createdAt: string;
};

type Identity = {
  firstName?: string;
  lastName?: string;
  personName?: string;
  phone?: string;
  email?: string;
};

const knownClientIdentities: Identity[] = [
  {
    firstName: "Marie",
    lastName: "Dubois",
    phone: "06 12 34 56 78",
    email: "marie@email.com",
  },
  {
    firstName: "Claire",
    lastName: "Moreau",
    phone: "06 95 86 13 69",
    email: "claire@email.com",
  },
  {
    firstName: "Laura",
    lastName: "Petit",
    phone: "06 73 33 81 66",
    email: "laura@email.com",
  },
];

export function readPublicBookings(): PublicBookingRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedBookings = window.localStorage.getItem(
      PUBLIC_BOOKINGS_STORAGE_KEY
    );

    if (!storedBookings) {
      return [];
    }

    const bookings = JSON.parse(storedBookings);
    return Array.isArray(bookings) ? bookings : [];
  } catch {
    return [];
  }
}

export function readPublicBookingsForCenter(centerName?: string | null) {
  const normalizedCenter = (centerName ?? "").trim().toLowerCase();

  if (!normalizedCenter) {
    return [];
  }

  return readPublicBookings().filter(
    (booking) => booking.centerName.trim().toLowerCase() === normalizedCenter,
  );
}

export function savePublicBooking(record: PublicBookingRecord) {
  const existingBookings = readPublicBookings();
  const nextBookings = [
    record,
    ...existingBookings.filter((booking) => booking.id !== record.id),
  ];

  writePublicBookings(nextBookings);
}

export function getPublicBookingIdFromAppointment(appointment: {
  id: string;
  notes?: string;
}) {
  if (appointment.id.startsWith("public-")) {
    return appointment.id.slice("public-".length);
  }

  return appointment.notes?.match(/booking:([^\s.]+)/)?.[1];
}

export function removePublicBooking(bookingId: string) {
  writePublicBookings(
    readPublicBookings().filter((booking) => booking.id !== bookingId),
  );
}

function writePublicBookings(bookings: PublicBookingRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      PUBLIC_BOOKINGS_STORAGE_KEY,
      JSON.stringify(bookings)
    );
    window.dispatchEvent(new Event(PUBLIC_BOOKINGS_UPDATED_EVENT));
  } catch {
    // Le prototype reste utilisable même si le navigateur bloque le stockage.
  }
}

export function mergePublicBookingsIntoLeads(
  currentLeads: Lead[],
  bookings: PublicBookingRecord[]
): Lead[] {
  return bookings.reduce<Lead[]>(
    (mergedLeads, booking) => mergePublicBookingIntoLeads(mergedLeads, booking),
    currentLeads
  );
}

export function mergePublicBookingIntoLeads(
  currentLeads: Lead[],
  booking: PublicBookingRecord
): Lead[] {
  const existingLead = currentLeads.find((lead) =>
    isSameIdentity(
      {
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        email: lead.email,
      },
      booking
    )
  );

  if (!existingLead) {
    if (knownClientIdentities.some((client) => isSameIdentity(client, booking))) {
      return currentLeads;
    }

    return [bookingToLead(booking), ...currentLeads];
  }

  return currentLeads.map((lead) => {
    if (lead.id !== existingLead.id) {
      return lead;
    }

    const alreadyLogged = lead.activityLog.some(
      (activity) => activity.id === `booking-${booking.id}`
    );

    return {
      ...lead,
      phone: lead.phone || booking.phone,
      email: lead.email || booking.email,
      treatment: booking.treatment,
      source: "Organique",
      campaign: "Bookea organique",
      status: "RDV confirmé",
      nextAction: `RDV confirmé ${formatDisplayDate(booking.date)} à ${
        booking.start
      }`,
      reminderDate: booking.date,
      dealAmount: lead.dealAmount || booking.price,
      activityLog: alreadyLogged
        ? lead.activityLog
        : [
            bookingActivity(booking),
            {
              id: `dedupe-${booking.id}`,
              author: "Système",
              date: formatActivityDate(),
              text: "Réservation rattachée à la fiche existante pour éviter un doublon.",
              type: "system",
            },
            ...lead.activityLog,
          ],
    };
  });
}

export function mergePublicBookingsIntoAppointments(
  currentAppointments: Appointment[],
  bookings: PublicBookingRecord[]
): Appointment[] {
  return bookings.reduce<Appointment[]>(
    (mergedAppointments, booking) =>
      mergePublicBookingIntoAppointments(mergedAppointments, booking),
    currentAppointments
  );
}

export function mergePublicBookingIntoAppointments(
  currentAppointments: Appointment[],
  booking: PublicBookingRecord
): Appointment[] {
  const alreadyExists = currentAppointments.some(
    (appointment) =>
      appointment.notes?.includes(`booking:${booking.id}`) ||
      (appointment.date === booking.date &&
        appointment.start === booking.start &&
        normalizeText(appointment.treatment) ===
          normalizeText(booking.treatment) &&
        isSameIdentity(
          {
            personName: appointment.personName,
            phone: appointment.phone,
            email: appointment.email,
          },
          booking
        ))
  );

  if (alreadyExists) {
    return currentAppointments;
  }

  return [...currentAppointments, bookingToAppointment(booking)];
}

export function findDuplicateLeadGroups(leads: Lead[]) {
  const groups = new Map<string, Lead[]>();

  leads.forEach((lead) => {
    const keys = identityKeys(lead);

    keys.forEach((key) => {
      const group = groups.get(key) ?? [];
      group.push(lead);
      groups.set(key, group);
    });
  });

  const seenGroups = new Set<string>();

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      group.filter(
        (lead, index, allLeads) =>
          allLeads.findIndex((item) => item.id === lead.id) === index
      )
    )
    .filter((group) => {
      const signature = group
        .map((lead) => lead.id)
        .sort()
        .join("-");

      if (seenGroups.has(signature)) {
        return false;
      }

      seenGroups.add(signature);
      return group.length > 1;
    });
}

export function mergeDuplicateLeads(
  currentLeads: Lead[],
  primaryLeadId: string,
  duplicateLeadId: string
) {
  const primaryLead = currentLeads.find((lead) => lead.id === primaryLeadId);
  const duplicateLead = currentLeads.find((lead) => lead.id === duplicateLeadId);

  if (!primaryLead || !duplicateLead) {
    return currentLeads;
  }

  const mergedLead: Lead = {
    ...primaryLead,
    phone: primaryLead.phone || duplicateLead.phone,
    email: primaryLead.email || duplicateLead.email,
    treatment: primaryLead.treatment || duplicateLead.treatment,
    source: primaryLead.source || duplicateLead.source,
    campaign: primaryLead.campaign || duplicateLead.campaign,
    dealAmount: Math.max(primaryLead.dealAmount, duplicateLead.dealAmount),
    activityLog: [
      {
        id: `manual-merge-${duplicateLead.id}`,
        author: "Système",
        date: formatActivityDate(),
        text: `Fiche fusionnée avec ${duplicateLead.firstName} ${duplicateLead.lastName}.`,
        type: "system",
      },
      ...primaryLead.activityLog,
      ...duplicateLead.activityLog,
    ],
  };

  return currentLeads
    .filter((lead) => lead.id !== duplicateLeadId)
    .map((lead) => (lead.id === primaryLeadId ? mergedLead : lead));
}

export function isSameIdentity(first: Identity, second: Identity) {
  const firstPhone = normalizePhone(first.phone);
  const secondPhone = normalizePhone(second.phone);

  if (firstPhone && secondPhone && firstPhone === secondPhone) {
    return true;
  }

  const firstEmail = normalizeEmail(first.email);
  const secondEmail = normalizeEmail(second.email);

  if (firstEmail && secondEmail && firstEmail === secondEmail) {
    return true;
  }

  const firstName = splitIdentityName(first);
  const secondName = splitIdentityName(second);

  return (
    Boolean(firstName.firstName && firstName.lastName) &&
    firstName.firstName === secondName.firstName &&
    firstName.lastName === secondName.lastName
  );
}

export function createPublicBookingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `booking-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function bookingToLead(booking: PublicBookingRecord): Lead {
  return {
    id: `public-${booking.id}`,
    firstName: booking.firstName,
    lastName: booking.lastName,
    phone: booking.phone,
    email: booking.email,
    treatment: booking.treatment,
    source: "Organique",
    campaign: "Bookea organique",
    status: "RDV confirmé",
    dealAmount: booking.price,
    commercial: "Samantha",
    createdAt: `Aujourd'hui ${booking.start}`,
    createdDate: booking.createdAt.slice(0, 10),
    nextAction: `RDV confirmé ${formatDisplayDate(booking.date)} à ${
      booking.start
    }`,
    reminderDate: booking.date,
    activityLog: [bookingActivity(booking)],
  };
}

function bookingToAppointment(booking: PublicBookingRecord): Appointment {
  const cabinId = getCabinIdFromTreatment(booking.treatment);

  return {
    id: `public-${booking.id}`,
    personName: `${booking.firstName} ${booking.lastName}`.trim(),
    phone: booking.phone,
    email: booking.email,
    treatment: booking.treatment,
    practitionerId: getPractitionerIdFromCabin(cabinId),
    cabinId,
    date: booking.date,
    start: booking.start,
    duration: booking.duration,
    status: "Confirmé",
    source: "Organique",
    kind: "Rendez-vous",
    notes: `Réservation publique Bookea. Acompte ${booking.deposit} €. booking:${booking.id}`,
  };
}

function bookingActivity(booking: PublicBookingRecord) {
  return {
    id: `booking-${booking.id}`,
    author: "Système",
    date: formatActivityDate(),
    text: `Réservation publique confirmée sur Bookea pour ${booking.treatment} le ${formatDisplayDate(
      booking.date
    )} à ${booking.start}. Provenance : organique.`,
    type: "system" as const,
    occurredAt: booking.createdAt,
  };
}

function identityKeys(identity: Identity) {
  return [
    normalizePhone(identity.phone),
    normalizeEmail(identity.email),
    splitIdentityName(identity).fullName,
  ].filter(Boolean);
}

function splitIdentityName(identity: Identity) {
  const firstName = normalizeText(identity.firstName);
  const lastName = normalizeText(identity.lastName);

  if (firstName || lastName) {
    return {
      firstName,
      lastName,
      fullName: `${firstName}:${lastName}`,
    };
  }

  const parts = normalizeText(identity.personName).split(" ").filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    fullName: parts.join(":"),
  };
}

function normalizePhone(phone?: string) {
  return phone?.replace(/\D/g, "") ?? "";
}

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() ?? "";
}

function normalizeText(value?: string) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase() ?? ""
  );
}

function getCabinIdFromTreatment(treatment: string) {
  const normalizedTreatment = normalizeText(treatment);

  if (normalizedTreatment.includes("cryo")) {
    return "cabine-2";
  }

  if (
    normalizedTreatment.includes("hydra") ||
    normalizedTreatment.includes("hifu")
  ) {
    return "cabine-3";
  }

  if (normalizedTreatment.includes("consult")) {
    return "cabine-4";
  }

  return "cabine-1";
}

function getPractitionerIdFromCabin(cabinId: string) {
  const practitionerByCabin: Record<string, string> = {
    "cabine-1": "marie",
    "cabine-2": "ines",
    "cabine-3": "camille",
    "cabine-4": "samantha",
    "cabine-5": "aurelie",
  };

  return practitionerByCabin[cabinId] ?? "samantha";
}

function formatActivityDate() {
  return `Aujourd'hui ${new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDisplayDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T00:00:00`));
}
