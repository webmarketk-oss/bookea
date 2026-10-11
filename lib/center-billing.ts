import {
  markAdminAlertRead,
  normalizeAdminAlerts,
  type AdminAlert,
} from "@/lib/admin-alerts";
import { getActiveCenterContext } from "@/lib/center-access";
import {
  normalizeBookeaPlan,
  seyaOfferFromQuota,
} from "@/lib/center-offers";
import {
  normalizeSeyaQuota,
  seyaConversationCount,
  type SeyaQuota,
} from "@/lib/seya-quota";
import { createClient } from "@/lib/supabase";
import { normalizeSmsQuota, type SmsQuotaRecord } from "@/lib/sms-settings";

type CenterSettings = Record<string, unknown>;

function asRecord(value: unknown): CenterSettings {
  return value && typeof value === "object" ? (value as CenterSettings) : {};
}

async function loadCenterSettings(centerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,settings")
    .eq("id", centerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Centre introuvable.");
  }

  return {
    supabase,
    id: String(data.id),
    name: String(data.name || "Centre Bookea"),
    settings: asRecord(data.settings),
  };
}

async function persistCenterSettings(
  supabase: ReturnType<typeof createClient>,
  centerId: string,
  settings: CenterSettings,
) {
  const { error } = await supabase
    .from("centers")
    .update({
      settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", centerId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setCenterSeyaQuota(
  centerId: string,
  conversationLimit: number | null,
) {
  const center = await loadCenterSettings(centerId);
  const current = normalizeSeyaQuota(center.settings.seyaQuota);
  const nextQuota: SeyaQuota = {
    conversationLimit,
    packLeads: current.packLeads,
    subscribedAt: current.subscribedAt,
    renewsAt: current.renewsAt,
    updatedAt: new Date().toISOString(),
  };

  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    seyaQuota: nextQuota,
  });

  return {
    centerId: center.id,
    quota: nextQuota,
    used: seyaConversationCount(center.settings.seya, nextQuota),
  };
}

export type OfferCheckoutRequest =
  | { type: "seya"; leads: number }
  | { type: "sms"; quantity: number }
  | { type: "crm" }
  | { type: "renew_seya" }
  | { type: "renew_crm" };

async function postCheckout(body: Record<string, unknown>) {
  const context = await getActiveCenterContext();
  const {
    data: { session },
  } = await createClient().auth.getSession();
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify({ centerId: context.centerId, ...body }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    activated?: number;
    error?: string;
  };
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Le paiement n’a pas pu démarrer. Réessayez.");
  }
  return result;
}

export async function startOfferCheckout(offer: OfferCheckoutRequest) {
  const result = await postCheckout({ action: "start", offer });
  if (!result.url) {
    throw new Error("Le paiement n’a pas pu démarrer. Réessayez.");
  }
  window.location.assign(result.url);
}

export async function syncOfferCheckouts() {
  const result = await postCheckout({ action: "sync" });
  return result.activated ?? 0;
}

export async function markCenterAdminAlertRead(
  centerId: string,
  alertId: string,
) {
  const center = await loadCenterSettings(centerId);
  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    adminAlerts: markAdminAlertRead(center.settings.adminAlerts, alertId),
  });
}

export type AdminInboxItem = AdminAlert & {
  centerId: string;
  centerName: string;
  centerSlug: string;
};

export async function loadAdminInbox(): Promise<AdminInboxItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,slug,adminAlerts:settings->adminAlerts")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{
    id: string;
    name: string | null;
    slug: string | null;
    adminAlerts?: unknown;
  }>)
    .flatMap((center) =>
      normalizeAdminAlerts(center.adminAlerts).map((alert) => ({
        ...alert,
        centerId: center.id,
        centerName: center.name || "Centre Bookea",
        centerSlug: center.slug || "",
      })),
    )
    .sort((left, right) => {
      const unread = Number(!left.readAt) - Number(!right.readAt);
      if (unread !== 0) {
        return unread > 0 ? -1 : 1;
      }
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
}

export async function loadActiveCenterBilling() {
  const context = await getActiveCenterContext();
  const center = await loadCenterSettings(context.centerId);
  const sms = normalizeSmsQuota(
    asRecord(center.settings.sms).quota as SmsQuotaRecord | undefined,
  );
  const seyaQuota = normalizeSeyaQuota(center.settings.seyaQuota);

  return {
    centerId: center.id,
    centerName: center.name,
    smsRemaining: sms.remaining,
    seyaQuota,
    seyaUsed: seyaConversationCount(center.settings.seya, seyaQuota),
    whatsappOffer: seyaOfferFromQuota(seyaQuota),
    bookeaPlan: normalizeBookeaPlan(center.settings.bookeaPlan),
  };
}
