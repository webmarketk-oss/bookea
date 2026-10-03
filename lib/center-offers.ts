type SeyaQuotaLike = {
  conversationLimit: number | null;
  packLeads: number | null;
  subscribedAt: string | null;
  renewsAt: string | null;
  updatedAt: string | null;
};

export type BookeaPlan = {
  id: "crm-plus";
  title: string;
  price: number;
  subscribedAt: string;
  renewsAt: string;
};

const WHATSAPP_PRICES: Record<number, number> = {
  100: 79,
  200: 159,
  300: 229,
  500: 389,
};

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function addOneMonth(from: Date) {
  const next = new Date(from.getTime());
  const day = next.getDate();
  next.setMonth(next.getMonth() + 1);
  if (next.getDate() < day) {
    next.setDate(0);
  }
  return next;
}

export function monthlyRenewal(from = new Date()) {
  const start = new Date(from.getTime());
  return {
    subscribedAt: start.toISOString(),
    renewsAt: addOneMonth(start).toISOString(),
  };
}

export function formatOfferDate(value?: string | null) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(time));
}

export function seyaOfferFromQuota(quota: SeyaQuotaLike) {
  const leads = quota.packLeads ?? quota.conversationLimit;
  if (leads == null || leads <= 0) {
    return null;
  }

  const start = quota.subscribedAt || quota.updatedAt;
  const renewsAt =
    quota.renewsAt || (start ? addOneMonth(new Date(start)).toISOString() : null);
  if (!start || !renewsAt) {
    return null;
  }

  return {
    leads,
    price: WHATSAPP_PRICES[leads] ?? 0,
    subscribedAt: start,
    renewsAt,
  };
}

export function normalizeBookeaPlan(value: unknown): BookeaPlan | null {
  const record = asRecord(value);
  if (record.id !== "crm-plus") {
    return null;
  }

  const subscribedAt = String(record.subscribedAt || "");
  const renewsAt =
    String(record.renewsAt || "") ||
    (subscribedAt ? addOneMonth(new Date(subscribedAt)).toISOString() : "");
  if (!subscribedAt || !renewsAt) {
    return null;
  }

  return {
    id: "crm-plus",
    title: "CRM + SMS",
    price: Number(record.price) || 49,
    subscribedAt,
    renewsAt,
  };
}

export function createBookeaPlan(from = new Date()): BookeaPlan {
  const dates = monthlyRenewal(from);
  return {
    id: "crm-plus",
    title: "CRM + SMS",
    price: 49,
    subscribedAt: dates.subscribedAt,
    renewsAt: dates.renewsAt,
  };
}
