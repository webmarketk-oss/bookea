import {
  billingCenterContactFromRow,
  emptyAgencyState,
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

async function loadRemote(company: AgencyCompany) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("admin_agency_billing")
      .select("payload")
      .eq("company", company)
      .maybeSingle();
    if (error || !data) {
      return error ? ("error" as const) : null;
    }
    return normalizeAgencyState(company, data.payload);
  } catch {
    return "error" as const;
  }
}

export async function loadAgencyBilling(company: AgencyCompany) {
  const local = readLocal(company);
  const remote = await loadRemote(company);
  if (remote === "error" || !remote) {
    return local;
  }
  return remote;
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
  try {
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("admin_agency_billing")
      .select("payload")
      .eq("company", next.company)
      .maybeSingle();
    const mailbox =
      existing?.payload &&
      typeof existing.payload === "object" &&
      "mailbox" in existing.payload
        ? (existing.payload as { mailbox?: unknown }).mailbox
        : undefined;
    const { error } = await supabase.from("admin_agency_billing").upsert(
      {
        company: next.company,
        payload: mailbox ? { ...next, mailbox } : next,
        updated_at: next.updatedAt,
      },
      { onConflict: "company" },
    );
    if (error) {
      console.warn("[admin-agency-billing]", error.message);
    }
  } catch (error) {
    console.warn("[admin-agency-billing]", error);
  }
  return next;
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
