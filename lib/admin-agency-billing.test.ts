import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENCY_BANK,
  AGENCY_LEGAL_ENTITY,
  REVERSE_CHARGE_MENTION,
  billingAlerts,
  unpaidChaseAlerts,
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
  ensureSubscriptionInvoice,
  emptyAgencyState,
  mergeAgencyClients,
  withCenterClients,
  addInvoiceComment,
  duplicateAgencyInvoice,
  defaultInvoicePeriod,
  formatInvoicePeriod,
  invoiceCommentLog,
  normalizeAgencyState,
  periodRange,
  inferServiceKind,
  invoiceMatchesSearch,
  kpiRows,
  revenueKpi,
  withInvoiceStatus,
  protectInvoicesFromEmptyOverwrite,
  mergeAgencyInvoices,
  keepInvoiceEdits,
  defaultAgencyInvoiceMail,
  withPayToken,
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

test("le chargement garde les factures locales même si le serveur revient vide", () => {
  const local = [
    {
      id: "wk-1",
      number: "WK-2026-004",
      clientId: "c1",
      issuedOn: "2026-10-08",
      nextCycleOn: "2026-11-07",
      status: "En attente de paiement" as const,
      lines: [],
      comments: "",
      invoiceNote: "",
      createdAt: "2026-10-08T10:00:00.000Z",
    },
  ];
  const merged = mergeAgencyInvoices(local, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.number, "WK-2026-004");
});

test("une édition et une facture déjà en base ne s’écrasent pas", () => {
  const current = [
    {
      id: "a",
      number: "WK-2026-001",
      clientId: "c1",
      issuedOn: "2026-10-01",
      nextCycleOn: "2026-10-31",
      status: "Payée" as const,
      lines: [],
      comments: "",
      invoiceNote: "",
      createdAt: "2026-10-01T10:00:00.000Z",
    },
  ];
  const created = [
    {
      id: "b",
      number: "WK-2026-002",
      clientId: "c1",
      issuedOn: "2026-10-09",
      nextCycleOn: "2026-11-08",
      status: "En attente de paiement" as const,
      lines: [],
      comments: "",
      invoiceNote: "",
      createdAt: "2026-10-09T10:00:00.000Z",
    },
    ...current,
  ];
  const kept = keepInvoiceEdits(created, current);
  assert.equal(kept.length, 2);
  const deleted = keepInvoiceEdits(current, created);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0]?.id, "a");
});

