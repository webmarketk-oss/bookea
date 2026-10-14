import assert from "node:assert/strict";
import test from "node:test";

import type { Lead } from "../types/lead.ts";
import {
  applyAppointmentStatusOverrides,
  type AppointmentStatusOverride,
} from "./appointment-crm-sync.ts";

function lead(status: Lead["status"], statusChangedAt?: string): Lead {
  return {
    id: "lead-1",
    firstName: "Inès",
    lastName: "Martin",
    phone: "06 11 22 33 44",
    email: "",
    treatment: "Laser",
    source: "Facebook",
    campaign: "Laser",
    status,
    dealAmount: 0,
    commercial: "",
    createdAt: "",
    createdDate: "2026-10-01",
    nextAction: "",
    activityLog: statusChangedAt
      ? [
          {
            id: "event-1",
            author: "Équipe",
            date: "",
            text: `Statut changé : Annulation → ${status}.`,
            type: "status",
            occurredAt: statusChangedAt,
          },
        ]
      : [],
  };
}

const agendaOverride: AppointmentStatusOverride = {
  appointmentId: "rdv-1",
  leadStatus: "À relancer",
  name: "Inès Martin",
  phone: "0611223344",
  status: "Annulation",
  updatedAt: "2026-10-10T09:00:00.000Z",
};

test("un statut choisi dans le CRM après l’agenda n’est pas écrasé", () => {
  const [result] = applyAppointmentStatusOverrides(
    [lead("Pas intéressé", "2026-10-14T15:00:00.000Z")],
    [agendaOverride],
  );
  assert.equal(result.status, "Pas intéressé");
});

test("un statut d’agenda plus récent que le CRM s’applique toujours", () => {
  const [result] = applyAppointmentStatusOverrides(
    [lead("Nouveau", "2026-10-09T15:00:00.000Z")],
    [agendaOverride],
  );
  assert.equal(result.status, "À relancer");
});
