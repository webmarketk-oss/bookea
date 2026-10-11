import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export type LeadOfferRoute = {
  match: string;
  offer: string;
};

function cleanRoutes(value: unknown): LeadOfferRoute[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      match: String((item as LeadOfferRoute)?.match || "").trim(),
      offer: String((item as LeadOfferRoute)?.offer || "").trim(),
    }))
    .filter((item) => item.match && item.offer);
}

async function readCenterSettingsRow() {
  const context = await getActiveCenterContext();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", context.centerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const settings =
    data?.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  return { supabase, centerId: context.centerId, settings };
}

export async function loadLeadOfferRoutes() {
  const { settings } = await readCenterSettingsRow();
  return cleanRoutes(settings.leadOfferRoutes);
}

export async function saveLeadOfferRoutes(routes: LeadOfferRoute[]) {
  const { supabase, centerId, settings } = await readCenterSettingsRow();
  const next = cleanRoutes(routes);
  const { data, error } = await supabase
    .from("centers")
    .update({ settings: { ...settings, leadOfferRoutes: next } })
    .eq("id", centerId)
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new Error("Enregistrement refusé. Seul un gérant du centre peut modifier ces réglages.");
  }
  return next;
}
