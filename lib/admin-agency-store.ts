import {
  emptyAgencyState,
  normalizeAgencyState,
  type AgencyBillingState,
  type AgencyCompany,
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

export async function loadAgencyBilling(company: AgencyCompany) {
  const local = readLocal(company);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("admin_agency_billing")
      .select("payload")
      .eq("company", company)
      .maybeSingle();
    if (error || !data) {
      return local;
    }
    return normalizeAgencyState(company, data.payload);
  } catch {
    return local;
  }
}

export async function saveAgencyBilling(state: AgencyBillingState) {
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  writeLocal(next);
  try {
    const supabase = createClient();
    const { error } = await supabase.from("admin_agency_billing").upsert(
      {
        company: next.company,
        payload: next,
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

export async function loadBookeaCentersForBilling() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,city,email")
    .order("name", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{
    id: string;
    name: string | null;
    city: string | null;
    email: string | null;
  }>).map((center) => ({
    id: center.id,
    name: center.name || "Centre",
    city: center.city || "",
    email: center.email || "",
  }));
}
