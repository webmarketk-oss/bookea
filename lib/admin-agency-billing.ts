export type AgencyCompany = "webk" | "bookea";

export type AgencyInvoiceStatus =
  | "Brouillon"
  | "En attente de paiement"
  | "Payée"
  | "En retard"
  | "Annulée";

export const AGENCY_INVOICE_STATUSES: AgencyInvoiceStatus[] = [
  "Brouillon",
  "En attente de paiement",
  "Payée",
  "En retard",
  "Annulée",
];

export type AgencyServiceKind =
  | "meta"
  | "phoning"
  | "reseaux"
  | "rdv_wa"
  | "gestion"
  | "whatsapp"
  | "crm_sms"
  | "sms"
  | "autre";

export type AgencyPeriod = "semaine" | "mois" | "trimestre" | "annee" | "custom";

export type AgencyDiscountType = "Aucune" | "€" | "%";

export type AgencyIdentity = {
  name: string;
  legalName: string;
  contactName: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  siret: string;
  email: string;
  phone: string;
  vatNumber: string;
};

export type AgencyBankDetails = {
  accountName: string;
  iban: string;
  bic: string;
  bankName: string;
  bankAddress: string;
};

export type AgencyClient = {
  id: string;
  centerId: string;
  name: string;
  legalName: string;
  address: string;
  email: string;
  phone: string;
  city: string;
  active: boolean;
  phoningOffer: boolean;
  comments: string;
  firstInvoiceOn: string;
  nextInvoiceOn: string;
  createdAt: string;
};

export type BillingCenterContact = {
  id: string;
  name: string;
  legalName: string;
  address: string;
  email: string;
  phone: string;
  city: string;
};

export type AgencyService = {
  id: string;
  label: string;
  unitPrice: number;
  kind: AgencyServiceKind;
};

export type AgencyInvoiceLine = {
  id: string;
  label: string;
  kind: AgencyServiceKind;
  quantity: number;
  unitPrice: number;
  discountType: AgencyDiscountType;
  discountValue: number;
};

export type AgencyInvoiceComment = {
  id: string;
  text: string;
  createdAt: string;
};

export type AgencyInvoice = {
  id: string;
  number: string;
  clientId: string;
  issuedOn: string;
  periodFrom?: string;
  periodTo?: string;
  nextCycleOn: string;
  status: AgencyInvoiceStatus;
  lines: AgencyInvoiceLine[];
  comments: string;
  commentLog?: AgencyInvoiceComment[];
  invoiceNote: string;
  createdAt: string;
};

export type AgencyBillingState = {
  company: AgencyCompany;
  identity: AgencyIdentity;
  bank: AgencyBankDetails;
  clients: AgencyClient[];
  services: AgencyService[];
  invoices: AgencyInvoice[];
  updatedAt: string;
};

export const AGENCY_COMPANIES: Array<{
  id: AgencyCompany;
  label: string;
  short: string;
}> = [
  { id: "webk", label: "WebK", short: "WK" },
  { id: "bookea", label: "Bookea", short: "BK" },
];

export const AGENCY_LEGAL_ENTITY = {
  legalName: "SFK Web K Agency LLC",
  contactName: "Samantha Kahlaoui",
  address: "1209 MOUNTAIN ROAD PL NE",
  postalCode: "87110",
  city: "ALBUQUERQUE",
  country: "États-Unis",
};

export const REVERSE_CHARGE_MENTION =
  "Il s’agit d’une prestation de services internationale transfrontalière. Autoliquidation par le preneur — Reverse Charge - Art. 283-2 du CGI. TVA non applicable.";

export const DEFAULT_AGENCY_BANK: AgencyBankDetails = {
  accountName: "SFK WEBK AGENCY LLC",
  iban: "BE21 9055 5762 3503",
  bic: "TRWIBEB1XXX",
  bankName: "Wise",
  bankAddress: "Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
};

