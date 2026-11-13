import {
  billingCenterContactFromRow,
  emptyAgencyState,
  mergeAgencyClients,
  mergeAgencyInvoices,
  normalizeAgencyState,
  protectInvoicesFromEmptyOverwrite,
  uniqueIds,
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

function writeLocal(state: AgencyBillingState, options: { unsaved?: boolean } = {}) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey(state.company),
      JSON.stringify(options.unsaved ? { ...state, unsaved: true } : state),
    );
  } catch (error) {
    console.warn("[admin-agency-billing] localStorage", error);
  }
}

/** La copie de l’appareil contient une modification que le serveur n’a pas confirmée. */
function localHasUnsavedEdits(company: AgencyCompany) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(company));
    return Boolean(raw && (JSON.parse(raw) as { unsaved?: unknown }).unsaved === true);
  } catch {
    return false;
  }
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
  // Le serveur fait foi : une vieille copie de l’appareil (autre ordinateur, onglet ancien)
  // ne doit pas remettre « En attente » sur une facture passée en « Payée » ailleurs.
  // Seule une modification jamais confirmée par le serveur garde la priorité.
  const unsaved = localHasUnsavedEdits(company);
  const deletedInvoiceIds = uniqueIds([
    ...(remote.deletedInvoiceIds || []),
    ...(local.deletedInvoiceIds || []),
  ]);
  const deleted = new Set(deletedInvoiceIds);
  const localInvoices = local.invoices.filter((item) => !deleted.has(item.id));
  const remoteInvoices = remote.invoices.filter((item) => !deleted.has(item.id));
  const invoices = unsaved
    ? mergeAgencyInvoices(localInvoices, remoteInvoices)
    : mergeAgencyInvoices(remoteInvoices, localInvoices);
  const clients = unsaved
    ? mergeAgencyClients(local.clients, remote.clients)
    : mergeAgencyClients(remote.clients, local.clients);
  const next = {
    ...remote,
    invoices,
    clients,
    deletedInvoiceIds: deletedInvoiceIds.length ? deletedInvoiceIds : remote.deletedInvoiceIds,
  };
  writeLocal(next, { unsaved });
  if (
    unsaved ||
    invoices.length > remote.invoices.length ||
    clients.length > remote.clients.length
  ) {
    await saveAgencyBilling(next).catch((error) =>
      console.warn("[admin-agency-billing]", error),
    );
  }
  return next;
}

const saveQueue = new Map<AgencyCompany, Promise<void>>();

function mergeBillingCopies(
  primary: AgencyBillingState,
  ...copies: Array<AgencyBillingState | null | undefined>
): AgencyBillingState {
  const deletedInvoiceIds = uniqueIds([
    ...(primary.deletedInvoiceIds || []),
    ...copies.flatMap((copy) => copy?.deletedInvoiceIds || []),
  ]);
  const deleted = new Set(deletedInvoiceIds);
  let invoices = primary.invoices.filter((item) => !deleted.has(item.id));
  let clients = primary.clients;
  for (const copy of copies) {
    if (!copy) {
      continue;
    }
    invoices = mergeAgencyInvoices(
      invoices,
      copy.invoices.filter((item) => !deleted.has(item.id)),
    );
    clients = mergeAgencyClients(clients, copy.clients);
  }
  return {
    ...primary,
    invoices,
    clients,
    deletedInvoiceIds: deletedInvoiceIds.length ? deletedInvoiceIds : primary.deletedInvoiceIds,
    revision: Math.max(
      primary.revision || 0,
      ...copies.map((copy) => copy?.revision || 0),
    ),
  };
}

export async function saveAgencyBilling(state: AgencyBillingState) {
  const previous = saveQueue.get(state.company) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => saveAgencyBillingUnlocked(state));
  saveQueue.set(
    state.company,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function saveAgencyBillingUnlocked(state: AgencyBillingState) {
  const remote = await loadRemote(state.company);
  const local = readLocal(state.company);
  const merged = mergeBillingCopies(
    state,
    local,
    remote === "error" ? null : remote,
  );
  const next = protectInvoicesFromEmptyOverwrite(
    {
      ...merged,
      updatedAt: new Date().toISOString(),
    },
    remote === "error" ? null : remote,
  );
  writeLocal(next, { unsaved: true });
  if (remote === "error") {
    throw new Error("Factures non enregistrées en ligne. Réessayez.");
  }
  const saved = await saveRemote(next);
  const confirmed = mergeBillingCopies(saved, readLocal(state.company));
  writeLocal(confirmed);
  return confirmed;
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

export async function sendAgencyInvoiceEmail(input: {
  number: string;
  client: string;
  to: string;
  subject: string;
  message: string;
  pdf: string;
}) {
  const response = await fetch("/api/admin/send-agency-invoice", {
    method: "POST",
    headers: await adminAuthHeaders(),
    body: JSON.stringify(input),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    emailedAt?: string;
    emailedTo?: string;
    error?: string;
  };
  if (response.status === 413) {
    throw new Error("Le PDF de la facture est trop lourd pour être envoyé.");
  }
  if (!response.ok || !result.ok || !result.emailedAt || !result.emailedTo) {
    throw new Error(result.error || "L’envoi de la facture a échoué.");
  }
  return { emailedAt: result.emailedAt, emailedTo: result.emailedTo };
}
