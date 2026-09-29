export type PaymentTone = "paid" | "partial" | "unpaid";

export type ClientBalanceDueIndex = {
  clientIds: Set<string>;
  names: Set<string>;
  phones: Set<string>;
  tonesByClientId: Map<string, PaymentTone>;
  tonesByName: Map<string, PaymentTone>;
  tonesByPhone: Map<string, PaymentTone>;
};

export function emptyClientBalanceDueIndex(): ClientBalanceDueIndex {
  return {
    clientIds: new Set(),
    names: new Set(),
    phones: new Set(),
    tonesByClientId: new Map(),
    tonesByName: new Map(),
    tonesByPhone: new Map(),
  };
}

export function paymentToneFromAmounts(paid: number, due: number) {
  if (due <= 0 && paid <= 0) {
    return null;
  }

  if (due <= 0) {
    return "paid" as const;
  }

  if (paid > 0) {
    return "partial" as const;
  }

  return "unpaid" as const;
}

export function invoicePaymentAmounts(row: {
  balance_due?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  total_ttc?: number | string | null;
  type?: string | null;
}) {
  const status = (row.status || "").toLowerCase();
  const type = (row.type || "").toLowerCase();

  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "annulee" ||
    status === "annulée" ||
    type === "avoir"
  ) {
    return null;
  }

  const total = Number(row.total_ttc ?? 0);
  const paid = Math.max(0, Number(row.paid_amount ?? 0));
  const storedDue = Number(row.balance_due);
  let due = Number.isFinite(storedDue) ? Math.max(0, storedDue) : Math.max(total - paid, 0);

  if (status === "paid" || status === "credit_note") {
    return { paid: Math.max(paid, total), due: 0 };
  }

  if (due <= 0 && paid < total) {
    due = Math.max(total - paid, 0);
  }

  return { paid, due };
}

export function paymentToneFromClient(client: {
  balanceDue: number;
  totalSpent?: number;
  cares?: Array<{ amount: number; paid: number }>;
}) {
  const paidFromCares = (client.cares ?? []).reduce(
    (total, care) => total + care.paid,
    0,
  );
  const paid =
    paidFromCares > 0 ? paidFromCares : Number(client.totalSpent ?? 0);
  return paymentToneFromAmounts(paid, client.balanceDue);
}

export function getPaymentTone(
  index: ClientBalanceDueIndex,
  identity: {
    clientId?: string;
    personName?: string;
    phone?: string;
  },
) {
  let tone: PaymentTone | undefined;

  if (identity.clientId) {
    tone = worseTone(tone, index.tonesByClientId.get(identity.clientId));
  }

  const phone = phoneKey(identity.phone ?? "");
  if (phone.length >= 8) {
    tone = worseTone(tone, index.tonesByPhone.get(phone));
  }

  const name = normalizePersonName(identity.personName ?? "");
  if (isUsablePersonName(name)) {
    tone = worseTone(tone, index.tonesByName.get(name));
  }

  return tone ?? null;
}

export function hasOutstandingPayment(
  index: ClientBalanceDueIndex,
  identity: {
    clientId?: string;
    personName?: string;
    phone?: string;
  },
) {
  const tone = getPaymentTone(index, identity);
  return tone === "partial" || tone === "unpaid";
}

export function addPaymentTone(
  index: ClientBalanceDueIndex,
  identity: { clientId?: string; name: string; phone: string },
  tone: PaymentTone,
) {
  if (identity.clientId) {
    index.tonesByClientId.set(
      identity.clientId,
      worseTone(index.tonesByClientId.get(identity.clientId), tone) ?? tone,
    );
    if (tone !== "paid") {
      index.clientIds.add(identity.clientId);
    }
  }

  if (identity.phone.length >= 8) {
    index.tonesByPhone.set(
      identity.phone,
      worseTone(index.tonesByPhone.get(identity.phone), tone) ?? tone,
    );
    if (tone !== "paid") {
      index.phones.add(identity.phone);
    }
  }

  if (isUsablePersonName(identity.name)) {
    index.tonesByName.set(
      identity.name,
      worseTone(index.tonesByName.get(identity.name), tone) ?? tone,
    );
    if (tone !== "paid") {
      index.names.add(identity.name);
    }
  }
}

export function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function phoneKey(value: string) {
  return value.replace(/\D/g, "").slice(-9);
}

export function isUsablePersonName(value: string) {
  return value.length > 0 && value !== "cliente bookea";
}

function worseTone(
  current: PaymentTone | undefined,
  next: PaymentTone | undefined,
) {
  const rank: Record<PaymentTone, number> = {
    paid: 0,
    partial: 1,
    unpaid: 2,
  };

  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return rank[next] > rank[current] ? next : current;
}