test("une sauvegarde vide n’efface pas les factures déjà enregistrées", () => {
  const current = normalizeAgencyState("bookea", {
    invoices: [
      {
        id: "1",
        number: "BK-2026-001",
        clientId: "c1",
        issuedOn: "2026-10-04",
      },
    ],
  });
  const empty = normalizeAgencyState("bookea", { invoices: [] });
  const kept = protectInvoicesFromEmptyOverwrite(empty, current);
  assert.equal(kept.invoices[0]?.number, "BK-2026-001");
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

test("le renouvellement remonte 3 semaines et 5 jours après l’émission, puis disparaît", () => {
  const client = {
    id: "c1",
    name: "JFG Clinic Clermont-ferrand",
    active: true,
    nextInvoiceOn: "2026-11-07",
  };
  const issued = {
    id: "f1",
    number: "WK-2026-010",
    clientId: "c1",
    issuedOn: "2026-10-08",
    nextCycleOn: "2026-11-07",
    status: "Payée",
  };
  const before = billingAlerts(
    normalizeAgencyState("webk", { clients: [client], invoices: [issued] }),
    new Date("2026-11-02T10:00:00"),
  );
  assert.equal(before.length, 0);
  const due = billingAlerts(
    normalizeAgencyState("webk", { clients: [client], invoices: [issued] }),
    new Date("2026-11-03T10:00:00"),
  );
  assert.equal(due.length, 1);
  assert.match(due[0]?.label || "", /renouvellement/);
  const renewed = billingAlerts(
    normalizeAgencyState("webk", {
      clients: [{ ...client, nextInvoiceOn: "2026-12-03" }],
      invoices: [
        issued,
        {
          id: "f2",
          number: "WK-2026-011",
          clientId: "c1",
          issuedOn: "2026-11-03",
          nextCycleOn: "2026-12-03",
          status: "En attente de paiement",
        },
      ],
    }),
    new Date("2026-11-03T10:00:00"),
  );
  assert.equal(renewed.length, 0);
});

test("une facture impayée entre en relance au bout de 6 jours et en sort une fois payée", () => {
  const invoice = {
    id: "f1",
    number: "WK-2026-012",
    clientId: "c1",
    issuedOn: "2026-10-31",
    status: "En attente de paiement",
  };
  const client = { id: "c1", name: "HELIASKIN INSTITUT", active: true };
  const early = unpaidChaseAlerts(
    normalizeAgencyState("webk", { clients: [client], invoices: [invoice] }),
    new Date("2026-11-05T10:00:00"),
  );
  assert.equal(early.length, 0);
  const due = unpaidChaseAlerts(
    normalizeAgencyState("webk", { clients: [client], invoices: [invoice] }),
    new Date("2026-11-06T10:00:00"),
  );
  assert.equal(due.length, 1);
  assert.match(due[0]?.label || "", /HELIASKIN/);
  const paid = unpaidChaseAlerts(
    normalizeAgencyState("webk", {
      clients: [client],
      invoices: [{ ...invoice, status: "Payée" }],
    }),
    new Date("2026-11-20T10:00:00"),
  );
  assert.equal(paid.length, 0);
});

test("une notif de souscription prépare une facture Bookea sans doublon", () => {
  const center = {
    id: "center-1",
    name: "JFG Clinic",
    legalName: "JFG Clinic SARL",
    address: "12 rue de la Paix",
    email: "contact@jfg.fr",
    phone: "0473000000",
    city: "Clermont",
  };
  const alert = {
    id: "alert-wa",
    kind: "seya_pack" as const,
    amountEuros: 129.95,
    quantity: 200,
    message: "JFG Clinic a souscrit 200 conversations Seya — 129,95 €",
    createdAt: "2026-10-09T10:00:00.000Z",
  };
  const first = ensureSubscriptionInvoice(emptyAgencyState("bookea"), {
    center,
    alert,
  });
  assert.equal(first.created, true);
  assert.equal(first.invoice.number, "BK-2026-001");
  assert.equal(first.invoice.lines[0]?.label, "Pack WhatsApp 200 conversations Seya");
  assert.equal(first.invoice.lines[0]?.unitPrice, 129.95);
  assert.equal(first.state.clients[0]?.email, "contact@jfg.fr");

  const second = ensureSubscriptionInvoice(first.state, { center, alert });
  assert.equal(second.created, false);
  assert.equal(second.invoice.id, first.invoice.id);
  assert.equal(second.state.invoices.length, 1);
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

test("les périodes KPI couvrent la semaine, le mois, le trimestre et l’année entiers", () => {
  const now = new Date(2026, 10, 3, 9, 17);
  assert.deepEqual(periodRange("semaine", now), { from: "2026-11-02", to: "2026-11-08" });
  assert.deepEqual(periodRange("mois", now), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(periodRange("trimestre", now), { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(periodRange("annee", now), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(periodRange("mois", new Date(2026, 1, 10)), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
  assert.deepEqual(periodRange("semaine", new Date(2026, 10, 1)), {
    from: "2026-10-26",
    to: "2026-11-01",
  });
  assert.deepEqual(periodRange("custom", now, "2026-10-01", "2026-10-31"), {
    from: "2026-10-01",
    to: "2026-10-31",
  });
});

test("CA, catégories et tendance comptent les factures émises sur la période", () => {
  const state = normalizeAgencyState("webk", {
    invoices: [
      {
        id: "oct-paid",
        clientId: "c1",
        issuedOn: "2026-10-14",
        status: "Payée",
        lines: [
          { label: "Budget Meta", kind: "meta", quantity: 1, unitPrice: 500 },
          { label: "Frais de gestion", kind: "gestion", quantity: 1, unitPrice: 160 },
        ],
      },
      {
        id: "oct-pending",
        clientId: "c2",
        issuedOn: "2026-10-14",
        status: "En attente de paiement",
        lines: [
          { label: "Gestion des réseaux", kind: "autre", quantity: 1, unitPrice: 300 },
          { label: "Offre phoning", quantity: 2, unitPrice: 100 },
          { label: "Pack WhatsApp", kind: "whatsapp", quantity: 1, unitPrice: 79 },
          { label: "Prestation annexe", kind: "autre", quantity: 1, unitPrice: 40 },
        ],
      },
      {
        id: "nov-later",
        clientId: "c3",
        issuedOn: "2026-11-20",
        status: "En attente de paiement",
        lines: [{ label: "RDV WhatsApp", kind: "rdv_wa", quantity: 3, unitPrice: 20 }],
      },
      {
        id: "draft",
        clientId: "c3",
        issuedOn: "2026-10-20",
        status: "Brouillon",
        lines: [{ label: "Budget Meta", kind: "meta", quantity: 1, unitPrice: 999 }],
      },
    ],
  });
  const now = new Date(2026, 9, 30);
  const range = periodRange("mois", now);
  const october = invoicesInRange(state.invoices, range.from, range.to);
  assert.deepEqual(revenueKpi(october), { billed: 1279, paid: 660, count: 2 });

  const rows = kpiRows("webk", kpiBreakdown(october));
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ["Budget Meta", 500],
      ["Phoning", 200],
      ["Réseaux", 300],
      ["RDV WhatsApp", 0],
      ["Frais de gestion", 160],
      ["Annexes", 119],
    ],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.value, 0),
    revenueKpi(october).billed,
  );

  const november = periodRange("mois", new Date(2026, 10, 3));
  assert.deepEqual(
    revenueKpi(invoicesInRange(state.invoices, november.from, november.to)),
    { billed: 60, paid: 0, count: 1 },
  );

  const bars = monthlyRevenue(invoicesInRange(state.invoices, "2026-01-01", "2026-12-31"), 2026);
  assert.equal(bars[9], 1279);
  assert.equal(bars[10], 60);
  assert.equal(bars.reduce((sum, value) => sum + value, 0), 1339);
});

test("une prestation ajoutée à la main prend la catégorie de son libellé", () => {
  assert.equal(inferServiceKind("Budget publicitaire Meta"), "meta");
  assert.equal(inferServiceKind("Campagne Facebook / Instagram"), "meta");
  assert.equal(inferServiceKind("Gestion des réseaux sociaux"), "reseaux");
  assert.equal(inferServiceKind("RDV WhatsApp"), "rdv_wa");
  assert.equal(inferServiceKind("Frais de gestion"), "gestion");
  assert.equal(inferServiceKind("Offre Phoning"), "phoning");
  assert.equal(inferServiceKind("Pack WhatsApp 200 conversations Seya"), "whatsapp");
  assert.equal(inferServiceKind("Bookea CRM + SMS"), "crm_sms");
  assert.equal(inferServiceKind("Pack SMS 50 crédits"), "sms");
  assert.equal(inferServiceKind("Shooting photo"), "autre");
  assert.equal(inferServiceKind("Leads qualifiés"), "autre");
});

test("la recherche retrouve une facture par centre ou numéro, sans tenir compte des accents", () => {
  const client = { name: "Institut Beauté Élégance", legalName: "SARL Belle Peau", city: "Pélissanne" };
  const invoice = { clientId: "c1", number: "WK-2026-019" };
  assert.equal(invoiceMatchesSearch(invoice, client, ""), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "elegance"), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "BEAUTE inst"), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "belle peau"), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "pelissanne"), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "wk-2026-019"), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "019"), true);
  assert.equal(invoiceMatchesSearch(invoice, client, "020"), false);
  assert.equal(invoiceMatchesSearch(invoice, client, "venelles"), false);
  assert.equal(invoiceMatchesSearch(invoice, undefined, "2026-019"), true);
});

