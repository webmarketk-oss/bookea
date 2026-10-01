import assert from "node:assert/strict";
import test from "node:test";
import type { BillingInvoice } from "./billing-supabase.ts";
import { buildCampaignKpiRows } from "./campaign-kpi.ts";
import type { Lead } from "../types/lead.ts";

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: "l1",
    firstName: "Léa",
    lastName: "Martin",
    phone: "0611223344",
    email: "lea@test.fr",
    treatment: "Laser",
    source: "Facebook",
    campaign: "Printemps",
    status: "Nouveau",
    dealAmount: 0,
    commercial: "Marie",
    createdAt: "2026-10-01",
    createdDate: "2026-10-01",
    nextAction: "",
    activityLog: [],
    ...overrides,
  };
}

function invoice(overrides: Partial<BillingInvoice>): BillingInvoice {
  return {
    id: "i1",
    number: "F-1",
    date: "01/10/2026",
    client: "Léa Martin",
    email: "lea@test.fr",
    phone: "0611223344",
    care: "Laser",
    type: "Facture finale",
    status: "Payée",
    total: 200,
    paid: 200,
    paymentMethod: "CB centre",
    ...overrides,
  };
}

test("une campagne compte leads, RDV, devis et factures", () => {
  const rows = buildCampaignKpiRows(
    [
      lead({ id: "a", status: "RDV pris" }),
      lead({ id: "b", status: "Devis", email: "autre@test.fr", phone: "0699999999" }),
    ],
    [invoice({})],
    [
      lead({ id: "a", status: "RDV pris" }),
      lead({ id: "b", status: "Devis", email: "autre@test.fr", phone: "0699999999" }),
    ],
    (item) => item.status === "RDV pris",
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].leads, 2);
  assert.equal(rows[0].rdv, 1);
  assert.equal(rows[0].devis, 1);
  assert.equal(rows[0].invoices, 1);
});

test("un devis CRM et un devis facturation du même lead ne se comptent qu’une fois", () => {
  const rows = buildCampaignKpiRows(
    [lead({ status: "Devis" })],
    [invoice({ type: "Devis", status: "Envoyée" })],
    [lead({ status: "Devis" })],
    () => false,
  );

  assert.equal(rows[0].devis, 1);
});