export function defaultAgencyIdentity(company: AgencyCompany): AgencyIdentity {
  return {
    name: company === "webk" ? "WEBK" : "Bookea Powered by Webk",
    legalName: AGENCY_LEGAL_ENTITY.legalName,
    contactName: AGENCY_LEGAL_ENTITY.contactName,
    address: AGENCY_LEGAL_ENTITY.address,
    postalCode: AGENCY_LEGAL_ENTITY.postalCode,
    city: AGENCY_LEGAL_ENTITY.city,
    country: AGENCY_LEGAL_ENTITY.country,
    siret: "",
    email: "",
    phone: "",
    vatNumber: "",
  };
}

export function companyLabel(company: AgencyCompany) {
  return AGENCY_COMPANIES.find((item) => item.id === company)?.label || company;
}

export function agencyInvoiceLogoPath(company: AgencyCompany) {
  return company === "webk" ? "/webk-invoice-logo.png" : "/bookea-invoice-logo.png";
}

export function agencyInvoiceLogoSrc(company: AgencyCompany) {
  const path = agencyInvoiceLogoPath(company);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

function invoiceBrandName(
  company: AgencyCompany,
  stored: unknown,
  fallback: string,
) {
  const current = String(stored || "").trim();
  if (!current || current === "WebK" || current === "Bookea") {
    return fallback;
  }
  return current;
}

export function bankTransferLines(bank: AgencyBankDetails) {
  return [
    `Nom : ${bank.accountName}`,
    `IBAN : ${bank.iban}`,
    `Swift/BIC : ${bank.bic}`,
    `Banque : ${bank.bankName}`,
    bank.bankAddress,
  ].filter((line) => !line.endsWith(": ") && line.trim());
}

export function issuerAddressLines(identity: AgencyIdentity) {
  return [
    identity.legalName,
    identity.contactName,
    identity.address,
    [identity.postalCode, identity.city].filter(Boolean).join(" "),
    identity.country,
  ].filter(Boolean);
}

function firstFilled(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function includesIgnoreCase(haystack: string, needle: string) {
  return Boolean(needle) && haystack.toLowerCase().includes(needle.toLowerCase());
}

export function billingCenterContactFromRow(row: {
  id?: unknown;
  name?: unknown;
  city?: unknown;
  email?: unknown;
  phone?: unknown;
  address_line1?: unknown;
  postal_code?: unknown;
  legal?: { legalName?: unknown } | null;
  publicCenter?: {
    legalName?: unknown;
    address?: unknown;
    phone?: unknown;
    email?: unknown;
  } | null;
  settings?: {
    legal?: { legalName?: unknown };
    center?: {
      legalName?: unknown;
      address?: unknown;
      phone?: unknown;
      email?: unknown;
    };
    public?: {
      center?: {
        legalName?: unknown;
        address?: unknown;
        phone?: unknown;
        email?: unknown;
      };
    };
  } | null;
}): BillingCenterContact {
  const settings = row.settings || {};
  const settingsCenter = settings.center || {};
  const legal = row.legal || settings.legal || {};
  const publicCenter = row.publicCenter || settings.public?.center || {};
  const city = firstFilled(row.city);
  const street = firstFilled(
    row.address_line1,
    publicCenter.address,
    settingsCenter.address,
  );
  const cityLine = [firstFilled(row.postal_code), city].filter(Boolean).join(" ");
  const address =
    street &&
    cityLine &&
    !includesIgnoreCase(street, cityLine) &&
    !includesIgnoreCase(street, city)
      ? `${street}, ${cityLine}`
      : street || cityLine;

  return {
    id: String(row.id || ""),
    name: firstFilled(row.name) || "Centre",
    legalName: firstFilled(
      legal.legalName,
      publicCenter.legalName,
      settingsCenter.legalName,
    ),
    address,
    email: firstFilled(row.email, publicCenter.email, settingsCenter.email),
    phone: firstFilled(row.phone, publicCenter.phone, settingsCenter.phone),
    city,
  };
}

export function invoiceClientDetails(
  client?: Pick<
    AgencyClient,
    "name" | "legalName" | "address" | "phone" | "email" | "city"
  > | null,
) {
  if (!client) {
    return { title: "—", lines: [] as string[] };
  }
  const title = client.name.trim() || "—";
  const legalName = client.legalName.trim();
  const address = client.address.trim();
  const lines = [
    legalName && legalName.toLowerCase() !== title.toLowerCase() ? legalName : "",
    address,
    !address ? client.city.trim() : "",
    client.phone.trim(),
    client.email.trim(),
  ].filter(Boolean);
  return { title, lines };
}

export function applyBillingCenterContact(
  client: AgencyClient,
  center: BillingCenterContact,
): AgencyClient {
  const next = {
    ...client,
    name: center.name || client.name,
    legalName: center.legalName || client.legalName,
    address: center.address || client.address,
    email: center.email || client.email,
    phone: center.phone || client.phone,
    city: center.city || client.city,
  };
  return next.name === client.name &&
    next.legalName === client.legalName &&
    next.address === client.address &&
    next.email === client.email &&
    next.phone === client.phone &&
    next.city === client.city
    ? client
    : next;
}

export function syncAgencyClientsWithCenters(
  clients: AgencyClient[],
  centers: BillingCenterContact[],
) {
  const byId = new Map(centers.map((center) => [center.id, center]));
  return clients.map((client) => {
    const center = byId.get(client.centerId);
    return center ? applyBillingCenterContact(client, center) : client;
  });
}

export function withSyncedCenterContacts(
  state: AgencyBillingState,
  centers: BillingCenterContact[],
) {
  const clients = syncAgencyClientsWithCenters(state.clients, centers);
  return clients.some((client, index) => client !== state.clients[index])
    ? { ...state, clients }
    : state;
}

export function emptyAgencyState(company: AgencyCompany): AgencyBillingState {
  return {
    company,
    identity: defaultAgencyIdentity(company),
    bank: { ...DEFAULT_AGENCY_BANK },
    clients: [],
    services: defaultAgencyServices(company),
    invoices: [],
    updatedAt: new Date().toISOString(),
  };
}

function ensureDefaultServices(
  company: AgencyCompany,
  services: AgencyService[],
) {
  const current = services.length > 0 ? services : defaultAgencyServices(company);
  const kinds = new Set(current.map((item) => item.kind));
  const missing = defaultAgencyServices(company).filter(
    (item) => !kinds.has(item.kind),
  );
  return [...current, ...missing];
}

export function defaultAgencyServices(company: AgencyCompany): AgencyService[] {
  if (company === "webk") {
    return [
      service("Budget Meta", 0, "meta"),
      service("Offre phoning", 0, "phoning"),
      service("Gestion des réseaux", 0, "reseaux"),
      service("RDV WhatsApp", 0, "rdv_wa"),
      service("Frais de gestion", 0, "gestion"),
      service("Prestation annexe", 0, "autre"),
    ];
  }
  return [
    service("Pack WhatsApp", 79, "whatsapp"),
    service("CRM + SMS", 0, "crm_sms"),
    service("Pack SMS", 0, "sms"),
    service("Prestation annexe", 0, "autre"),
  ];
}

export function normalizeAgencyState(
  company: AgencyCompany,
  value: unknown,
): AgencyBillingState {
  const record = asRecord(value);
  const fallback = emptyAgencyState(company);
  const identity = asRecord(record.identity);
  const services = Array.isArray(record.services)
    ? record.services
        .map((item) => normalizeService(item))
        .filter((item): item is AgencyService => Boolean(item))
    : fallback.services;

  return {
    company,
    identity: {
      name: invoiceBrandName(company, identity.name, fallback.identity.name),
      legalName: String(identity.legalName || fallback.identity.legalName),
      contactName: String(identity.contactName || fallback.identity.contactName),
      address: String(identity.address || fallback.identity.address),
      postalCode: String(identity.postalCode || fallback.identity.postalCode),
      city: String(identity.city || fallback.identity.city),
      country: String(identity.country || fallback.identity.country),
      siret: String(identity.siret || ""),
      email: String(identity.email || ""),
      phone: String(identity.phone || ""),
      vatNumber: String(identity.vatNumber || ""),
    },
    bank: normalizeBank(record.bank),
    clients: Array.isArray(record.clients)
      ? record.clients
          .map((item) => normalizeClient(item))
          .filter((item): item is AgencyClient => Boolean(item))
      : [],
    services: ensureDefaultServices(company, services),
    invoices: Array.isArray(record.invoices)
      ? record.invoices
          .map((item) => normalizeInvoice(item))
          .filter((item): item is AgencyInvoice => Boolean(item))
      : [],
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

export function addDaysIso(value: string, days: number) {
  const date = parseIsoDate(value) || startOfDay(new Date());
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function nextBillingCycleOn(issuedOn: string) {
  return addDaysIso(issuedOn, 30);
}

export function defaultInvoicePeriod(issuedOn: string) {
  const periodFrom = issuedOn || toIsoDate(startOfDay(new Date()));
  return {
    periodFrom,
    periodTo: addDaysIso(nextBillingCycleOn(periodFrom), -1),
  };
}

export function invoicePeriod(
  invoice: Pick<AgencyInvoice, "issuedOn" | "periodFrom" | "periodTo">,
) {
  const fallback = defaultInvoicePeriod(invoice.issuedOn);
  return {
    periodFrom: invoice.periodFrom || fallback.periodFrom,
    periodTo: invoice.periodTo || fallback.periodTo,
  };
}

export function shiftInvoicePeriod(
  invoice: Pick<AgencyInvoice, "issuedOn" | "periodFrom" | "periodTo">,
  days = 30,
) {
  const period = invoicePeriod(invoice);
  return {
    periodFrom: addDaysIso(period.periodFrom, days),
    periodTo: addDaysIso(period.periodTo, days),
  };
}

export function formatInvoicePeriod(
  invoice: Pick<AgencyInvoice, "periodFrom" | "periodTo">,
) {
  if (!invoice.periodFrom && !invoice.periodTo) {
    return "";
  }
  if (invoice.periodFrom && invoice.periodTo) {
    return `Du ${formatShortDate(invoice.periodFrom)} au ${formatShortDate(invoice.periodTo)}`;
  }
  if (invoice.periodFrom) {
    return `À partir du ${formatShortDate(invoice.periodFrom)}`;
  }
  return `Jusqu’au ${formatShortDate(invoice.periodTo || "")}`;
}

export function isWithinReminderWindow(
  nextInvoiceOn: string,
  now = new Date(),
  daysBefore = 3,
) {
  const next = parseIsoDate(nextInvoiceOn);
  if (!next) {
    return false;
  }
  const today = startOfDay(now);
  const reminderStart = startOfDay(new Date(next));
  reminderStart.setDate(reminderStart.getDate() - daysBefore);
  return today.getTime() >= reminderStart.getTime() && today.getTime() <= next.getTime();
}

export function isOverdueCycle(nextInvoiceOn: string, now = new Date()) {
  const next = parseIsoDate(nextInvoiceOn);
  if (!next) {
    return false;
  }
  return startOfDay(now).getTime() > next.getTime();
}

export function lineGross(line: Pick<AgencyInvoiceLine, "quantity" | "unitPrice">) {
  return Number(line.quantity || 0) * Number(line.unitPrice || 0);
}

export function lineDiscountAmount(
  line: Pick<
    AgencyInvoiceLine,
    "quantity" | "unitPrice" | "discountType" | "discountValue"
  >,
) {
  const gross = lineGross(line);
  const value = Math.max(Number(line.discountValue) || 0, 0);
  if (line.discountType === "%") {
    return Math.min(gross, (gross * value) / 100);
  }
  if (line.discountType === "€") {
    return Math.min(gross, value);
  }
  return 0;
}

export function lineNet(line: AgencyInvoiceLine) {
  return Math.max(0, lineGross(line) - lineDiscountAmount(line));
}

export function invoiceTotal(invoice: Pick<AgencyInvoice, "lines">) {
  return invoice.lines.reduce((sum, line) => sum + lineNet(line), 0);
}

export function buildAgencyInvoiceHtml(
  state: AgencyBillingState,
  invoice: AgencyInvoice,
) {
  const client = invoiceClientDetails(
    state.clients.find((item) => item.id === invoice.clientId),
  );
  const total = invoiceTotal(invoice);
  const issuer = issuerAddressLines(state.identity)
    .map((line) => escapeHtml(line))
    .join("<br />");
  const clientLines = client.lines
    .map((line) => escapeHtml(line))
    .join("<br />");
  const lines = invoice.lines
    .map(
      (line) => `
        <tr>
          <td>${escapeHtml(line.label)}</td>
          <td>${line.quantity}</td>
          <td>${escapeHtml(formatEuroAmount(line.unitPrice))}</td>
          <td>${escapeHtml(formatLineDiscount(line))}</td>
          <td class="right">${escapeHtml(formatEuroAmount(lineNet(line)))}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.number)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 36px 40px;
      color: #1e293b;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: 0.01em;
      -webkit-font-smoothing: antialiased;
    }
    p { margin: 0; }
    .header { width: 100%; border-collapse: collapse; }
    .header td { vertical-align: top; padding: 0; border: 0; }
    .logo { display: block; height: 38px; max-width: 180px; width: auto; object-fit: contain; margin-bottom: 12px; }
    .issuer { color: #475569; font-size: 11.5px; line-height: 1.55; }
    .doc-label {
      margin: 0 0 6px;
      color: #64748b;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .doc-number {
      margin: 0 0 8px;
      color: #0f172a;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .meta { color: #475569; font-size: 12px; }
    .right { text-align: right; }
    .box {
      margin-top: 28px;
      padding: 14px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .client-name {
      margin: 2px 0 6px;
      color: #0f172a;
      font-size: 14px;
      font-weight: 600;
    }
    .lines { width: 100%; border-collapse: collapse; margin-top: 28px; }
    .lines th {
      padding: 0 0 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-align: left;
      text-transform: uppercase;
    }
    .lines td {
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12px;
      font-weight: 400;
    }
    .total {
      margin: 18px 0 0;
      color: #0f172a;
      font-size: 18px;
      font-weight: 600;
    }
    .note, .bank { color: #334155; font-size: 12px; line-height: 1.55; }
    .legal {
      margin-top: 28px;
      padding: 12px 14px;
      border-left: 2px solid #d97706;
      border-radius: 0 8px 8px 0;
      background: #fffbeb;
      color: #78350f;
      font-size: 11px;
      line-height: 1.55;
    }
  </style>
</head>
<body>
  <table class="header">
    <tr>
      <td>
        <img class="logo" src="${escapeHtml(agencyInvoiceLogoSrc(state.company))}" alt="${escapeHtml(state.identity.name)}" />
        <p class="issuer">${issuer}</p>
      </td>
      <td class="right">
        <p class="doc-label">Facture</p>
        <p class="doc-number">${escapeHtml(invoice.number)}</p>
        <p class="meta">Date : ${escapeHtml(formatShortDate(invoice.issuedOn))}</p>
        ${
          formatInvoicePeriod(invoice)
            ? `<p class="meta">Période : ${escapeHtml(formatInvoicePeriod(invoice))}</p>`
            : ""
        }
      </td>
    </tr>
  </table>
  <div class="box">
    <p class="doc-label">Client</p>
    <p class="client-name">${escapeHtml(client.title)}</p>
    ${clientLines ? `<p class="meta">${clientLines}</p>` : ""}
  </div>
  <table class="lines">
    <thead>
      <tr><th>Prestation</th><th>Qté</th><th>Prix</th><th>Remise</th><th class="right">Total</th></tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <p class="total right">${escapeHtml(formatEuroAmount(total))}</p>
  ${
    invoice.invoiceNote
      ? `<div class="box"><p class="doc-label">Commentaire</p><p class="note">${escapeHtml(invoice.invoiceNote).replace(/\n/g, "<br />")}</p></div>`
      : ""
  }
  <div class="box">
    <p class="doc-label">Coordonnées pour le virement</p>
    <p class="bank">${bankTransferLines(state.bank || DEFAULT_AGENCY_BANK).map((line) => escapeHtml(line)).join("<br />")}</p>
  </div>
  <p class="legal">${escapeHtml(REVERSE_CHARGE_MENTION)}</p>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cloneInvoiceLines(lines: AgencyInvoiceLine[]) {
  return lines.map((line) => ({ ...line, id: createId() }));
}

export function duplicateAgencyInvoice(
  state: AgencyBillingState,
  invoice: AgencyInvoice,
) {
  const issuedOn = nextBillingCycleOn(invoice.issuedOn);
  return {
    ...invoice,
    id: createId(),
    number: nextInvoiceNumber(state),
    issuedOn,
    nextCycleOn: nextBillingCycleOn(issuedOn),
    ...shiftInvoicePeriod(invoice),
    status: "En attente de paiement" as const,
    lines: cloneInvoiceLines(invoice.lines),
    comments: "",
    commentLog: [],
    createdAt: new Date().toISOString(),
  };
}

export function nextInvoiceNumber(state: AgencyBillingState, now = new Date()) {
  const prefix = state.company === "webk" ? "WK" : "BK";
  const year = String(now.getFullYear());
  const count = state.invoices.filter((item) =>
    item.number.startsWith(`${prefix}-${year}-`),
  ).length;
  return `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`;
}

export function billingAlerts(
  state: AgencyBillingState,
  now = new Date(),
) {
  return state.clients
    .filter((client) => client.active && client.nextInvoiceOn)
    .map((client) => {
      const overdue = isOverdueCycle(client.nextInvoiceOn, now);
      const soon = isWithinReminderWindow(client.nextInvoiceOn, now);
      if (!overdue && !soon) {
        return null;
      }
      return {
        clientId: client.id,
        clientName: client.name,
        nextInvoiceOn: client.nextInvoiceOn,
        overdue,
        label: overdue
          ? `${client.name} : cycle dépassé depuis le ${formatShortDate(client.nextInvoiceOn)}`
          : `${client.name} : facture à émettre d’ici le ${formatShortDate(client.nextInvoiceOn)}`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function periodRange(
  period: AgencyPeriod,
  now = new Date(),
  customFrom = "",
  customTo = "",
) {
  if (period === "custom") {
    return { from: customFrom, to: customTo };
  }
  const end = startOfDay(now);
  const start = startOfDay(now);
  if (period === "semaine") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
  } else if (period === "mois") {
    start.setDate(1);
  } else if (period === "trimestre") {
    const month = start.getMonth();
    start.setMonth(month - (month % 3), 1);
  } else {
    start.setMonth(0, 1);
  }
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

export function invoicesInRange(
  invoices: AgencyInvoice[],
  from: string,
  to: string,
) {
  return invoices.filter((invoice) => {
    if (invoice.status === "Annulée" || invoice.status === "Brouillon") {
      return false;
    }
    if (from && invoice.issuedOn < from) {
      return false;
    }
    if (to && invoice.issuedOn > to) {
      return false;
    }
    return true;
  });
}

export function isPendingPayment(invoice: AgencyInvoice) {
  return (
    invoice.status === "En attente de paiement" || invoice.status === "En retard"
  );
}

export function pendingPaymentKpi(invoices: AgencyInvoice[]) {
  const pending = invoices.filter((invoice) => isPendingPayment(invoice));
  return {
    count: pending.length,
    amount: pending.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0),
  };
}

export function kpiBreakdown(invoices: AgencyInvoice[]) {
  const buckets: Record<AgencyServiceKind, number> = {
    meta: 0,
    phoning: 0,
    reseaux: 0,
    rdv_wa: 0,
    gestion: 0,
    whatsapp: 0,
    crm_sms: 0,
    sms: 0,
    autre: 0,
  };
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      buckets[line.kind] += lineNet(line);
    }
  }
  return buckets;
}

export function monthlyRevenue(invoices: AgencyInvoice[], year: number) {
  const months = Array.from({ length: 12 }, () => 0);
  for (const invoice of invoices) {
    if (!invoice.issuedOn.startsWith(String(year))) {
      continue;
    }
    const month = Number(invoice.issuedOn.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) {
      months[month] += invoiceTotal(invoice);
    }
  }
  return months;
}

export function formatLineDiscount(line: AgencyInvoiceLine) {
  const amount = lineDiscountAmount(line);
  if (amount <= 0) {
    return "—";
  }
  if (line.discountType === "%") {
    return `${line.discountValue} % (−${formatEuroAmount(amount)})`;
  }
  return `−${formatEuroAmount(amount)}`;
}

export function formatEuroAmount(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function invoiceCommentLog(invoice: Pick<AgencyInvoice, "comments" | "commentLog" | "createdAt" | "id">) {
  if (invoice.commentLog?.length) {
    return invoice.commentLog;
  }
  const legacy = String(invoice.comments || "").trim();
  if (!legacy) {
    return [];
  }
  return [
    {
      id: `${invoice.id || "invoice"}-legacy`,
      text: legacy,
      createdAt: invoice.createdAt || new Date().toISOString(),
    },
  ];
}

export function addInvoiceComment(
  invoice: AgencyInvoice,
  text: string,
  now = new Date(),
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return invoice;
  }
  const entry: AgencyInvoiceComment = {
    id: createId(),
    text: trimmed,
    createdAt: now.toISOString(),
  };
  const commentLog = [entry, ...invoiceCommentLog(invoice)];
  return {
    ...invoice,
    comments: trimmed,
    commentLog,
  };
}

export function formatDateTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function formatShortDate(value: string) {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function service(
  label: string,
  unitPrice: number,
  kind: AgencyServiceKind,
): AgencyService {
  return { id: createId(), label, unitPrice, kind };
}

function normalizeClient(value: unknown): AgencyClient | null {
  const record = asRecord(value);
  const name = String(record.name || "").trim();
  if (!name) {
    return null;
  }
  return {
    id: String(record.id || createId()),
    centerId: String(record.centerId || ""),
    name,
    legalName: String(record.legalName || "").trim(),
    address: String(record.address || "").trim(),
    email: String(record.email || ""),
    phone: String(record.phone || ""),
    city: String(record.city || ""),
    active: record.active !== false,
    phoningOffer: Boolean(record.phoningOffer),
    comments: String(record.comments || ""),
    firstInvoiceOn: String(record.firstInvoiceOn || ""),
    nextInvoiceOn: String(record.nextInvoiceOn || ""),
    createdAt: String(record.createdAt || new Date().toISOString()),
  };
}

function normalizeService(value: unknown): AgencyService | null {
  const record = asRecord(value);
  const label = String(record.label || "").trim();
  if (!label) {
    return null;
  }
  return {
    id: String(record.id || createId()),
    label,
    unitPrice: Number(record.unitPrice) || 0,
    kind: isServiceKind(record.kind) ? record.kind : "autre",
  };
}

function normalizeInvoice(value: unknown): AgencyInvoice | null {
  const record = asRecord(value);
  const clientId = String(record.clientId || "").trim();
  const issuedOn = String(record.issuedOn || "").slice(0, 10);
  if (!clientId || !issuedOn) {
    return null;
  }
  const status = normalizeInvoiceStatus(record.status);
  const period = invoicePeriod({
    issuedOn,
    periodFrom: String(record.periodFrom || "").slice(0, 10),
    periodTo: String(record.periodTo || "").slice(0, 10),
  });
  return {
    id: String(record.id || createId()),
    number: String(record.number || ""),
    clientId,
    issuedOn,
    periodFrom: period.periodFrom,
    periodTo: period.periodTo,
    nextCycleOn: String(record.nextCycleOn || nextBillingCycleOn(issuedOn)),
    status,
    lines: Array.isArray(record.lines)
      ? record.lines
          .map((item) => normalizeLine(item))
          .filter((item): item is AgencyInvoiceLine => Boolean(item))
      : [],
    comments: String(record.comments || ""),
    commentLog: normalizeCommentLog(
      record.commentLog,
      record.comments,
      record.createdAt,
      record.id,
    ),
    invoiceNote: String(record.invoiceNote || ""),
    createdAt: String(record.createdAt || new Date().toISOString()),
  };
}

function normalizeCommentLog(
  value: unknown,
  legacyComments: unknown,
  createdAt: unknown,
  invoiceId: unknown,
): AgencyInvoiceComment[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = asRecord(item);
        const text = String(record.text || "").trim();
        if (!text) {
          return null;
        }
        return {
          id: String(record.id || createId()),
          text,
          createdAt: String(record.createdAt || createdAt || new Date().toISOString()),
        };
      })
      .filter((item): item is AgencyInvoiceComment => Boolean(item));
  }
  const legacy = String(legacyComments || "").trim();
  if (!legacy) {
    return [];
  }
  return [
    {
      id: `${String(invoiceId || "invoice")}-legacy`,
      text: legacy,
      createdAt: String(createdAt || new Date().toISOString()),
    },
  ];
}

function normalizeBank(value: unknown): AgencyBankDetails {
  const record = asRecord(value);
  return {
    accountName: String(record.accountName || DEFAULT_AGENCY_BANK.accountName),
    iban: String(record.iban || DEFAULT_AGENCY_BANK.iban),
    bic: String(record.bic || DEFAULT_AGENCY_BANK.bic),
    bankName: String(record.bankName || DEFAULT_AGENCY_BANK.bankName),
    bankAddress: String(record.bankAddress || DEFAULT_AGENCY_BANK.bankAddress),
  };
}

function normalizeLine(value: unknown): AgencyInvoiceLine | null {
  const record = asRecord(value);
  const label = String(record.label || "").trim();
  if (!label) {
    return null;
  }
  return {
    id: String(record.id || createId()),
    label,
    kind: isServiceKind(record.kind) ? record.kind : "autre",
    quantity: Math.max(0, Number(record.quantity) || 0),
    unitPrice: Number(record.unitPrice) || 0,
    discountType: isDiscountType(record.discountType)
      ? record.discountType
      : "Aucune",
    discountValue: Math.max(0, Number(record.discountValue) || 0),
  };
}

function isDiscountType(value: unknown): value is AgencyDiscountType {
  return value === "Aucune" || value === "€" || value === "%";
}

function isServiceKind(value: unknown): value is AgencyServiceKind {
  return (
    value === "meta" ||
    value === "phoning" ||
    value === "reseaux" ||
    value === "rdv_wa" ||
    value === "gestion" ||
    value === "whatsapp" ||
    value === "crm_sms" ||
    value === "sms" ||
    value === "autre"
  );
}

function isInvoiceStatus(value: unknown): value is AgencyInvoiceStatus {
  return AGENCY_INVOICE_STATUSES.includes(value as AgencyInvoiceStatus);
}

function normalizeInvoiceStatus(value: unknown): AgencyInvoiceStatus {
  if (value === "Émise") {
    return "En attente de paiement";
  }
  return isInvoiceStatus(value) ? value : "En attente de paiement";
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseIsoDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) {
      return null;
    }
    return startOfDay(new Date(time));
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
