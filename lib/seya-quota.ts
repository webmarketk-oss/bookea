export const SEYA_PACK_LIMITS = [100, 200, 300, 500] as const;

export type SeyaQuota = {
  conversationLimit: number | null;
  packLeads: number | null;
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
    updatedAt: record.updatedAt ? String(record.updatedAt) : null,
  };
}

export function seyaConversationCount(seya: unknown): number {
  const conversations = asRecord(seya).conversations;
  return Array.isArray(conversations) ? conversations.length : 0;
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

  const used = Array.isArray(conversations) ? conversations.length : 0;
  return used >= limit;
}
