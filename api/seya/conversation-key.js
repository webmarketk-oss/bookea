function last9Phone(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function persistableConversation(item) {
  if (!item || typeof item !== "object") {
    return item;
  }
  const { _seya, ...rest } = item;
  return rest;
}

function lastActivityAt(item) {
  const messages = item?.messages || [];
  const last = messages[messages.length - 1];
  return String(last?.at || item?.updatedAt || "");
}

function isLiveSeyaThread(item) {
  const messages = item?.messages || [];
  return messages.some((entry) => entry?.author === "lead") || messages.length > 2;
}

function seyaConversationKey(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const leadId = String(item.leadId || "").trim();
  if (leadId) {
    return `lead:${leadId}`;
  }
  const phone = last9Phone(item.phone);
  if (phone.length >= 9) {
    return `phone:${phone}`;
  }
  const id = String(item.id || "").trim();
  if (id) {
    return `id:${id}`;
  }
  return "";
}

function isSameSeyaConversation(item, other) {
  if (!item || !other) {
    return false;
  }
  const leadA = String(item.leadId || "").trim();
  const leadB = String(other.leadId || "").trim();
  if (leadA && leadB && leadA === leadB) {
    return true;
  }
  const phoneA = last9Phone(item.phone);
  const phoneB = last9Phone(other.phone);
  if (phoneA.length >= 9 && phoneA === phoneB) {
    return true;
  }
  const idA = String(item.id || "").trim();
  const idB = String(other.id || "").trim();
  return Boolean(idA && idB && idA === idB);
}

function isFresherConversation(next, current) {
  const nextCount = next?.messages?.length || 0;
  const currentCount = current?.messages?.length || 0;
  if (nextCount !== currentCount) {
    return nextCount > currentCount;
  }
  const nextAt = lastActivityAt(next);
  const currentAt = lastActivityAt(current);
  if (nextAt !== currentAt) {
    return nextAt > currentAt;
  }
  return String(next?.updatedAt || "") >= String(current?.updatedAt || "");
}

function mergeConversationPair(current, next) {
  const newer = isFresherConversation(next, current) ? next : current;
  const older = newer === next ? current : next;
  return {
    ...older,
    ...newer,
    leadId: newer.leadId || older.leadId,
    id: newer.id || older.id || newer.leadId || older.leadId,
    phone: newer.phone || older.phone,
    firstName: newer.firstName || older.firstName,
    lastName: newer.lastName || older.lastName,
    messages:
      (newer.messages || []).length >= (older.messages || []).length
        ? newer.messages
        : older.messages,
  };
}

function mergeSeyaConversationLists(...lists) {
  const merged = [];

  for (const list of lists) {
    for (const item of list || []) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (!seyaConversationKey(item)) {
        continue;
      }
      const index = merged.findIndex((current) =>
        isSameSeyaConversation(current, item),
      );
      if (index === -1) {
        merged.push(item);
      } else {
        merged[index] = mergeConversationPair(merged[index], item);
      }
    }
  }

  return merged;
}

function persistableConversations(list) {
  const items = (Array.isArray(list) ? list : []).map(persistableConversation);
  const live = items
    .filter(isLiveSeyaThread)
    .sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)));
  const rest = items
    .filter((item) => !isLiveSeyaThread(item))
    .sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)));
  const restWithPhone = rest.filter((item) => last9Phone(item.phone).length >= 9);
  const restWithoutPhone = rest.filter(
    (item) => last9Phone(item.phone).length < 9,
  );
  return [
    ...live.slice(0, 200),
    ...restWithPhone.slice(0, 200),
    ...restWithoutPhone.slice(0, 40),
  ];
}

module.exports = {
  isLiveSeyaThread,
  isSameSeyaConversation,
  last9Phone,
  lastActivityAt,
  mergeSeyaConversationLists,
  persistableConversation,
  persistableConversations,
  seyaConversationKey,
};
