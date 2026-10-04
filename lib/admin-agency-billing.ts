export type AgencyCompany = "webk" | "bookea";

export type AgencyInvoiceStatus =
  | "Brouillon"
  | "Émise"
  | "Payée"
  | "En retard"
  | "Annulée";

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

export type AgencyClient = {
  id: string;
  centerId: string;
  name: string;
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

export type AgencyInvoice = {
  id: string;
  number: string;
  clientId: string;
  issuedOn: string;
  nextCycleOn: string;
  status: AgencyInvoiceStatus;
  lines: AgencyInvoiceLine[];
  comments: string;
  createdAt: string;
};

export type AgencyBillingState = {
  company: AgencyCompany;
  identity: AgencyIdentity;
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

export function issuerAddressLines(identity: AgencyIdentity) {
  return [
    identity.legalName,
    identity.contactName,
    identity.address,
    [identity.postalCode, identity.city].filter(Boolean).join(" "),
    identity.country,
  ].filter(Boolean);
}

export function emptyAgencyState(company: AgencyCompany): AgencyBillingState {
  return {
    company,
    identity: defaultAgencyIdentity(company),
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
  const client = state.clients.find((item) => item.id === invoice.clientId);
  const total = invoiceTotal(invoice);
  const issuer = issuerAddressLines(state.identity)
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
          <td style="text-align:right">${escapeHtml(
            formatEuroAmount(lineNet(line)),
          )}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.number)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 40px; }
    h1 { margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .muted { color: #475569; font-size: 14px; }
    .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-top: 24px; }
    .legal { border: 1px solid #f59e0b; background: #fffbeb; border-radius: 12px; padding: 14px; margin-top: 24px; font-size: 14px; }
    .right { text-align: right; }
  </style>
</head>
<body>
  <table>
    <tr>
      <td>
        <h1>${escapeHtml(state.identity.name)}</h1>
        <p class="muted">${issuer}</p>
      </td>
      <td class="right">
        <p class="muted">Facture</p>
        <h1>${escapeHtml(invoice.number)}</h1>
        <p class="muted">Date : ${escapeHtml(formatShortDate(invoice.issuedOn))}</p>
      </td>
    </tr>
  </table>
  <div class="box">
    <p class="muted">Client</p>
    <p><strong>${escapeHtml(client?.name || "—")}</strong></p>
    <p class="muted">${escapeHtml([client?.city, client?.email].filter(Boolean).join(" · "))}</p>
  </div>
  <table>
    <thead>
      <tr><th>Prestation</th><th>Qté</th><th>Prix HT</th><th>Remise</th><th class="right">Total HT</th></tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <p class="right muted">TVA : 0,00 €</p>
  <h1 class="right">${escapeHtml(formatEuroAmount(total))} HT</h1>
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
  const status = isInvoiceStatus(record.status) ? record.status : "Émise";
  return {
    id: String(record.id || createId()),
    number: String(record.number || ""),
    clientId,
    issuedOn,
    nextCycleOn: String(record.nextCycleOn || nextBillingCycleOn(issuedOn)),
    status,
    lines: Array.isArray(record.lines)
      ? record.lines
          .map((item) => normalizeLine(item))
          .filter((item): item is AgencyInvoiceLine => Boolean(item))
      : [],
    comments: String(record.comments || ""),
    createdAt: String(record.createdAt || new Date().toISOString()),
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
  return (
    value === "Brouillon" ||
    value === "Émise" ||
    value === "Payée" ||
    value === "En retard" ||
    value === "Annulée"
  );
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
