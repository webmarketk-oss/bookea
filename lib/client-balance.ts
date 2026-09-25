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
    icon: string;
    label: string;
    ring: string;
    row: string;
    surface: string;
  }
> = {
  paid: {
    badge: "border-emerald-200 bg-emerald-100 text-emerald-800",
    border: "border-emerald-300",
    icon: "text-emerald-600",
    label: "Payé",
    ring: "ring-2 ring-emerald-400",
    row: "bg-emerald-50",
    surface: "bg-emerald-50/80",
  },
  partial: {
    badge: "border-orange-200 bg-orange-100 text-orange-800",
    border: "border-orange-300",
    icon: "text-orange-600",
    label: "Reste à payer",
    ring: "ring-2 ring-orange-400",
    row: "bg-orange-50",
    surface: "bg-orange-50/80",
  },
  unpaid: {
    badge: "border-red-200 bg-red-100 text-red-800",
    border: "border-red-300",
    icon: "text-red-600",
    label: "Non payé",
    ring: "ring-2 ring-red-400",
    row: "bg-red-50",
    surface: "bg-red-50/80",
  },
};

type InvoiceBalanceRow = {
  balance_due: number | string | null;
  client_id: string | null;
  paid_amount: number | string | null;
  status: string | null;
  total_ttc: number | string | null;
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

export function paymentToneFromClient(client: {
  balanceDue: number;
  cares?: Array<{ amount: number; paid: number }>;
}) {
  const paid = (client.cares ?? []).reduce((total, care) => total + care.paid, 0);
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
        "client_id, balance_due, paid_amount, total_ttc, status, clients(first_name, last_name, phone)",
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
      const status = (row.status || "").toLowerCase();
      if (
        status === "cancelled" ||
        status === "canceled" ||
        status === "annulee" ||
        status === "annulée"
      ) {
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
      current.paid += Number(row.paid_amount ?? 0);
      current.due += Number(row.balance_due ?? 0);
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
