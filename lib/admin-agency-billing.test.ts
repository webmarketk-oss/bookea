import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENCY_BANK,
  AGENCY_LEGAL_ENTITY,
  REVERSE_CHARGE_MENTION,
  billingAlerts,
  buildAgencyInvoiceHtml,
  defaultAgencyIdentity,
  lineNet,
  invoicesInRange,
  invoiceTotal,
  isOverdueCycle,
  isWithinReminderWindow,
  kpiBreakdown,
  monthlyRevenue,
  pendingPaymentKpi,
  nextBillingCycleOn,
  nextInvoiceNumber,
  duplicateAgencyInvoice,
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
  const html = buildAgencyInvoiceHtml(
    {
      ...migrated,
      clients: [{ id: "c1", name: "JFG", email: "", phone: "", city: "Clermont", centerId: "", active: true, phoningOffer: false, comments: "", firstInvoiceOn: "", nextInvoiceOn: "", createdAt: "" }],
      invoices: [],
    },
    {
      id: "i1",
      number: "BK-2026-001",
      clientId: "c1",
      issuedOn: "2026-10-04",
      nextCycleOn: "2026-11-03",
      status: "Émise",
      comments: "",
      invoiceNote: "Merci de régler sous 8 jours.",
      createdAt: "",
      lines: [{ id: "l1", label: "Pack WhatsApp", kind: "whatsapp", quantity: 1, unitPrice: 79 }],
    },
  );
  assert.match(html, /Bookea Powered by Webk/);
  assert.match(html, /bookea-invoice-logo\.png/);
  assert.match(html, /Autoliquidation par le preneur/);
  assert.doesNotMatch(html, /TVA\s*:/);
  assert.doesNotMatch(html, /Prix HT|Total HT|\bHT<\/h1>/);
  assert.match(html, /BK-2026-001/);
  assert.match(html, /BE21 9055 5762 3503/);
  assert.match(html, /TRWIBEB1XXX/);
  assert.match(html, /Merci de régler sous 8 jours/);
  assert.match(html, /Wise/);
  assert.match(html, /Rue du Trône 100/);
  assert.equal(migrated.bank.iban, "BE21 9055 5762 3503");
  assert.equal(DEFAULT_AGENCY_BANK.accountName, "SFK WEBK AGENCY LLC");
});

test("le prochain cycle est 30 jours après la facture", () => {
  assert.equal(nextBillingCycleOn("2026-10-03"), "2026-11-02");
});

test("dupliquer une facture recopie les lignes sur le mois suivant", () => {
  const state = normalizeAgencyState("webk", {
    invoices: [{ id: "1", clientId: "c1", issuedOn: "2026-10-04", number: "WK-2026-001" }],
  });
  const copy = duplicateAgencyInvoice(state, {
    id: "1",
    number: "WK-2026-001",
    clientId: "c1",
    issuedOn: "2026-10-04",
    nextCycleOn: "2026-11-03",
    status: "Payée",
    comments: "interne",
    invoiceNote: "Merci",
    createdAt: "2026-10-04T00:00:00.000Z",
    lines: [
      {
        id: "l1",
        label: "Meta",
        kind: "meta",
        quantity: 1,
        unitPrice: 400,
        discountType: "€",
        discountValue: 50,
      },
    ],
  });
  assert.notEqual(copy.id, "1");
  assert.equal(copy.number, "WK-2026-002");
  assert.equal(copy.issuedOn, "2026-11-03");
  assert.equal(copy.nextCycleOn, "2026-12-03");
  assert.equal(copy.status, "Émise");
  assert.equal(copy.clientId, "c1");
  assert.equal(copy.invoiceNote, "Merci");
  assert.equal(copy.lines[0]?.label, "Meta");
  assert.equal(copy.lines[0]?.discountValue, 50);
  assert.notEqual(copy.lines[0]?.id, "l1");
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
  assert.equal(kpi.gestion, 0);
  const withFees = normalizeAgencyState("webk", { services: [] });
  assert.equal(
    withFees.services.some((item) => item.kind === "gestion"),
    true,
  );
  assert.equal(monthlyRevenue(invoices, 2026)[9], 750);
});

test("les KPI comptent les factures en attente de règlement", () => {
  const unpaid = pendingPaymentKpi([
    {
      id: "1",
      number: "WK-2026-001",
      clientId: "c1",
      issuedOn: "2026-09-02",
      nextCycleOn: "2026-10-02",
      status: "Émise",
      comments: "",
      invoiceNote: "",
      createdAt: "",
      lines: [
        {
          id: "l1",
          label: "Meta",
          kind: "meta",
          quantity: 1,
          unitPrice: 400,
          discountType: "Aucune",
          discountValue: 0,
        },
      ],
    },
    {
      id: "2",
      number: "WK-2026-002",
      clientId: "c1",
      issuedOn: "2026-10-02",
      nextCycleOn: "2026-11-01",
      status: "En retard",
      comments: "",
      invoiceNote: "",
      createdAt: "",
      lines: [
        {
          id: "l2",
          label: "Phoning",
          kind: "phoning",
          quantity: 1,
          unitPrice: 250,
          discountType: "Aucune",
          discountValue: 0,
        },
      ],
    },
    {
      id: "3",
      number: "WK-2026-003",
      clientId: "c1",
      issuedOn: "2026-10-03",
      nextCycleOn: "2026-11-02",
      status: "Payée",
      comments: "",
      invoiceNote: "",
      createdAt: "",
      lines: [
        {
          id: "l3",
          label: "Meta",
          kind: "meta",
          quantity: 1,
          unitPrice: 400,
          discountType: "Aucune",
          discountValue: 0,
        },
      ],
    },
  ]);
  assert.equal(unpaid.count, 2);
  assert.equal(unpaid.amount, 650);
});

test("une remise s’applique en euros ou en pourcentage sur la prestation", () => {
  assert.equal(
    lineNet({
      id: "1",
      label: "Meta",
      kind: "meta",
      quantity: 1,
      unitPrice: 400,
      discountType: "%",
      discountValue: 10,
    }),
    360,
  );
  assert.equal(
    lineNet({
      id: "2",
      label: "Phoning",
      kind: "phoning",
      quantity: 1,
      unitPrice: 250,
      discountType: "€",
      discountValue: 50,
    }),
    200,
  );
});
