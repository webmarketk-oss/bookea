export type SeyaInboxTag =
  | "court"
  | "chaud"
  | "humain"
  | "rdv"
  | "sans_reponse"
  | "ferme";

export type SeyaInboxItem = {
  status?: string;
  messages?: Array<{ author?: string; at?: string }>;
  updatedAt?: string;
};

export function inboxTag(conversation: SeyaInboxItem): SeyaInboxTag {
  const status = conversation.status;
  if (status === "Pas intéressé" || status === "Terminé") {
    return "ferme";
  }
  if (status === "RDV pris" || status === "RDV confirmé") {
    return "rdv";
  }
  if (status === "À recontacter" || status === "Revue santé") {
    return "humain";
  }
  if (status === "Chaud" || status === "RDV proposé") {
    return "chaud";
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

export function isOngoingSeyaThread(item: SeyaInboxItem) {
  const tag = inboxTag(item);
  return tag === "court" || tag === "chaud";
}

function inboxSortRank(item: SeyaInboxItem) {
  const tag = inboxTag(item);
  if (tag === "court" || tag === "chaud") {
    return 0;
  }
  if (tag === "humain") {
    return 1;
  }
  if (tag === "sans_reponse") {
    return 2;
  }
  if (tag === "rdv") {
    return 3;
  }
  return 4;
}

export function sortSeyaInbox<T extends SeyaInboxItem>(conversations: T[]) {
  return [...conversations].sort((a, b) => {
    const rankGap = inboxSortRank(a) - inboxSortRank(b);
    if (rankGap !== 0) {
      return rankGap;
    }
    return lastActivityAt(b).localeCompare(lastActivityAt(a));
  });
}

export function inboxTagLabel(tag: SeyaInboxTag) {
  if (tag === "court") return "En cours";
  if (tag === "chaud") return "Chaud";
  if (tag === "humain") return "À recontacter";
  if (tag === "rdv") return "RDV";
  if (tag === "sans_reponse") return "Sans réponse";
  return "Fermé";
}
