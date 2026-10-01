import assert from "node:assert/strict";
import test from "node:test";
import type { BillingInvoice } from "./billing-supabase.ts";
import {
  buildSeyaKpi,
  formatSeyaKpiDelay,
  type SeyaKpiConversation,
} from "./seya-kpi.ts";
import type { Lead } from "../types/lead.ts";

function conversation(
  partial: Partial<SeyaKpiConversation> & { id: string },
): SeyaKpiConversation {
  return {
    leadId: partial.leadId || partial.id,
    phone: "0611223344",
    firstName: "Léa",
    lastName: "Martin",
    status: "En cours",
    qualification: { need: "", zone: "" },
    proposedSlots: [],
    messages: [],
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

function lead(partial: Partial<Lead> & Pick<Lead, "id" | "status">): Lead {
  return {
    firstName: "Léa",
    lastName: "Martin",
    phone: "0611223344",
    email: "lea@test.fr",
    treatment: "Cryo",
    source: "WhatsApp",
    campaign: "",
    dealAmount: 0,
    commercial: "Seya",
    createdAt: "2026-09-01T10:00:00",
    createdDate: "2026-09-01",
    nextAction: "",
    activityLog: [],
    ...partial,
  };
}

function invoice(partial: Partial<BillingInvoice>): BillingInvoice {
  return {
    id: "i1",
    number: "F-1",
    date: "01/10/2026",
    client: "Léa Martin",
    email: "lea@test.fr",
    care: "Cryo",
    type: "Facture finale",
    status: "Payée",
    total: 250,
    paid: 250,
    paymentMethod: "CB centre",
    ...partial,
  };
}

test("Seya KPI ne compte que les fils où Seya a écrit, pas le planning", () => {
  const kpi = buildSeyaKpi(
    [
      conversation({
        id: "agenda-desk",
        leadId: "agenda-desk",
        messages: [{ author: "seya", text: "Créneau libre", at: "2026-10-01T10:00:00.000Z" }],
      }),
      conversation({
        id: "c1",
        messages: [{ author: "seya", text: "Bonjour Léa", at: "2026-10-01T10:00:00.000Z" }],
      }),
      conversation({
        id: "c2",
        messages: [{ author: "lead", text: "Allô", at: "2026-10-01T10:00:00.000Z" }],
      }),
    ],
    [],
  );

  assert.equal(kpi.contacted, 1);
  assert.equal(kpi.replied, 0);
  assert.equal(kpi.replyRate, 0);
});

test("Seya KPI mesure réponse, qualification, proposition et RDV", () => {
  const kpi = buildSeyaKpi(
    [
      conversation({
        id: "c1",
        leadId: "l1",
        qualification: { need: "Cryolipolyse", zone: "ventre" },
        status: "RDV pris",
        bookedSlot: { date: "2026-10-08", time: "16:00", label: "jeu. 16h" },
        proposedSlots: [{ label: "jeu. 16h" }],
        messages: [
          { author: "seya", text: "Bonjour", at: "2026-10-01T10:00:00.000Z" },
          { author: "lead", text: "Ventre", at: "2026-10-01T10:05:00.000Z" },
          { author: "seya", text: "Je propose jeu. 16h", at: "2026-10-01T10:06:00.000Z" },
          { author: "lead", text: "Oui", at: "2026-10-01T10:20:00.000Z" },
        ],
        updatedAt: "2026-10-01T10:20:00.000Z",
      }),
      conversation({
        id: "c2",
        leadId: "l2",
        messages: [{ author: "seya", text: "Bonjour", at: "2026-10-01T11:00:00.000Z" }],
      }),
    ],
    [lead({ id: "l1", status: "RDV pris" }), lead({ id: "l2", status: "Nouveau" })],
  );

  assert.equal(kpi.contacted, 2);
  assert.equal(kpi.replied, 1);
  assert.equal(kpi.replyRate, 50);
  assert.equal(kpi.qualified, 1);
  assert.equal(kpi.proposed, 1);
  assert.equal(kpi.booked, 1);
  assert.equal(kpi.proposalToBookRate, 100);
});

test("CA Seya ne prend que les devis, factures et ventes des leads contactés", () => {
  const kpi = buildSeyaKpi(
    [
      conversation({
        id: "c1",
        leadId: "l1",
        messages: [{ author: "seya", text: "Bonjour", at: "2026-10-01T10:00:00.000Z" }],
      }),
    ],
    [
      lead({ id: "l1", status: "Devis", dealAmount: 180, email: "lea@test.fr" }),
      lead({
        id: "other",
        status: "Vendu",
        dealAmount: 900,
        email: "autre@test.fr",
        phone: "0699999999",
        firstName: "Autre",
      }),
    ],
    [
      invoice({ total: 180 }),
      invoice({
        id: "i2",
        email: "autre@test.fr",
        client: "Autre",
        total: 900,
      }),
    ],
  );

  assert.equal(kpi.devis, 1);
  assert.equal(kpi.invoices, 1);
  assert.equal(kpi.revenue, 180);
});

test("sorties, relances et handoff Seya", () => {
  const kpi = buildSeyaKpi(
    [
      conversation({
        id: "stop",
        leadId: "s1",
        status: "Pas intéressé",
        messages: [
          { author: "seya", text: "Bonjour", at: "2026-09-20T10:00:00.000Z" },
          { author: "lead", text: "Pas intéressée", at: "2026-09-20T10:10:00.000Z" },
        ],
      }),
      conversation({
        id: "wrong",
        leadId: "s2",
        status: "Pas intéressé",
        messages: [
          { author: "seya", text: "Bonjour", at: "2026-09-21T10:00:00.000Z" },
          {
            author: "lead",
            text: "Je pensais que c’était l’institut de Cournon",
            at: "2026-09-21T10:10:00.000Z",
          },
        ],
      }),
      conversation({
        id: "health",
        leadId: "s3",
        status: "Revue santé",
        healthReview: { status: "awaiting_human_health_review" },
        messages: [{ author: "seya", text: "Bonjour", at: "2026-09-22T10:00:00.000Z" }],
      }),
      conversation({
        id: "relance",
        leadId: "s4",
        status: "RDV pris",
        bookedSlot: { date: "2026-10-08", time: "16:00", label: "jeu. 16h" },
        lastRelanceAt: "2026-09-28T10:00:00.000Z",
        relanceCount: 1,
        messages: [
          { author: "seya", text: "Bonjour", at: "2026-09-27T10:00:00.000Z" },
          { author: "lead", text: "Oui jeudi", at: "2026-09-28T12:00:00.000Z" },
        ],
      }),
      conversation({
        id: "back",
        leadId: "s5",
        phone: "0688888888",
        messages: [{ author: "seya", text: "Bonjour", at: "2026-09-23T10:00:00.000Z" }],
      }),
    ],
    [
      lead({ id: "s1", status: "Pas intéressé" }),
      lead({ id: "s2", status: "Nouveau" }),
      lead({ id: "s3", status: "À relancer" }),
      lead({ id: "s4", status: "RDV pris" }),
      lead({
        id: "s5",
        status: "Reviendra vers nous",
        phone: "0688888888",
      }),
    ],
  );

  assert.equal(kpi.notInterested, 1);
  assert.equal(kpi.outOfZoneOrWrongCenter, 1);
  assert.equal(kpi.willComeBack, 1);
  assert.equal(kpi.healthHandoff, 1);
  assert.equal(kpi.relanced, 1);
  assert.equal(kpi.repliedAfterRelance, 1);
  assert.equal(kpi.bookedAfterRelance, 1);
});

test("le délai moyen jusqu’au premier RDV Seya", () => {
  const kpi = buildSeyaKpi(
    [
      conversation({
        id: "c1",
        leadId: "l1",
        status: "RDV pris",
        bookedSlot: { date: "2026-10-08", time: "16:00", label: "jeu. 16h" },
        messages: [
          { author: "seya", text: "Bonjour", at: "2026-10-01T10:00:00.000Z" },
          { author: "lead", text: "Oui", at: "2026-10-01T14:00:00.000Z" },
        ],
        updatedAt: "2026-10-01T14:00:00.000Z",
      }),
    ],
    [
      lead({
        id: "l1",
        status: "RDV pris",
        activityLog: [
          {
            id: "a1",
            author: "Seya",
            date: "Aujourd'hui",
            text: "Statut → RDV pris",
            type: "status",
            occurredAt: "2026-10-01T14:00:00.000Z",
          },
        ],
      }),
    ],
  );

  assert.equal(kpi.averageHoursToFirstRdv, 4);
  assert.equal(formatSeyaKpiDelay(4), "4 h");
  assert.equal(formatSeyaKpiDelay(36), "1,5 j");
});
