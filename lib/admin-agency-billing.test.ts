import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENCY_LEGAL_ENTITY,
  REVERSE_CHARGE_MENTION,
  billingAlerts,
  defaultAgencyIdentity,
  invoicesInRange,
  invoiceTotal,
  isOverdueCycle,
  isWithinReminderWindow,
  kpiBreakdown,
  monthlyRevenue,
  nextBillingCycleOn,
  nextInvoiceNumber,
  normalizeAgencyState,
  periodRange,
} from "./admin-agency-billing.ts";

test("les deux marques partagent la même société US et la mention d’autoliquidation", () => {
  const webk = defaultAgencyIdentity("webk");
  const bookea = defaultAgencyIdentity("bookea");
  assert.equal(webk.name, "WEBK");
  assert.equal(bookea.name, "Bookea Powered by Webk");
  assert.equal(webk.legalName, AGENCY_LEGAL_ENTITY.legalName);
  assert.equal(bookea.legalName, AGENCY_LEGAL_ENTITY.legalName);
  assert.equal(webk.city, "ALBUQUERQUE");
  assert.match(REVERSE_CHARGE_MENTION, /Art\. 283-2 du CGI/);
  const migrated = normalizeAgencyState("bookea", { identity: { name: "Bookea" } });
  assert.equal(migrated.identity.name, "Bookea Powered by Webk");
  assert.equal(migrated.identity.legalName, "SFK Web K Agency LLC");
});

test("le prochain cycle est 30 jours après la facture", () => {
  assert.equal(nextBillingCycleOn("2026-10-03"), "2026-11-02");
});

test("l’alerte J-3 se déclenche uniquement dans la fenêtre", () => {
  assert.equal(
    isWithinReminderWindow("2026-10-07", new Date("2026-10-04T09:00:00")),
    true,
  );
  assert.equal(
    isWithinReminderWindow("2026-10-07", new Date("2026-10-03T09:00:00")),
    false,
  );
  assert.equal(isOverdueCycle("2026-10-03", new Date("2026-10-04T09:00:00")), true);
});

test("seuls les clients actifs génèrent une notification de cycle", () => {
  const state = normalizeAgencyState("webk", {
    clients: [
      {
        id: "c1",
        name: "JFG",
        active: true,
        nextInvoiceOn: "2026-10-06",
      },
      {
        id: "c2",
        name: "Inactif",
        active: false,
        nextInvoiceOn: "2026-10-06",
      },
    ],
  });
  const alerts = billingAlerts(state, new Date("2026-10-04T10:00:00"));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.clientName, "JFG");
  assert.equal(alerts[0]?.overdue, false);
});

test("le numéro de facture WebK s’incrémente sur l’année", () => {
  const state = normalizeAgencyState("webk", {
    invoices: [{ id: "1", clientId: "c1", issuedOn: "2026-01-01", number: "WK-2026-001" }],
  });
  assert.equal(nextInvoiceNumber(state, new Date("2026-10-04")), "WK-2026-002");
});

test("les KPI WebK séparent meta, phoning et RDV WA", () => {
  const invoices = [
    {
      id: "1",
      number: "WK-2026-001",
      clientId: "c1",
      issuedOn: "2026-10-02",
      nextCycleOn: "2026-11-01",
      status: "Payée" as const,
      comments: "",
      createdAt: "2026-10-02T00:00:00.000Z",
      lines: [
        { id: "l1", label: "Meta", kind: "meta" as const, quantity: 1, unitPrice: 400 },
        { id: "l2", label: "Phoning", kind: "phoning" as const, quantity: 1, unitPrice: 250 },
        { id: "l3", label: "RDV WA", kind: "rdv_wa" as const, quantity: 2, unitPrice: 50 },
      ],
    },
  ];
  assert.equal(invoiceTotal(invoices[0]), 750);
  const range = periodRange("mois", new Date("2026-10-04"));
  const inMonth = invoicesInRange(invoices, range.from, range.to);
  const kpi = kpiBreakdown(inMonth);
  assert.equal(kpi.meta, 400);
  assert.equal(kpi.phoning, 250);
  assert.equal(kpi.rdv_wa, 100);
  assert.equal(monthlyRevenue(invoices, 2026)[9], 750);
});
