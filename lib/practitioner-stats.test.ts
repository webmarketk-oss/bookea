import assert from "node:assert/strict";
import test from "node:test";
import type { Appointment, Practitioner } from "../types/agenda";
import type { Lead } from "../types/lead";
import {
  attendanceRateFromAppointments,
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

test("les devis et factures praticienne ne comptent que les ventes de plus de 100 €", () => {
  const rows = buildPractitionerStats(
    [],
    [
      lead({
        id: "d1",
        commercial: "Camille",
        status: "Devis",
        dealAmount: 180,
        email: "camille-client@test.fr",
      }),
      lead({
        id: "d2",
        commercial: "Camille",
        status: "Devis",
        dealAmount: 80,
      }),
    ],
    team,
    [
      {
        id: "f1",
        number: "F-1",
        date: "01/10/2026",
        client: "A B",
        email: "camille-client@test.fr",
        care: "Laser",
        type: "Facture finale",
        status: "Payée",
        total: 250,
        paid: 250,
        paymentMethod: "CB centre",
      },
      {
        id: "f2",
        number: "F-2",
        date: "01/10/2026",
        client: "A B",
        email: "camille-client@test.fr",
        care: "Laser",
        type: "Facture finale",
        status: "Payée",
        total: 90,
        paid: 90,
        paymentMethod: "CB centre",
      },
    ],
  );

  const camille = rows.find((row) => row.id === "camille");
  assert.equal(camille?.devis, 1);
  assert.equal(camille?.invoices, 1);
});

test("un devis CRM et un devis facturation du même lead ne se comptent qu'une fois", () => {
  const rows = buildPractitionerStats(
    [],
    [
      lead({
        id: "same",
        commercial: "Camille",
        status: "Devis",
        dealAmount: 220,
        email: "same@test.fr",
      }),
    ],
    team,
    [
      {
        id: "bd1",
        number: "D-1",
        date: "01/10/2026",
        client: "A B",
        email: "same@test.fr",
        care: "Laser",
        type: "Devis",
        status: "Envoyée",
        total: 220,
        paid: 0,
        paymentMethod: "CB centre",
      },
    ],
  );

  assert.equal(rows.find((row) => row.id === "camille")?.devis, 1);
});

test("une facture sans lead attribué n'invente pas de praticien", () => {
  const rows = buildPractitionerStats(
    [],
    [],
    team,
    [
      {
        id: "orphan",
        number: "F-9",
        date: "01/10/2026",
        client: "Inconnue",
        email: "inconnu@test.fr",
        care: "Laser",
        type: "Facture finale",
        status: "Payée",
        total: 300,
        paid: 300,
        paymentMethod: "CB centre",
      },
    ],
  );

  assert.equal(
    rows.some((row) => row.invoices > 0 || row.name === "Inconnue"),
    false,
  );
});

test("le présentiel ignore les pauses et reste sur 100", () => {
  const rate = attendanceRateFromAppointments([
    appointment({
      id: "1",
      practitionerId: "camille",
      status: "Présent",
    }),
    appointment({
      id: "2",
      practitionerId: "camille",
      status: "No show",
    }),
    appointment({
      id: "pause-1",
      practitionerId: "camille",
      status: "Confirmé",
      kind: "Pause",
      treatment: "Pause",
      personName: "Pause",
    }),
    appointment({
      id: "pause-2",
      practitionerId: "marie",
      status: "Confirmé",
      kind: "Indisponible",
      treatment: "Indisponible",
      personName: "Indisponible",
    }),
  ]);

  assert.equal(rate, 50);
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
