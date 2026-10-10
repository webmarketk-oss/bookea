import {
  appendAdminAlert,
  createAdminAlert,
  markAdminAlertInvoiced,
  markAdminAlertRead,
  normalizeAdminAlerts,
  type AdminAlert,
} from "@/lib/admin-alerts";
import {
  formatEuro,
  smsPacks,
  whatsappLeadPacks,
} from "@/lib/bookea-tarifs";
import { nextRenewalPeriod } from "@/api/billing/_renewal";
import { getActiveCenterContext } from "@/lib/center-access";
import {
  appendOfferHistory,
  createBookeaPlan,
  createOfferHistoryItem,
  formatOfferDate,
  monthlyRenewal,
  normalizeBookeaPlan,
  seyaOfferFromQuota,
} from "@/lib/center-offers";
import {
  normalizeSeyaQuota,
  seyaConversationCount,
  type SeyaQuota,
} from "@/lib/seya-quota";
import { createClient } from "@/lib/supabase";
import {
  normalizeSmsQuota,
  type SmsQuota,
  type SmsQuotaRecord,
} from "@/lib/sms-settings";

type CenterSettings = Record<string, unknown>;

function asRecord(value: unknown): CenterSettings {
  return value && typeof value === "object" ? (value as CenterSettings) : {};
}

function smsQuotaRecord(quota: SmsQuota): SmsQuotaRecord {
  return {
    remaining: quota.remaining,
    lastGrantMonth: quota.lastGrantMonth,
    monthlyGrant: quota.monthlyGrant,
    usedThisMonth: quota.usedThisMonth,
  };
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

export async function subscribeSmsPack(quantity: number) {
  const pack = smsPacks.find((item) => item.quantity === quantity);
  if (!pack) {
    throw new Error("Pack SMS inconnu.");
  }

  const context = await getActiveCenterContext();
  const center = await loadCenterSettings(context.centerId);
  const currentSms = asRecord(center.settings.sms);
  const quota = normalizeSmsQuota(currentSms.quota as SmsQuotaRecord | undefined);
  const nextQuota: SmsQuota = {
    ...quota,
    remaining: quota.remaining + pack.quantity,
    changed: false,
  };
  const alert = createAdminAlert({
    kind: "sms_pack",
    title: `${center.name} a rechargé ${pack.quantity} SMS`,
    message: `${center.name} a rechargé ${pack.quantity} SMS — ${formatEuro(pack.price)} — à recharger côté opérateur`,
    amountEuros: pack.price,
    quantity: pack.quantity,
  });

  const historyItem = createOfferHistoryItem({
    id: alert.id,
    kind: "sms_pack",
    label: `${pack.quantity} SMS`,
    amountEuros: pack.price,
    quantity: pack.quantity,
    renewsAt: null,
  });

  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    sms: {
      ...currentSms,
      quota: smsQuotaRecord(nextQuota),
    },
    adminAlerts: appendAdminAlert(center.settings.adminAlerts, alert),
    offerHistory: appendOfferHistory(center.settings.offerHistory, historyItem),
  });

  return {
    centerId: center.id,
    centerName: center.name,
    remaining: nextQuota.remaining,
    alert,
  };
}

export async function subscribeSeyaPack(leads: number) {
  const pack = whatsappLeadPacks.find((item) => item.leads === leads);
  if (!pack) {
    throw new Error("Pack WhatsApp inconnu.");
  }

  const context = await getActiveCenterContext();
  const center = await loadCenterSettings(context.centerId);
  const dates = monthlyRenewal();
  const nextQuota: SeyaQuota = {
    conversationLimit: pack.leads,
    packLeads: pack.leads,
    subscribedAt: dates.subscribedAt,
    renewsAt: dates.renewsAt,
    updatedAt: dates.subscribedAt,
  };
  const alert = createAdminAlert({
    kind: "seya_pack",
    title: `${center.name} a souscrit ${pack.leads} conversations Seya`,
    message: `${center.name} a souscrit ${pack.leads} conversations Seya — ${formatEuro(pack.price)}`,
    amountEuros: pack.price,
    quantity: pack.leads,
  });

  const historyItem = createOfferHistoryItem({
    id: alert.id,
    kind: "seya_pack",
    label: `WhatsApp ${pack.leads} leads`,
    amountEuros: pack.price,
    quantity: pack.leads,
    subscribedAt: dates.subscribedAt,
    renewsAt: dates.renewsAt,
  });

  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    seyaQuota: nextQuota,
    adminAlerts: appendAdminAlert(center.settings.adminAlerts, alert),
    offerHistory: appendOfferHistory(center.settings.offerHistory, historyItem),
  });

  return {
    centerId: center.id,
    centerName: center.name,
    quota: nextQuota,
    alert,
  };
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

