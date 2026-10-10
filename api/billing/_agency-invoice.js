const PUBLIC_BASE_URL = (
  process.env.NEXT_PUBLIC_BOOKEA_PUBLIC_URL || "https://www.bookeai.fr"
).replace(/\/+$/, "");

const AGENCY_LEGAL_ENTITY = {
  legalName: "SFK Web K Agency LLC",
  contactName: "Samantha Kahlaoui",
  address: "1209 MOUNTAIN ROAD PL NE",
  postalCode: "87110",
  city: "ALBUQUERQUE",
  country: "États-Unis",
};

const REVERSE_CHARGE_MENTION =
  "Il s’agit d’une prestation de services internationale transfrontalière. Autoliquidation par le preneur — Reverse Charge - Art. 283-2 du CGI. TVA non applicable.";

const DEFAULT_AGENCY_BANK = {
  accountName: "SFK WEBK AGENCY LLC",
  iban: "BE21 9055 5762 3503",
  bic: "TRWIBEB1XXX",
  bankName: "Wise",
  bankAddress: "Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium",
};

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPayToken() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) {
      return null;
    }
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(value, days) {
  const now = new Date();
  const date =
    parseIsoDate(value) ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function nextBillingCycleOn(issuedOn) {
  return addDaysIso(issuedOn, 30);
}

function defaultInvoicePeriod(issuedOn) {
  const periodFrom = issuedOn || addDaysIso("", 0);
  return {
    periodFrom,
    periodTo: addDaysIso(nextBillingCycleOn(periodFrom), -1),
  };
}

function lineNet(line) {
  const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0);
  const value = Math.max(Number(line.discountValue) || 0, 0);
  const discount =
    line.discountType === "%"
      ? Math.min(gross, (gross * value) / 100)
      : line.discountType === "€"
        ? Math.min(gross, value)
        : 0;
  return Math.max(0, gross - discount);
}

function invoiceTotal(invoice) {
  return asArray(invoice?.lines).reduce((sum, line) => sum + lineNet(line), 0);
}

function subscriptionInvoiceLine(alert) {
  const seya =
    alert.kind === "seya_pack" ||
    (alert.kind === "pack_expired" && alert.offer === "seya");
  const kind = seya ? "whatsapp" : alert.kind === "sms_pack" ? "sms" : "crm_sms";
  const label = seya
    ? `Pack WhatsApp ${alert.quantity} conversations Seya`
    : alert.kind === "sms_pack"
      ? `Pack SMS ${alert.quantity} crédits`
      : "Bookea CRM + SMS";
  return {
    id: createId(),
    label,
    kind,
    quantity: 1,
    unitPrice: Number(alert.amountEuros) || 0,
    discountType: "Aucune",
    discountValue: 0,
  };
}

