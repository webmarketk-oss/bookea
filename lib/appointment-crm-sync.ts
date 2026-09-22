import { Appointment, AppointmentStatus } from "@/types/agenda";
import { Lead, LeadStatus } from "@/types/lead";

export const APPOINTMENT_STATUS_UPDATED_EVENT =
  "bookea-appointment-status-updated";

const STORAGE_KEY = "bookea-appointment-status-overrides";

export type AppointmentStatusOverride = {
  appointmentId: string;
  email?: string;
  leadStatus: LeadStatus;
  name: string;
  phone: string;
  status: AppointmentStatus;
  updatedAt: string;
};

export function saveAppointmentStatusOverride(appointment: Appointment) {
  const leadStatus = mapAppointmentStatusToLeadStatus(appointment.status);

  if (!leadStatus || typeof window === "undefined") {
    return;
  }

  const overrides = readAppointmentStatusOverrides().filter(
    (override) => override.appointmentId !== appointment.id
  );
  const nextOverride: AppointmentStatusOverride = {
    appointmentId: appointment.id,
    email: appointment.email,
    leadStatus,
    name: appointment.personName,
    phone: appointment.phone,
    status: appointment.status,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([nextOverride, ...overrides])
  );
  window.dispatchEvent(new Event(APPOINTMENT_STATUS_UPDATED_EVENT));
}

export function readAppointmentStatusOverrides(): AppointmentStatusOverride[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    return rawValue ? JSON.parse(rawValue) : [];
  } catch {
    return [];
  }
}

export function applyAppointmentStatusOverrides(
  leads: Lead[],
  overrides: AppointmentStatusOverride[]
) {
  return leads.map((lead) => {
    const override = overrides.find((item) => doesOverrideMatchLead(item, lead));

    if (!override || lead.status === override.leadStatus) {
      return lead;
    }

    const activityId = `agenda-status-${override.appointmentId}-${override.status}`;
    const hasActivity = lead.activityLog.some(
      (activity) => activity.id === activityId
    );

    return {
      ...lead,
      status: override.leadStatus,
      activityLog: hasActivity
        ? lead.activityLog
        : [
            {
              id: activityId,
              author: "Système",
              date: "Aujourd'hui",
              text: `Statut planning : ${override.status}. Statut CRM mis à jour : ${lead.status} → ${override.leadStatus}.`,
              type: "status" as const,
              occurredAt: override.updatedAt,
            },
            ...lead.activityLog,
          ],
    };
  });
}

function mapAppointmentStatusToLeadStatus(
  status: AppointmentStatus
): LeadStatus | null {
  const statusMap: Partial<Record<AppointmentStatus, LeadStatus>> = {
    Confirmé: "RDV confirmé",
    "À confirmer": "RDV pris",
    "En cours": "RDV confirmé",
    Terminé: "Client converti",
    "No show": "No show",
    Présent: "Client converti",
    Annulation: "À relancer",
    "Pas venu pas prévenu": "No show",
    Devis: "Devis",
    Vendu: "Vendu",
    "Devis vendu": "Vendu",
  };

  return statusMap[status] ?? null;
}

function doesOverrideMatchLead(
  override: AppointmentStatusOverride,
  lead: Lead
) {
  const leadFullName = normalize(`${lead.firstName} ${lead.lastName}`);
  const overrideName = normalize(override.name);
  const leadPhone = onlyDigits(lead.phone);
  const overridePhone = onlyDigits(override.phone);
  const leadEmail = normalize(lead.email);
  const overrideEmail = normalize(override.email ?? "");

  return (
    (overridePhone.length >= 8 && leadPhone === overridePhone) ||
    (overrideEmail.length > 0 && leadEmail === overrideEmail) ||
    (overrideName.length > 0 && leadFullName === overrideName)
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
