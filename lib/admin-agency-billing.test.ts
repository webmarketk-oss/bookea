import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENCY_BANK,
  AGENCY_LEGAL_ENTITY,
  REVERSE_CHARGE_MENTION,
  billingAlerts,
  billingCenterContactFromRow,
  buildAgencyInvoiceHtml,
  defaultAgencyIdentity,
  invoiceClientDetails,
  syncAgencyClientsWithCenters,
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
  addInvoiceComment,
  duplicateAgencyInvoice,
  defaultInvoicePeriod,
  formatInvoicePeriod,
  invoiceCommentLog,
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
      clients: [{ id: "c1", name: "JFG", legalName: "JFG Clinic SARL", address: "12 rue de la Paix, 63000 Clermont-Ferrand", email: "contact@jfg.fr", phone: "04 73 00 00 00", city: "Clermont", centerId: "", active: true, phoningOffer: false, comments: "", firstInvoiceOn: "", nextInvoiceOn: "", createdAt: "" }],
      invoices: [],
    },
    {
      id: "i1",
      number: "BK-2026-001",
      clientId: "c1",
      issuedOn: "2026-10-04",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      nextCycleOn: "2026-11-03",
      status: "En attente de paiement",
      comments: "Relancée par SMS",
      commentLog: [
        {
          id: "n1",
          text: "Relancée par SMS le 4 octobre à 11h30",
          createdAt: "2026-10-04T09:30:00.000Z",
        },
      ],
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
  assert.match(html, /Période : Du 01\/10\/2026 au 31\/10\/2026/);
  assert.match(html, /BE21 9055 5762 3503/);
  assert.match(html, /TRWIBEB1XXX/);
  assert.match(html, /Merci de régler sous 8 jours/);
  assert.doesNotMatch(html, /Relancée par SMS/);
  assert.match(html, /Wise/);
  assert.match(html, /Rue du Trône 100/);
  assert.match(html, /Helvetica Neue/);
  assert.match(html, /JFG Clinic SARL/);
  assert.match(html, /12 rue de la Paix, 63000 Clermont-Ferrand/);
  assert.match(html, /04 73 00 00 00/);
  assert.match(html, /contact@jfg\.fr/);
  assert.doesNotMatch(html, /font-family: Arial, sans-serif/);
  assert.equal(migrated.bank.iban, "BE21 9055 5762 3503");
  assert.equal(DEFAULT_AGENCY_BANK.accountName, "SFK WEBK AGENCY LLC");
});

test("la facture reprend les coordonnées admin du centre", () => {
  const center = billingCenterContactFromRow({
    id: "center-1",
    name: "HELIASKIN INSTITUT",
    city: "LYON",
    email: "contact@heliaskininstitut.com",
    phone: null,
    address_line1: null,
    postal_code: "69006",
    legal: { legalName: "Heliaskin Institut SARL" },
    publicCenter: {
      address: "1209 rue Bellecombe",
      phone: "04 78 00 00 00",
      email: "contact@heliaskininstitut.com",
    },
  });
  assert.equal(center.legalName, "Heliaskin Institut SARL");
  assert.equal(center.address, "1209 rue Bellecombe, 69006 LYON");
  assert.equal(center.phone, "04 78 00 00 00");
  assert.equal(center.email, "contact@heliaskininstitut.com");
  const details = invoiceClientDetails({
    name: "HELIASKIN INSTITUT",
    legalName: center.legalName,
    address: center.address,
    phone: center.phone,
    email: center.email,
    city: center.city,
  });
  assert.deepEqual(details.lines, [
    "Heliaskin Institut SARL",
    "1209 rue Bellecombe, 69006 LYON",
    "04 78 00 00 00",
    "contact@heliaskininstitut.com",
  ]);
  const synced = syncAgencyClientsWithCenters(
    [
      {
        id: "c1",
        centerId: "center-1",
        name: "HELIASKIN INSTITUT",
        legalName: "",
        address: "",
        email: "contact@heliaskininstitut.com",
        phone: "",
        city: "LYON",
        active: true,
        phoningOffer: false,
        comments: "",
        firstInvoiceOn: "",
        nextInvoiceOn: "",
        createdAt: "",
      },
    ],
    [center],
  );
  assert.equal(synced[0]?.legalName, "Heliaskin Institut SARL");
  assert.equal(synced[0]?.address, "1209 rue Bellecombe, 69006 LYON");
  assert.equal(synced[0]?.phone, "04 78 00 00 00");
  const emptyLegal = invoiceClientDetails({
    name: "HELIASKIN INSTITUT",
    legalName: "",
    address: "Lyon",
    phone: "",
    email: "contact@heliaskininstitut.com",
    city: "LYON",
  });
  assert.deepEqual(emptyLegal.lines, ["Lyon", "contact@heliaskininstitut.com"]);
});

test("le prochain cycle est 30 jours après la facture", () => {
  assert.equal(nextBillingCycleOn("2026-10-03"), "2026-11-02");
});

test("la période de facturation couvre le cycle jusqu’à la veille du suivant", () => {
  const period = defaultInvoicePeriod("2026-10-04");
  assert.equal(period.periodFrom, "2026-10-04");
  assert.equal(period.periodTo, "2026-11-02");
  assert.equal(
    formatInvoicePeriod(period),
    "Du 04/10/2026 au 02/11/2026",
  );
});

test("une ancienne facture émise passe en attente de paiement", () => {
  const state = normalizeAgencyState("webk", {
    invoices: [
      {
        id: "1",
        number: "WK-2026-001",
        clientId: "c1",
        issuedOn: "2026-10-04",
        status: "Émise",
      },
    ],
  });
  assert.equal(state.invoices[0]?.status, "En attente de paiement");
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
    periodFrom: "2026-10-01",
    periodTo: "2026-10-31",
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
  assert.equal(copy.status, "En attente de paiement");
  assert.equal(copy.clientId, "c1");
  assert.equal(copy.invoiceNote, "Merci");
  assert.equal(copy.comments, "");
  assert.deepEqual(copy.commentLog, []);
  assert.equal(copy.periodFrom, "2026-10-31");
  assert.equal(copy.periodTo, "2026-11-30");
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
      status: "En attente de paiement",
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

test("un suivi interne s’ajoute avec la date et reste hors facture", () => {
  const invoice = {
    id: "1",
    number: "WK-2026-001",
    clientId: "c1",
    issuedOn: "2026-10-04",
    nextCycleOn: "2026-11-03",
    status: "En attente de paiement" as const,
    comments: "Ancien suivi",
    invoiceNote: "",
    createdAt: "2026-10-04T08:00:00.000Z",
    lines: [],
  };
  const migrated = invoiceCommentLog(invoice);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0]?.text, "Ancien suivi");
  const updated = addInvoiceComment(
    invoice,
    "Relancée par mail",
    new Date("2026-10-04T11:30:00.000Z"),
  );
  assert.equal(updated.comments, "Relancée par mail");
  assert.equal(updated.commentLog?.[0]?.text, "Relancée par mail");
  assert.equal(updated.commentLog?.[0]?.createdAt, "2026-10-04T11:30:00.000Z");
  assert.equal(updated.commentLog?.[1]?.text, "Ancien suivi");
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