function firstFilled(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function includesIgnoreCase(haystack, needle) {
  return Boolean(needle) && haystack.toLowerCase().includes(needle.toLowerCase());
}

function billingCenterContactFromRow(row) {
  const settings = asRecord(row.settings);
  const settingsCenter = asRecord(settings.center);
  const legal = asRecord(row.legal || settings.legal);
  const publicCenter = asRecord(row.publicCenter || asRecord(settings.public).center);
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

function agencyClientFromCenter(center) {
  return {
    id: createId(),
    centerId: center.id,
    name: center.name || "Centre",
    legalName: center.legalName,
    address: center.address,
    email: center.email,
    phone: center.phone,
    city: center.city,
    active: true,
    phoningOffer: false,
    comments: "",
    firstInvoiceOn: "",
    nextInvoiceOn: "",
    createdAt: new Date().toISOString(),
  };
}

function applyBillingCenterContact(client, center) {
  const next = {
    ...client,
    name: center.name || client.name,
    legalName: center.legalName || client.legalName,
    address: center.address || client.address,
    email: center.email || client.email,
    phone: center.phone || client.phone,
    city: center.city || client.city,
  };
  return ["name", "legalName", "address", "email", "phone", "city"].every(
    (key) => next[key] === client[key],
  )
    ? client
    : next;
}

function ensureAgencyClientForCenter(state, center) {
  const existing = state.clients.find((client) => client.centerId === center.id);
  if (existing) {
    const synced = applyBillingCenterContact(existing, center);
    if (synced === existing) {
      return { state, client: existing };
    }
    return {
      state: {
        ...state,
        clients: state.clients.map((client) =>
          client.id === synced.id ? synced : client,
        ),
      },
      client: synced,
    };
  }

  const client = agencyClientFromCenter(center);
  return {
    state: { ...state, clients: [client, ...state.clients] },
    client,
  };
}

function nextInvoiceNumber(state, now = new Date()) {
  const prefix = state.company === "webk" ? "WK" : "BK";
  const year = String(now.getFullYear());
  const count = state.invoices.filter((item) =>
    String(item.number || "").startsWith(`${prefix}-${year}-`),
  ).length;
  return `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`;
}

function ensureSubscriptionInvoice(state, input) {
  const existing = state.invoices.find(
    (invoice) =>
      invoice.sourceAlertId === input.alert.id ||
      (input.alert.invoiceId && invoice.id === input.alert.invoiceId),
  );
  if (existing) {
    return { state, invoice: existing, created: false };
  }

  const withClient = ensureAgencyClientForCenter(state, input.center);
  const issuedOn =
    String(input.alert.createdAt || "").slice(0, 10) || addDaysIso("", 0);
  const invoice = {
    id: createId(),
    number: nextInvoiceNumber(withClient.state),
    clientId: withClient.client.id,
    issuedOn,
    nextCycleOn: nextBillingCycleOn(issuedOn),
    ...defaultInvoicePeriod(issuedOn),
    status: "En attente de paiement",
    lines: [subscriptionInvoiceLine(input.alert)],
    comments: "",
    commentLog: [],
    invoiceNote: String(input.alert.message || "").trim(),
    sourceAlertId: input.alert.id,
    createdAt: new Date().toISOString(),
  };

  return {
    state: {
      ...withClient.state,
      invoices: [invoice, ...withClient.state.invoices],
      clients: withClient.state.clients.map((client) =>
        client.id === withClient.client.id
          ? {
              ...client,
              firstInvoiceOn: client.firstInvoiceOn || issuedOn,
              nextInvoiceOn: invoice.nextCycleOn,
            }
          : client,
      ),
    },
    invoice,
    created: true,
  };
}

function emptyServerBilling(company) {
  return {
    company,
    clients: [],
    invoices: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeServerBilling(company, value) {
  const state = asRecord(value);
  return {
    ...emptyServerBilling(company),
    ...state,
    company,
    clients: asArray(state.clients),
    invoices: asArray(state.invoices),
  };
}

function stampServerRevision(items, ids, revision) {
  return items.map((item) =>
    ids.has(item.id) ? { ...item, serverRevision: revision } : item,
  );
}

function mergeServerItems(incomingItems, storedItems, base) {
  const fresh = new Map(
    asArray(storedItems)
      .filter((item) => (Number(asRecord(item).serverRevision) || 0) > base)
      .map((item) => [item.id, item]),
  );
  const merged = asArray(incomingItems).map((item) => {
    const id = asRecord(item).id;
    const server = fresh.get(id);
    fresh.delete(id);
    return server || item;
  });
  return [...fresh.values(), ...merged];
}

function mergeIncomingBilling(stored, incoming) {
  if (!stored) {
    return { ...incoming, revision: (Number(incoming.revision) || 0) + 1 };
  }
  const base = Number(incoming.revision) || 0;
  return {
    ...incoming,
    invoices: mergeServerItems(incoming.invoices, stored.invoices, base),
    clients: mergeServerItems(incoming.clients, stored.clients, base),
    revision: Math.max(Number(stored.revision) || 0, base) + 1,
  };
}

function invoicePayUrl(invoice, baseUrl = PUBLIC_BASE_URL) {
  if (!invoice?.id || !invoice.payToken) {
    return "";
  }
  const params = new URLSearchParams({ i: invoice.id, t: invoice.payToken });
  return `${baseUrl}/api/billing/pay?${params.toString()}`;
}

function payTokenMatches(invoice, token) {
  const expected = String(invoice?.payToken || "");
  const given = String(token || "");
  if (!expected || expected.length !== given.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ given.charCodeAt(index);
  }
  return diff === 0;
}

function markInvoicePaid(invoice, payment) {
  if (invoice.status === "Payée") {
    return invoice;
  }
  return {
    ...invoice,
    status: "Payée",
    paidAt: payment.paidAt || new Date().toISOString(),
    paymentMethod: "carte",
  };
}

function rememberStripeSession(invoice, sessionId, now = new Date()) {
  const ids = asArray(invoice.stripeSessionIds).filter((id) => id !== sessionId);
  return {
    ...invoice,
    stripeSessionIds: [sessionId, ...ids].slice(0, 5),
    stripeSessionAt: now.toISOString(),
  };
}

module.exports = {
  AGENCY_LEGAL_ENTITY,
  DEFAULT_AGENCY_BANK,
  PUBLIC_BASE_URL,
  REVERSE_CHARGE_MENTION,
  addDaysIso,
  agencyClientFromCenter,
  applyBillingCenterContact,
  billingCenterContactFromRow,
  createPayToken,
  emptyServerBilling,
  ensureAgencyClientForCenter,
  ensureSubscriptionInvoice,
  invoicePayUrl,
  invoiceTotal,
  lineNet,
  markInvoicePaid,
  mergeIncomingBilling,
  nextInvoiceNumber,
  normalizeServerBilling,
  payTokenMatches,
  rememberStripeSession,
  stampServerRevision,
  subscriptionInvoiceLine,
};
