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
  100: 69.97,
  150: 99.97,
  200: 129.95,
  250: 159.95,
  300: 189.95,
  400: 249.92,
  500: 309.9,
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

export type OfferHistoryKind = "seya_pack" | "sms_pack" | "crm_pack";

export type OfferHistoryItem = {
  id: string;
  kind: OfferHistoryKind;
  label: string;
  amountEuros: number;
  quantity: number;
  subscribedAt: string;
  renewsAt: string | null;
};

export const OFFER_HISTORY_LIMIT = 200;

export function createOfferHistoryItem(input: {
  kind: OfferHistoryKind;
  label: string;
  amountEuros: number;
  quantity: number;
  subscribedAt?: string;
  renewsAt?: string | null;
  id?: string;
}): OfferHistoryItem {
  const subscribedAt = input.subscribedAt || new Date().toISOString();
  return {
    id: input.id || `offer-${subscribedAt}-${input.kind}-${input.quantity}`,
    kind: input.kind,
    label: input.label,
    amountEuros: Number(input.amountEuros) || 0,
    quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
    subscribedAt,
    renewsAt: input.renewsAt ?? null,
  };
}

export function normalizeOfferHistoryItem(value: unknown): OfferHistoryItem | null {
  const record = asRecord(value);
  const kind =
    record.kind === "seya_pack" ||
    record.kind === "sms_pack" ||
    record.kind === "crm_pack"
      ? record.kind
      : null;
  const label = String(record.label || "").trim();
  const subscribedAt = String(record.subscribedAt || record.createdAt || "");
  if (!kind || !label || !subscribedAt) {
    return null;
  }

  return {
    id: String(record.id || `${kind}-${subscribedAt}-${record.quantity || ""}`),
    kind,
    label,
    amountEuros: Number(record.amountEuros) || 0,
    quantity: Math.max(0, Math.floor(Number(record.quantity) || 0)),
    subscribedAt,
    renewsAt: record.renewsAt ? String(record.renewsAt) : null,
  };
}

export function normalizeOfferHistory(value: unknown): OfferHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeOfferHistoryItem(item))
    .filter((item): item is OfferHistoryItem => Boolean(item))
    .sort((left, right) => Date.parse(right.subscribedAt) - Date.parse(left.subscribedAt));
}

export function appendOfferHistory(
  current: unknown,
  item: OfferHistoryItem,
): OfferHistoryItem[] {
  return [item, ...normalizeOfferHistory(current)].slice(0, OFFER_HISTORY_LIMIT);
}

export function historyFromAdminAlerts(value: unknown): OfferHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      const kind =
        record.kind === "seya_pack" ||
        record.kind === "sms_pack" ||
        record.kind === "crm_pack"
          ? record.kind
          : null;
      if (!kind) {
        return null;
      }
      const quantity = Math.max(0, Math.floor(Number(record.quantity) || 0));
      const subscribedAt = String(record.createdAt || "");
      const label =
        kind === "seya_pack"
          ? `WhatsApp ${quantity} leads`
          : kind === "sms_pack"
            ? `${quantity} SMS`
            : "Bookea CRM + SMS";
      return normalizeOfferHistoryItem({
        id: record.id,
        kind,
        label,
        amountEuros: record.amountEuros,
        quantity,
        subscribedAt,
        renewsAt:
          kind === "sms_pack"
            ? null
            : record.renewsAt ||
              (subscribedAt ? addOneMonth(new Date(subscribedAt)).toISOString() : null),
      });
    })
    .filter((item): item is OfferHistoryItem => Boolean(item));
}

export function mergeOfferHistory(
  stored: unknown,
  alerts?: unknown,
): OfferHistoryItem[] {
  const merged = new Map<string, OfferHistoryItem>();
  for (const item of [
    ...normalizeOfferHistory(stored),
    ...historyFromAdminAlerts(alerts),
  ]) {
    merged.set(item.id, item);
  }
  return [...merged.values()].sort(
    (left, right) => Date.parse(right.subscribedAt) - Date.parse(left.subscribedAt),
  );
}

function sameHistoryRow(left: OfferHistoryItem, right: OfferHistoryItem) {
  return (
    left.kind === right.kind &&
    left.quantity === right.quantity &&
    left.subscribedAt.slice(0, 10) === right.subscribedAt.slice(0, 10)
  );
}

export function withCurrentOffersInHistory(
  history: OfferHistoryItem[],
  current: {
    whatsapp?: ReturnType<typeof seyaOfferFromQuota>;
    bookea?: BookeaPlan | null;
  },
): OfferHistoryItem[] {
  const extras: OfferHistoryItem[] = [];
  if (current.whatsapp?.subscribedAt) {
    extras.push(
      createOfferHistoryItem({
        id: `current-seya-${current.whatsapp.subscribedAt}-${current.whatsapp.leads}`,
        kind: "seya_pack",
        label: `WhatsApp ${current.whatsapp.leads} leads`,
        amountEuros: current.whatsapp.price,
        quantity: current.whatsapp.leads,
        subscribedAt: current.whatsapp.subscribedAt,
        renewsAt: current.whatsapp.renewsAt,
      }),
    );
  }
  if (current.bookea?.subscribedAt) {
    extras.push(
      createOfferHistoryItem({
        id: `current-crm-${current.bookea.subscribedAt}`,
        kind: "crm_pack",
        label: current.bookea.title,
        amountEuros: current.bookea.price,
        quantity: 1,
        subscribedAt: current.bookea.subscribedAt,
        renewsAt: current.bookea.renewsAt,
      }),
    );
  }

  const merged = [...history];
  for (const item of extras) {
    if (!merged.some((existing) => sameHistoryRow(existing, item))) {
      merged.push(item);
    }
  }
  return mergeOfferHistory(merged);
}