export async function subscribeBookeaPlan() {
  const context = await getActiveCenterContext();
  const center = await loadCenterSettings(context.centerId);
  const plan = createBookeaPlan();
  const alert = createAdminAlert({
    kind: "crm_pack",
    title: `${center.name} a souscrit Bookea CRM + SMS`,
    message: `${center.name} a souscrit Bookea CRM + SMS — ${plan.price} € / mois`,
    amountEuros: plan.price,
    quantity: 1,
  });

  const historyItem = createOfferHistoryItem({
    id: alert.id,
    kind: "crm_pack",
    label: "Bookea CRM + SMS",
    amountEuros: plan.price,
    quantity: 1,
    subscribedAt: plan.subscribedAt,
    renewsAt: plan.renewsAt,
  });

  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    bookeaPlan: plan,
    adminAlerts: appendAdminAlert(center.settings.adminAlerts, alert),
    offerHistory: appendOfferHistory(center.settings.offerHistory, historyItem),
  });

  return {
    centerId: center.id,
    centerName: center.name,
    plan,
    alert,
  };
}

export async function renewSeyaPack() {
  const context = await getActiveCenterContext();
  const center = await loadCenterSettings(context.centerId);
  const current = normalizeSeyaQuota(center.settings.seyaQuota);
  const offer = seyaOfferFromQuota(current);
  if (!offer) {
    throw new Error("Aucun pack WhatsApp à renouveler.");
  }

  const price =
    whatsappLeadPacks.find((item) => item.leads === offer.leads)?.price ??
    offer.price;
  const period = nextRenewalPeriod(current.renewsAt);
  const nextQuota: SeyaQuota = {
    conversationLimit: offer.leads,
    packLeads: offer.leads,
    subscribedAt: period.renewedAt,
    renewsAt: period.renewsAt,
    updatedAt: period.renewedAt,
  };
  const alert = createAdminAlert({
    kind: "seya_pack",
    title: `${center.name} a renouvelé ${offer.leads} conversations Seya`,
    message: `${center.name} a renouvelé ${offer.leads} conversations Seya — ${formatEuro(price)} — jusqu’au ${formatOfferDate(period.renewsAt)}`,
    amountEuros: price,
    quantity: offer.leads,
    offer: "seya",
  });
  const historyItem = createOfferHistoryItem({
    id: alert.id,
    kind: "seya_pack",
    label: `WhatsApp ${offer.leads} leads`,
    amountEuros: price,
    quantity: offer.leads,
    subscribedAt: period.renewedAt,
    renewsAt: period.renewsAt,
  });

  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    seyaQuota: nextQuota,
    adminAlerts: appendAdminAlert(center.settings.adminAlerts, alert),
    offerHistory: appendOfferHistory(center.settings.offerHistory, historyItem),
  });

  return { centerName: center.name, renewsAt: period.renewsAt };
}

export async function renewBookeaPlan() {
  const context = await getActiveCenterContext();
  const center = await loadCenterSettings(context.centerId);
  const current = normalizeBookeaPlan(center.settings.bookeaPlan);
  if (!current) {
    throw new Error("Aucun abonnement Bookea à renouveler.");
  }

  const period = nextRenewalPeriod(current.renewsAt);
  const plan = {
    ...current,
    subscribedAt: period.renewedAt,
    renewsAt: period.renewsAt,
  };
  const alert = createAdminAlert({
    kind: "crm_pack",
    title: `${center.name} a renouvelé Bookea CRM + SMS`,
    message: `${center.name} a renouvelé Bookea CRM + SMS — ${plan.price} € / mois — jusqu’au ${formatOfferDate(period.renewsAt)}`,
    amountEuros: plan.price,
    quantity: 1,
    offer: "crm",
  });
  const historyItem = createOfferHistoryItem({
    id: alert.id,
    kind: "crm_pack",
    label: "Bookea CRM + SMS",
    amountEuros: plan.price,
    quantity: 1,
    subscribedAt: period.renewedAt,
    renewsAt: period.renewsAt,
  });

  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    bookeaPlan: plan,
    adminAlerts: appendAdminAlert(center.settings.adminAlerts, alert),
    offerHistory: appendOfferHistory(center.settings.offerHistory, historyItem),
  });

  return { centerName: center.name, renewsAt: period.renewsAt };
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

export async function markCenterAdminAlertInvoiced(
  centerId: string,
  alertId: string,
  receipt: {
    invoiceId: string;
    invoicedAt?: string;
    emailedAt?: string;
    emailedTo?: string;
  },
) {
  const center = await loadCenterSettings(centerId);
  await persistCenterSettings(center.supabase, center.id, {
    ...center.settings,
    adminAlerts: markAdminAlertInvoiced(
      center.settings.adminAlerts,
      alertId,
      receipt,
    ),
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
