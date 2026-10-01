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

function preferredBookingStatus(newerStatus, olderStatus) {
  const ranks = [
    /terminé|termine/i,
    /rdv confirm/i,
    /rdv pris/i,
  ];
  for (const rank of ranks) {
    if (rank.test(String(newerStatus || ""))) {
      return newerStatus;
    }
    if (rank.test(String(olderStatus || ""))) {
      return olderStatus;
    }
  }
  return newerStatus || olderStatus;
}

function mergeConversationPair(current, next) {
  const newer = isFresherConversation(next, current) ? next : current;
  const older = newer === next ? current : next;
  const bookedSlot = newer.bookedSlot || older.bookedSlot;
  const confirmed =
    newer.bookingState?.appointmentStatus === "confirmed" ||
    older.bookingState?.appointmentStatus === "confirmed" ||
    Boolean(bookedSlot);
  return {
    ...older,
    ...newer,
    leadId: newer.leadId || older.leadId,
    id: newer.id || older.id || newer.leadId || older.leadId,
    phone: newer.phone || older.phone,
    firstName: newer.firstName || older.firstName,
    lastName: newer.lastName || older.lastName,
    bookedSlot,
    status: preferredBookingStatus(newer.status, older.status),
    messages:
      (newer.messages || []).length >= (older.messages || []).length
        ? newer.messages
        : older.messages,
    bookingState: {
      ...(older.bookingState || {}),
      ...(newer.bookingState || {}),
      appointmentStatus: confirmed
        ? "confirmed"
        : newer.bookingState?.appointmentStatus ||
          older.bookingState?.appointmentStatus,
      lastOfferedSlots: confirmed
        ? []
        : newer.bookingState?.lastOfferedSlots ||
          older.bookingState?.lastOfferedSlots,
      pendingQuestion: confirmed
        ? null
        : newer.bookingState?.pendingQuestion ??
          older.bookingState?.pendingQuestion,
    },
  };
}

function identityKeys(item) {
  const keys = [];
  const leadId = String(item?.leadId || "").trim();
  if (leadId) {
    keys.push(`lead:${leadId}`);
  }
  const phone = last9Phone(item?.phone);
  if (phone.length >= 9) {
    keys.push(`phone:${phone}`);
  }
  const id = String(item?.id || "").trim();
  if (id) {
    keys.push(`id:${id}`);
  }
  return keys;
}

function mergeSeyaConversationLists(...lists) {
  const merged = [];
  const indexByKey = new Map();

  for (const list of lists) {
    for (const item of list || []) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const keys = identityKeys(item);
      if (!keys.length) {
        continue;
      }
      let index = -1;
      for (const key of keys) {
        if (indexByKey.has(key)) {
          index = indexByKey.get(key);
          break;
        }
      }
      if (index === -1) {
        index = merged.length;
        merged.push(item);
      } else {
        merged[index] = mergeConversationPair(merged[index], item);
      }
      for (const key of identityKeys(merged[index])) {
        indexByKey.set(key, index);
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
