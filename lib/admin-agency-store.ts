import {
  billingCenterContactFromRow,
  emptyAgencyState,
  mergeAgencyClients,
  mergeAgencyInvoices,
  normalizeAgencyState,
  protectInvoicesFromEmptyOverwrite,
  type AgencyBillingState,
  type AgencyCompany,
  type BillingCenterContact,
} from "@/lib/admin-agency-billing";
import { createClient } from "@/lib/supabase";

const STORAGE_PREFIX = "bookea-admin-agency-billing:";

function storageKey(company: AgencyCompany) {
  return `${STORAGE_PREFIX}${company}`;
}

function readLocal(company: AgencyCompany): AgencyBillingState {
  if (typeof window === "undefined") {
    return emptyAgencyState(company);
  }
  try {
    const raw = window.localStorage.getItem(storageKey(company));
    return normalizeAgencyState(company, raw ? JSON.parse(raw) : null);
  } catch {
    return emptyAgencyState(company);
  }
}

function writeLocal(state: AgencyBillingState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey(state.company), JSON.stringify(state));
}

export async function adminAuthHeaders() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}

async function loadRemote(company: AgencyCompany) {
  try {
    const response = await fetch(
      `/api/admin/agency-billing?company=${encodeURIComponent(company)}`,
      { headers: await adminAuthHeaders(), cache: "no-store" },
    );
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      state?: unknown;
    } | null;
    if (!response.ok || !result?.ok) {
      return "error" as const;
    }
    return result.state ? normalizeAgencyState(company, result.state) : null;
  } catch {
    return "error" as const;
  }
}

async function saveRemote(state: AgencyBillingState) {
  const response = await fetch("/api/admin/agency-billing", {
    method: "PUT",
    headers: await adminAuthHeaders(),
    body: JSON.stringify({ company: state.company, state }),
  });
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    state?: unknown;
  } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error || "Factures non enregistrées en ligne. Réessayez.",
    );
  }
  return result.state ? normalizeAgencyState(state.company, result.state) : state;
}

export async function loadAgencyBilling(company: AgencyCompany) {
  return (await loadAgencyBillingStatus(company)).state;
}

export async function loadAgencyBillingStatus(company: AgencyCompany): Promise<{
  state: AgencyBillingState;
  online: boolean;
}> {
  const remote = await loadRemote(company);
  if (remote === "error") {
    return { state: readLocal(company), online: false };
  }
  return { state: await adoptRemoteBilling(company, remote), online: true };
}

async function adoptRemoteBilling(
  company: AgencyCompany,
  remote: AgencyBillingState | null,
) {
  const local = readLocal(company);
  if (!remote) {
    if (local.invoices.length || local.clients.length) {
      await saveAgencyBilling(local).catch((error) =>
        console.warn("[admin-agency-billing]", error),
      );
    }
    return local;
  }
  const invoices = mergeAgencyInvoices(local.invoices, remote.invoices);
  const clients = mergeAgencyClients(local.clients, remote.clients);
  const next = {
    ...remote,
    invoices,
    clients,
  };
  writeLocal(next);
  if (
    invoices.length > remote.invoices.length ||
    clients.length > remote.clients.length
  ) {
    await saveAgencyBilling(next).catch((error) =>
      console.warn("[admin-agency-billing]", error),
    );
  }
  return next;
}

export async function saveAgencyBilling(state: AgencyBillingState) {
  const remote = await loadRemote(state.company);
  const next = protectInvoicesFromEmptyOverwrite(
    {
      ...state,
      updatedAt: new Date().toISOString(),
    },
    remote === "error" ? null : remote,
  );
  writeLocal(next);
  if (remote === "error" && next.invoices.length === 0) {
    console.warn(
      "[admin-agency-billing] skip empty invoice save while remote billing is unread",
    );
    return next;
  }
  const saved = await saveRemote(next);
  writeLocal(saved);
  return saved;
}

export async function loadBookeaCentersForBilling(): Promise<
  BillingCenterContact[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select(
      "id,name,city,email,phone,address_line1,postal_code,legal:settings->legal,publicCenter:settings->public->center",
    )
    .order("name", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((center) =>
    billingCenterContactFromRow(center),
  );
}
