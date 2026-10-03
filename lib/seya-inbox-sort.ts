export type SeyaInboxTag =
  | "court"
  | "chaud"
  | "qualifie"
  | "humain"
  | "rdv"
  | "sans_reponse"
  | "ferme";

export type SeyaInboxItem = {
  status?: string;
  bookedSlot?: unknown;
  messages?: Array<{ author?: string; at?: string; text?: string }>;
  updatedAt?: string;
};

export const SEYA_INBOX_RECENT_MS = 48 * 60 * 60 * 1000;

function normalizeInboxText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isLeadOptOutText(text?: string) {
  const raw = String(text || "").trim();
  const needle = normalizeInboxText(raw).replace(/[!?.]+$/g, "");
  if (!needle) {
    return false;
  }
  if (/^(stop|stoppez|arrete|arretez|stop svp)$/.test(needle)) {
    return true;
  }
  if (/pas interess/.test(needle)) {
    return true;
  }
  if (/ne donne pas suite/.test(needle)) {
    return true;
  }
  if (/pas la peine/.test(needle)) {
    return true;
  }
  if (/ne (me )?(plus )?(ecrire|contacter|deranger|appeler|relancer)/.test(needle)) {
    return true;
  }
  return /^(non merci|plus jamais)$/.test(needle);
}

function isSeyaClosedReply(text?: string) {
  const needle = normalizeInboxText(text || "");
  return (
    /j['’ ]?arrete ici/.test(needle) || /si vous changez d['’ ]avis/.test(needle)
  );
}

export function conversationLooksClosed(conversation: SeyaInboxItem) {
  const status = conversation.status;
  if (status === "Pas intéressé" || status === "Terminé") {
    return true;
  }

  const messages = conversation.messages || [];
  if (messages.some((item) => item.author === "lead" && isLeadOptOutText(item.text))) {
    return true;
  }

  const last = messages[messages.length - 1];
  return Boolean(
    last &&
      (last.author === "seya" || last.author === "centre") &&
      isSeyaClosedReply(last.text),
  );
}

function hasBookedAppointment(conversation: SeyaInboxItem) {
  const status = conversation.status;
  return Boolean(
    conversation.bookedSlot ||
      status === "RDV pris" ||
      status === "RDV confirmé",
  );
}

export function inboxTag(conversation: SeyaInboxItem): SeyaInboxTag {
  if (conversationLooksClosed(conversation)) {
    return "ferme";
  }

  const status = conversation.status;
  if (hasBookedAppointment(conversation)) {
    return "rdv";
  }
  if (status === "À recontacter" || status === "Revue santé") {
    return "humain";
  }
  if (status === "Chaud" || status === "RDV proposé") {
    return "chaud";
  }
  if (status === "Qualifié") {
    return "qualifie";
  }

  const leadReplied = (conversation.messages || []).some((item) => item.author === "lead");
  if (!leadReplied) {
    return "sans_reponse";
  }

  return (conversation.messages || []).length <= 4 ? "court" : "chaud";
}

function lastActivityAt(conversation: SeyaInboxItem) {
  const messages = conversation.messages || [];
  const last = messages[messages.length - 1];
  return String(last?.at || conversation.updatedAt || "");
}

export function lastInboxActivityMs(conversation: SeyaInboxItem) {
  const parsed = Date.parse(lastActivityAt(conversation));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasRecentInboxActivity(
  item: SeyaInboxItem,
  now = Date.now(),
) {
  const at = lastInboxActivityMs(item);
  return at > 0 && now - at <= SEYA_INBOX_RECENT_MS;
}

export function isOngoingSeyaThread(item: SeyaInboxItem) {
  const tag = inboxTag(item);
  return tag === "court" || tag === "chaud" || tag === "qualifie";
}

function inboxSortRank(item: SeyaInboxItem, now: number) {
  const tag = inboxTag(item);
  if (tag === "ferme") {
    return 50;
  }

  const recent = hasRecentInboxActivity(item, now);
  if (recent && (tag === "court" || tag === "chaud" || tag === "qualifie")) {
    return 0;
  }
  if (recent) {
    return 1;
  }
  if (tag === "court" || tag === "chaud" || tag === "qualifie") {
    return 2;
  }
  if (tag === "humain") {
    return 3;
  }
  if (tag === "sans_reponse") {
    return 4;
  }
  if (tag === "rdv") {
    return 5;
  }
  return 6;
}

export function sortSeyaInbox<T extends SeyaInboxItem>(
  conversations: T[],
  now = Date.now(),
) {
  return [...conversations].sort((a, b) => {
    const rankGap = inboxSortRank(a, now) - inboxSortRank(b, now);
    if (rankGap !== 0) {
      return rankGap;
    }
    return lastInboxActivityMs(b) - lastInboxActivityMs(a);
  });
}

export function inboxTagLabel(tag: SeyaInboxTag) {
  if (tag === "court") return "💬 En cours";
  if (tag === "chaud") return "🔥 Chaud";
  if (tag === "qualifie") return "✅ Qualifié";
  if (tag === "humain") return "🚨 À recontacter";
  if (tag === "rdv") return "📅 RDV";
  if (tag === "sans_reponse") return "⏳ Sans réponse";
  return "❌ Fermé";
}
