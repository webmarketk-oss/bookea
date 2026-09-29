import { getActiveCenterContext } from "@/lib/center-access";
import {
  addPaymentTone,
  emptyClientBalanceDueIndex,
  invoicePaymentAmounts,
  isUsablePersonName,
  normalizePersonName,
  paymentToneFromAmounts,
  phoneKey,
  type ClientBalanceDueIndex,
  type PaymentTone,
} from "@/lib/payment-tone";
import { createClient } from "@/lib/supabase";

export type { ClientBalanceDueIndex, PaymentTone } from "@/lib/payment-tone";
export {
  emptyClientBalanceDueIndex,
  getPaymentTone,
  hasOutstandingPayment,
  invoicePaymentAmounts,
  paymentToneFromAmounts,
  paymentToneFromClient,
} from "@/lib/payment-tone";

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

type LeadBalanceRow = {
  amount_cure_ttc: number | string | null;
  client_id: string | null;
  status: string | null;
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

    if (!error && data) {
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

        addPaymentTone(index, current, tone);
      }
    }

    const { data: leadRows, error: leadError } = await supabase
      .from("leads")
      .select(
        "client_id, status, amount_cure_ttc, clients(first_name, last_name, phone)",
      )
      .eq("center_id", center.centerId);

    if (!leadError && leadRows) {
      for (const row of leadRows as LeadBalanceRow[]) {
        const amount = Number(row.amount_cure_ttc ?? 0);
        if (amount <= 0) {
          continue;
        }

        const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
        const name = normalizePersonName(
          [client?.first_name, client?.last_name].filter(Boolean).join(" "),
        );
        const phone = phoneKey(client?.phone ?? "");
        const clientId = row.client_id ?? undefined;

        if (
          (clientId && index.tonesByClientId.has(clientId)) ||
          (phone.length >= 8 && index.tonesByPhone.has(phone)) ||
          (isUsablePersonName(name) && index.tonesByName.has(name))
        ) {
          continue;
        }

        const sold = ["Vendu", "Client", "Client converti"].includes(
          row.status ?? "",
        );
        const tone = paymentToneFromAmounts(sold ? amount : 0, sold ? 0 : amount);
        if (!tone) {
          continue;
        }

        addPaymentTone(
          index,
          {
            clientId,
            name,
            phone,
          },
          tone,
        );
      }
    }
  } catch {
    return index;
  }

  return index;
}
