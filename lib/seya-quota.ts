import { periodConversationCount } from "../api/billing/_renewal.js";

export const SEYA_PACK_LIMITS = [100, 150, 200, 250, 300, 400, 500] as const;

export type SeyaQuota = {
  conversationLimit: number | null;
  packLeads: number | null;
  subscribedAt: string | null;
  renewsAt: string | null;
  updatedAt: string | null;
};

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function conversationLimitFromValue(value: unknown): number | null {
  if (value == null || value === "" || value === "unlimited") {
    return null;
  }

  const limit = Number(value);
  if (!Number.isFinite(limit)) {
    return null;
  }

  return Math.max(0, Math.floor(limit));
}

export function normalizeSeyaQuota(value?: unknown): SeyaQuota {
  const record = asRecord(value);
  return {
    conversationLimit: conversationLimitFromValue(record.conversationLimit),
    packLeads: conversationLimitFromValue(record.packLeads),
    subscribedAt: record.subscribedAt ? String(record.subscribedAt) : null,
    renewsAt: record.renewsAt ? String(record.renewsAt) : null,
    updatedAt: record.updatedAt ? String(record.updatedAt) : null,
  };
}

export function seyaConversationCount(
  seya: unknown,
  quota?: unknown,
): number {
  const conversations = asRecord(seya).conversations;
  if (!Array.isArray(conversations)) {
    return 0;
  }
  return quota === undefined
    ? conversations.length
    : periodConversationCount(conversations, quota);
}

export function seyaRemainingConversations(
  used: number,
  limit: number | null,
): number | null {
  if (limit == null) {
    return null;
  }

  return Math.max(0, limit - used);
}

export function isNewSeyaConversationBlocked(
  settings: unknown,
  conversations: unknown,
  existing?: unknown,
): boolean {
  if (existing) {
    return false;
  }

  const limit = normalizeSeyaQuota(asRecord(settings).seyaQuota).conversationLimit;
  if (limit == null) {
    return false;
  }

  return (
    periodConversationCount(conversations, asRecord(settings).seyaQuota) >= limit
  );
}
