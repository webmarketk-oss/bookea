import assert from "node:assert/strict";
import test from "node:test";
import type { Appointment, Practitioner } from "../types/agenda";
import type { Lead } from "../types/lead";
import {
  buildPractitionerStats,
  summarizePractitionerStats,
} from "./practitioner-stats.ts";

const team: Practitioner[] = [
  { id: "camille", name: "Camille", role: "Praticienne", color: "bg-violet-500" },
  { id: "marie", name: "Marie L.", role: "Praticienne", color: "bg-cyan-500" },
];

function lead(partial: Partial<Lead> & Pick<Lead, "status" | "commercial">): Lead {
  return {
    id: partial.id || "lead",
    firstName: "A",
    lastName: "B",
    phone: "0600000000",
    email: "",
    treatment: "Laser",
    source: "Meta",
    campaign: "",
    dealAmount: partial.dealAmount ?? 0,
    createdAt: "2026-09-01T10:00:00",
    createdDate: "2026-09-01",
    nextAction: "",
    activityLog: [],
    ...partial,
  };
}

function appointment(
  partial: Partial<Appointment> & Pick<Appointment, "practitionerId" | "status">,
): Appointment {
  return {
    id: partial.id || "rdv",
    personName: "Cliente",
    phone: "0600000000",
    treatment: "Laser",
    cabinId: "c1",
    date: "2026-09-20",
    start: "10:00",
    duration: 60,
    source: "Client",
    kind: "Rendez-vous",
    ...partial,
  };
}

test("les stats praticienne mesurent transfo, RDV posé et présentiel", () => {
  const rows = buildPractitionerStats(
    [
      appointment({
        id: "1",
        practitionerId: "camille",
        practitionerName: "Camille",
        status: "Présent",
      }),
      appointment({
        id: "2",
        practitionerId: "camille",
        practitionerName: "Camille",
        status: "No show",
      }),
      appointment({
        id: "3",
        practitionerId: "marie",
        practitionerName: "Marie L.",
        status: "Confirmé",
      }),
      appointment({
        id: "pause",
        practitionerId: "camille",
        status: "Confirmé",
        kind: "Pause",
        treatment: "Pause",
      }),
    ],
    [
      lead({ id: "l1", commercial: "Camille", status: "Vendu", dealAmount: 400 }),
      lead({ id: "l2", commercial: "Camille", status: "Nouveau" }),
      lead({
        id: "l3",
        commercial: "Camille",
        status: "Acompte reçu",
      }),
      lead({ id: "l4", commercial: "Marie L.", status: "RDV pris" }),
    ],
    team,
  );

  const camille = rows.find((row) => row.id === "camille");
  const marie = rows.find((row) => row.id === "marie");

  assert.equal(camille?.appointments, 2);
  assert.equal(camille?.honored, 1);
  assert.equal(camille?.attendanceRate, 50);
  assert.equal(camille?.leads, 3);
  assert.equal(camille?.rdvLeads, 2);
  assert.equal(camille?.rdvRate, 67);
  assert.equal(camille?.sold, 1);
  assert.equal(camille?.conversionRate, 33);
  assert.equal(marie?.appointments, 1);
  assert.equal(marie?.attendanceRate, 100);
  assert.equal(marie?.conversionRate, 0);
  assert.equal(marie?.rdvRate, 100);
});

test("le résumé équipe agrège les taux de l'onglet stats équipes", () => {
  const summary = summarizePractitionerStats(
    buildPractitionerStats(
      [
        appointment({
          practitionerId: "camille",
          status: "Présent",
        }),
        appointment({
          practitionerId: "marie",
          status: "No show",
        }),
      ],
      [
        lead({ commercial: "Camille", status: "Vendu", dealAmount: 200 }),
        lead({ commercial: "Marie L.", status: "Nouveau" }),
      ],
      team,
    ),
  );

  assert.equal(summary.appointments, 2);
  assert.equal(summary.attendanceRate, 50);
  assert.equal(summary.conversionRate, 50);
  assert.equal(summary.rdvRate, 50);
});
