import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export type ClientBalanceDueIndex = {
  clientIds: Set<string>;
  names: Set<string>;
  phones: Set<string>;
};

type InvoiceBalanceRow = {
  balance_due: number | string | null;
  client_id: string | null;
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
  };
}

export function hasOutstandingPayment(
  index: ClientBalanceDueIndex,
  identity: {
    clientId?: string;
    personName?: string;
    phone?: string;
  },
) {
  if (identity.clientId && index.clientIds.has(identity.clientId)) {
    return true;
  }

  const phone = phoneKey(identity.phone ?? "");
  if (phone.length >= 8 && index.phones.has(phone)) {
    return true;
  }

  const name = normalizePersonName(identity.personName ?? "");
  return name.length > 0 && index.names.has(name);
}

export async function loadClientBalanceDueIndex(): Promise<ClientBalanceDueIndex> {
  const index = emptyClientBalanceDueIndex();

  try {
    const supabase = createClient();
    const center = await getActiveCenterContext(supabase);
    const { data, error } = await supabase
      .from("invoices")
      .select("client_id, balance_due, clients(first_name, last_name, phone)")
      .eq("center_id", center.centerId)
      .gt("balance_due", 0);

    if (error || !data) {
      return index;
    }

    for (const row of data as InvoiceBalanceRow[]) {
      if (Number(row.balance_due ?? 0) <= 0) {
        continue;
      }

      if (row.client_id) {
        index.clientIds.add(row.client_id);
      }

      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      const phone = phoneKey(client?.phone ?? "");
      if (phone.length >= 8) {
        index.phones.add(phone);
      }

      const name = normalizePersonName(
        [client?.first_name, client?.last_name].filter(Boolean).join(" "),
      );
      if (name) {
        index.names.add(name);
      }
    }
  } catch {
    return index;
  }

  return index;
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
