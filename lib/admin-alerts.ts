export type AdminAlertKind =
  | "seya_pack"
  | "sms_pack"
  | "crm_pack"
  | "pack_expired";

export type AdminAlertBillingStatus = "to_invoice" | "invoiced";

export type AdminAlertOffer = "seya" | "crm";

export type AdminAlert = {
  id: string;
  kind: AdminAlertKind;
  createdAt: string;
  readAt: string | null;
  title: string;
  message: string;
  amountEuros: number;
  quantity: number;
  billingStatus: AdminAlertBillingStatus;
  offer?: AdminAlertOffer;
  invoiceId?: string;
  invoicedAt?: string;
  emailedAt?: string;
  emailedTo?: string;
};

export const ADMIN_ALERTS_LIMIT = 200;

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function isInvoiceableAdminAlert(alert: Pick<AdminAlert, "kind">) {
  return alert.kind !== "pack_expired";
}

export function createAdminAlert(input: {
  kind: AdminAlertKind;
  title: string;
  message: string;
  amountEuros: number;
  quantity: number;
  offer?: AdminAlertOffer;
  createdAt?: string;
  id?: string;
}): AdminAlert {
  return {
    id: input.id || crypto.randomUUID(),
    kind: input.kind,
    createdAt: input.createdAt || new Date().toISOString(),
    readAt: null,
    title: input.title,
    message: input.message,
    amountEuros: Number(input.amountEuros) || 0,
    quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
    billingStatus: "to_invoice",
    ...(input.offer ? { offer: input.offer } : {}),
  };
}

export function normalizeAdminAlert(value: unknown): AdminAlert | null {
  const record = asRecord(value);
  const kind =
    record.kind === "seya_pack" ||
    record.kind === "sms_pack" ||
    record.kind === "crm_pack" ||
    record.kind === "pack_expired"
      ? record.kind
      : null;
  const id = String(record.id || "").trim();
  const title = String(record.title || "").trim();
  const message = String(record.message || "").trim();
  if (!kind || !id || !title || !message) {
    return null;
  }

  return {
    id,
    kind,
    createdAt: String(record.createdAt || "") || new Date().toISOString(),
    readAt: record.readAt ? String(record.readAt) : null,
    title,
    message,
    amountEuros: Number(record.amountEuros) || 0,
    quantity: Math.max(0, Math.floor(Number(record.quantity) || 0)),
    billingStatus:
      record.billingStatus === "invoiced" ? "invoiced" : "to_invoice",
    offer:
      record.offer === "seya" || record.offer === "crm" ? record.offer : undefined,
    invoiceId: String(record.invoiceId || "").trim() || undefined,
    invoicedAt: String(record.invoicedAt || "").trim() || undefined,
    emailedAt: String(record.emailedAt || "").trim() || undefined,
    emailedTo: String(record.emailedTo || "").trim() || undefined,
  };
}

export function normalizeAdminAlerts(value: unknown): AdminAlert[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeAdminAlert(item))
    .filter((item): item is AdminAlert => Boolean(item));
}

export function appendAdminAlert(
  current: unknown,
  alert: AdminAlert,
): AdminAlert[] {
  return [alert, ...normalizeAdminAlerts(current)].slice(0, ADMIN_ALERTS_LIMIT);
}

export function markAdminAlertRead(
  current: unknown,
  alertId: string,
  readAt = new Date().toISOString(),
): AdminAlert[] {
  return normalizeAdminAlerts(current).map((alert) =>
    alert.id === alertId && !alert.readAt ? { ...alert, readAt } : alert,
  );
}

export function markAdminAlertInvoiced(
  current: unknown,
  alertId: string,
  receipt: {
    invoiceId: string;
    invoicedAt?: string;
    emailedAt?: string;
    emailedTo?: string;
  },
): AdminAlert[] {
  const invoicedAt =
    receipt.invoicedAt || receipt.emailedAt || new Date().toISOString();
  return normalizeAdminAlerts(current).map((alert) =>
    alert.id === alertId
      ? {
          ...alert,
          readAt: alert.readAt || invoicedAt,
          billingStatus: "invoiced",
          invoiceId: receipt.invoiceId,
          invoicedAt,
          emailedAt: receipt.emailedAt || alert.emailedAt,
          emailedTo: receipt.emailedTo || alert.emailedTo,
        }
      : alert,
  );
}