test("passer une facture en Payée date le règlement, la rouvrir l’efface", () => {
  const [invoice] = normalizeAgencyState("webk", {
    invoices: [{ id: "a", clientId: "c1", issuedOn: "2026-10-14", status: "En attente de paiement" }],
  }).invoices;
  const paid = withInvoiceStatus(invoice, "Payée", new Date("2026-11-03T08:00:00.000Z"));
  assert.equal(paid.status, "Payée");
  assert.equal(paid.paidAt, "2026-11-03T08:00:00.000Z");
  assert.equal(withInvoiceStatus(paid, "Payée"), paid);
  const reopened = withInvoiceStatus(paid, "En retard");
  assert.equal(reopened.status, "En retard");
  assert.equal(reopened.paidAt, undefined);
  assert.equal("paidAt" in reopened, false);
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

test("les clients de deux appareils se cumulent au lieu de garder la plus longue liste", () => {
  const base = {
    centerId: "",
    legalName: "",
    address: "",
    email: "",
    phone: "",
    city: "",
    active: true,
    phoningOffer: false,
    comments: "",
    firstInvoiceOn: "",
    nextInvoiceOn: "",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  const merged = mergeAgencyClients(
    [{ ...base, id: "a", name: "Client A modifié" }],
    [
      { ...base, id: "a", name: "Client A" },
      { ...base, id: "b", name: "Client B" },
    ],
  );
  assert.deepEqual(
    merged.map((client) => client.name).sort(),
    ["Client A modifié", "Client B"],
  );
});

test("en Bookea, chaque centre est proposé comme client une seule fois", () => {
  const center = {
    id: "center-1",
    name: "JFG Clinic GAP",
    legalName: "",
    address: "",
    email: "gap@example.com",
    phone: "",
    city: "Gap",
  };
  const once = withCenterClients(emptyAgencyState("bookea"), [center]);
  assert.equal(once.clients.length, 1);
  assert.equal(once.clients[0].centerId, "center-1");
  assert.equal(withCenterClients(once, [center]), once);
});

test("seule la facture réellement modifiée est datée, et la plus récente gagne", () => {
  const current = normalizeAgencyState("webk", {
    invoices: [
      { id: "a", clientId: "c1", issuedOn: "2026-10-14", status: "En attente de paiement" },
      { id: "b", clientId: "c1", issuedOn: "2026-10-14", status: "En attente de paiement" },
    ],
  }).invoices;
  const next = current.map((item) =>
    item.id === "a" ? { ...item, status: "Payée" as const } : item,
  );
  const stamped = keepInvoiceEdits(next, current, new Date("2026-10-30T18:05:00.000Z"));
  const a = stamped.find((item) => item.id === "a");
  const b = stamped.find((item) => item.id === "b");
  assert.equal(a?.status, "Payée");
  assert.equal(a?.editedAt, "2026-10-30T18:05:00.000Z");
  assert.equal(b?.editedAt, undefined);

  const staleDevice = current;
  const merged = mergeAgencyInvoices(stamped, staleDevice);
  assert.equal(merged.find((item) => item.id === "a")?.status, "Payée");
  const reopened = mergeAgencyInvoices(staleDevice, stamped);
  assert.equal(reopened.find((item) => item.id === "a")?.status, "Payée");
});

test("une facture payée par carte côté serveur n’est pas écrasée par la copie de l’appareil", () => {
  const local = normalizeAgencyState("bookea", {
    invoices: [
      { id: "a", clientId: "c1", issuedOn: "2026-10-10", status: "En attente de paiement" },
    ],
  }).invoices;
  const remote = normalizeAgencyState("bookea", {
    revision: 4,
    invoices: [
      {
        id: "a",
        clientId: "c1",
        issuedOn: "2026-10-10",
        status: "Payée",
        paidAt: "2026-10-10T12:00:00.000Z",
        paymentMethod: "carte",
        serverRevision: 4,
      },
    ],
  });
  assert.equal(remote.revision, 4);
  const merged = mergeAgencyInvoices(local, remote.invoices);
  assert.equal(merged[0].status, "Payée");
  assert.equal(merged[0].paymentMethod, "carte");
});

test("dupliquer une facture payée par carte ne recopie ni le paiement ni le lien", () => {
  const state = normalizeAgencyState("bookea", {});
  const copy = duplicateAgencyInvoice(state, {
    id: "1",
    number: "BK-2026-001",
    clientId: "c1",
    issuedOn: "2026-10-04",
    nextCycleOn: "2026-11-03",
    status: "Payée",
    comments: "",
    invoiceNote: "",
    createdAt: "2026-10-04T00:00:00.000Z",
    lines: [],
    sourceAlertId: "alert-1",
    emailedAt: "2026-10-04T00:00:00.000Z",
    paidAt: "2026-10-05T00:00:00.000Z",
    paymentMethod: "carte",
    payToken: "token",
    stripeSessionIds: ["cs_1"],
    serverRevision: 3,
  });
  for (const key of ["sourceAlertId", "emailedAt", "paidAt", "paymentMethod", "payToken", "stripeSessionIds", "serverRevision"]) {
    assert.equal(key in copy, false, key);
  }
  assert.equal(copy.status, "En attente de paiement");
});

test("une facture WebK a son lien de paiement dans le PDF et dans l’e-mail prérempli", () => {
  const state = normalizeAgencyState("webk", {
    ...emptyAgencyState("webk"),
    clients: [{ id: "c1", name: "JFG Clinic", email: "jfg@example.com" }],
  });
  const invoice = withPayToken({
    id: "w1",
    number: "WK-2026-001",
    clientId: "c1",
    issuedOn: "2026-10-11",
    nextCycleOn: "2026-11-10",
    status: "En attente de paiement",
    lines: [
      {
        id: "l1",
        label: "Site internet",
        kind: "autre",
        quantity: 1,
        unitPrice: 500,
        discountType: "Aucune",
        discountValue: 0,
      },
    ],
    comments: "",
    commentLog: [],
    invoiceNote: "",
    createdAt: "2026-10-11T10:00:00.000Z",
  });
  assert.ok(invoice.payToken);
  assert.equal(withPayToken(invoice), invoice);

  const mail = defaultAgencyInvoiceMail(state, invoice);
  assert.equal(mail.to, "jfg@example.com");
  assert.equal(mail.subject, "Votre facture WK-2026-001");
  assert.match(mail.message, /^Bonjour JFG Clinic,/);
  assert.match(mail.message, /montant de 500\s€/);
  assert.match(mail.message, /\/api\/billing\/pay\?i=w1&t=/);
  assert.match(buildAgencyInvoiceHtml(state, invoice), /\/api\/billing\/pay\?i=w1&amp;t=/);

  const paid = { ...invoice, status: "Payée" as const };
  assert.doesNotMatch(defaultAgencyInvoiceMail(state, paid).message, /api\/billing\/pay/);
  assert.doesNotMatch(buildAgencyInvoiceHtml(state, paid), /api\/billing\/pay/);
});
