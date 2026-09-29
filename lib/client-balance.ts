import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export type PaymentTone = "paid" | "partial" | "unpaid";

export type ClientBalanceDueIndex = {
  clientIds: Set<string>;
  names: Set<string>;
  phones: Set<string>;
  tonesByClientId: Map<string, PaymentTone>;
  tonesByName: Map<string, PaymentTone>;
  tonesByPhone: Map<string, PaymentTone>;
};

export const paymentToneStyles: Record<
  PaymentTone,
  {
    badge: string;
    border: string;
    dot: string;
    fill: string;
    icon: string;
    label: string;
    ring: string;
    row: string;
    surface: string;
  }
> = {
  paid: {
    badge: "border-emerald-300 bg-emerald-600 text-white",
    border: "border-emerald-500",
    dot: "bg-emerald-500",
    fill: "border-emerald-400 bg-emerald-100 text-emerald-950",
    icon: "text-emerald-700",
    label: "Payé",
    ring: "ring-2 ring-emerald-500",
    row: "bg-emerald-100",
    surface: "bg-emerald-100",
  },
  partial: {
    badge: "border-orange-300 bg-orange-500 text-white",
    border: "border-orange-500",
    dot: "bg-orange-500",
    fill: "border-orange-400 bg-orange-100 text-orange-950",
    icon: "text-orange-700",
    label: "Reste à payer",
    ring: "ring-2 ring-orange-500",
    row: "bg-orange-100",
    surface: "bg-orange-100",
  },
  unpaid: {
    badge: "border-red-300 bg-red-600 text-white",
    border: "border-red-500",
    dot: "bg-red-500",
    fill: "border-red-400 bg-red-100 text-red-950",
    icon: "text-red-700",
    label: "Non payé",
    ring: "ring-2 ring-red-500",
    row: "bg-red-100",
    surface: "bg-red-100",
  },
};

type InvoiceBalanceRow = {
  balance_due: number | string | null;
  client_id: string | null;
  paid_amount: number | string | null;
  status: string | null;
  total_ttc: number | string | null;
  type: string | null;
  clients:
    | {
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
      }
    | Array<{
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
      }>
    | null;
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
    type === "devis" ||
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
  if (identity.clientId) {
    const tone = index.tonesByClientId.get(identity.clientId);
    if (tone) {
      return tone;
    }
  }

  const phone = phoneKey(identity.phone ?? "");
  if (phone.length >= 8) {
    const tone = index.tonesByPhone.get(phone);
    if (tone) {
      return tone;
    }
  }

  const name = normalizePersonName(identity.personName ?? "");
  return name.length > 0 ? index.tonesByName.get(name) ?? null : null;
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

export async function loadClientBalanceDueIndex(): Promise<ClientBalanceDueIndex> {
  const index = emptyClientBalanceDueIndex();

  try {
    const supabase = createClient();
    const center = await getActiveCenterContext(supabase);
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "client_id, balance_due, paid_amount, total_ttc, status, type, clients(first_name, last_name, phone)",
      )
      .eq("center_id", center.centerId);

    if (error || !data) {
      return index;
    }

    const totals = new Map<
      string,
      {
        clientId?: string;
        name: string;
        paid: number;
        phone: string;
        due: number;
      }
    >();

    for (const row of data as InvoiceBalanceRow[]) {
      const amounts = invoicePaymentAmounts(row);
      if (!amounts) {
        continue;
      }

      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      const name = normalizePersonName(
        [client?.first_name, client?.last_name].filter(Boolean).join(" "),
      );
      const phone = phoneKey(client?.phone ?? "");
      const key = row.client_id || phone || name;

      if (!key) {
        continue;
      }

      const current = totals.get(key) ?? {
        clientId: row.client_id ?? undefined,
        name,
        paid: 0,
        phone,
        due: 0,
      };
      current.paid += amounts.paid;
      current.due += amounts.due;
      totals.set(key, current);
    }

    for (const current of totals.values()) {
      const tone = paymentToneFromAmounts(current.paid, current.due);
      if (!tone) {
        continue;
      }

      if (current.clientId) {
        index.tonesByClientId.set(
          current.clientId,
          worseTone(index.tonesByClientId.get(current.clientId), tone),
        );
        if (tone !== "paid") {
          index.clientIds.add(current.clientId);
        }
      }

      if (current.phone.length >= 8) {
        index.tonesByPhone.set(
          current.phone,
          worseTone(index.tonesByPhone.get(current.phone), tone),
        );
        if (tone !== "paid") {
          index.phones.add(current.phone);
        }
      }

      if (current.name) {
        index.tonesByName.set(
          current.name,
          worseTone(index.tonesByName.get(current.name), tone),
        );
        if (tone !== "paid") {
          index.names.add(current.name);
        }
      }
    }
  } catch {
    return index;
  }

  return index;
}

function worseTone(current: PaymentTone | undefined, next: PaymentTone) {
  const rank: Record<PaymentTone, number> = {
    paid: 0,
    partial: 1,
    unpaid: 2,
  };

  if (!current) {
    return next;
  }

  return rank[next] > rank[current] ? next : current;
}

function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function phoneKey(value: string) {
  return value.replace(/\D/g, "").slice(-9);
}
