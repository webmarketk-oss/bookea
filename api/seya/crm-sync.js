const { crmUpdateFromLeadMessage, lockedCrmStatuses } = require("./conversation");

const WA_SENT_STATUS = "Message WhatsApp envoyé";

function last9(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function conversationHasSentSeyaMessage(conversation) {
  if (!conversation || conversation.status === "À envoyer") {
    return false;
  }
  return (conversation.messages || []).some((item) => item.author === "seya");
}

async function markLeadWhatsAppSent(supabase, centerId, leadId) {
  if (!supabase?.from || !centerId || !leadId) {
    return false;
  }

  try {
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,status")
      .eq("id", leadId)
      .eq("center_id", centerId)
      .maybeSingle();
    if (error || !lead) {
      return false;
    }
    const status = String(lead.status || "").trim();
    if (status && status !== "Nouveau") {
      return false;
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status: WA_SENT_STATUS,
        last_activity_at: now,
        updated_at: now,
        next_action: WA_SENT_STATUS,
      })
      .eq("id", leadId)
      .eq("center_id", centerId);
    return !updateError;
  } catch {
    return false;
  }
}

async function markMessagedNouveauLeads(supabase, centerId, conversations) {
  const ids = [
    ...new Set(
      (conversations || [])
        .filter((item) => item?.leadId && conversationHasSentSeyaMessage(item))
        .map((item) => item.leadId),
    ),
  ];
  if (!supabase?.from || !centerId || ids.length === 0) {
    return 0;
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("leads")
      .update({
        status: WA_SENT_STATUS,
        last_activity_at: now,
        updated_at: now,
        next_action: WA_SENT_STATUS,
      })
      .eq("center_id", centerId)
      .eq("status", "Nouveau")
      .in("id", ids)
      .select("id");
    if (error) {
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

function isCrmRelanceHold(row) {
  if (!row) {
    return false;
  }
  if (
    /reviendra vers nous|pas int[eé]ress|hors[- ]?zone|intraitable|contre[- ]?indication|revue sant[eé]|prospect perdu/i.test(
      String(row.status || ""),
    )
  ) {
    return true;
  }
  return Boolean(String(row.recall_date || row.reminderDate || "").trim());
}

async function loadRelanceHoldKeys(supabase, centerId) {
  const hold = new Set();
  if (!supabase?.from || !centerId) {
    return hold;
  }

  try {
    const { data, error } = await supabase
      .from("leads")
      .select("id,phone,status,recall_date")
      .eq("center_id", centerId);
    if (error) {
      return hold;
    }
    for (const row of data || []) {
      if (!isCrmRelanceHold(row)) {
        continue;
      }
      if (row.id) {
        hold.add(`id:${row.id}`);
      }
      const phone = last9(row.phone);
      if (phone) {
        hold.add(`phone:${phone}`);
      }
    }
  } catch {
    return hold;
  }

  return hold;
}

function leadRelanceKeys(row) {
  const keys = [];
  if (row?.id) {
    keys.push(`id:${row.id}`);
  }
  const phone = last9(row?.phone);
  if (phone) {
    keys.push(`phone:${phone}`);
  }
  return keys;
}

function isLockedCrmStatus(status) {
  const current = String(status || "").toLowerCase();
  return lockedCrmStatuses().some((item) => item.toLowerCase() === current);
}

async function syncCrmFromConversation(supabase, centerId, conversation, crmHold) {
  const lastLead = [...(conversation?.messages || [])]
    .reverse()
    .find((item) => item.author === "lead");
  if (!supabase?.from || !centerId || !conversation?.leadId || !lastLead?.text) {
    return conversation;
  }

  const intent = crmUpdateFromLeadMessage(lastLead.text, new Date());
  if (!intent) {
    return conversation;
  }

  let next = conversation;
  if (
    intent.conversationStatus &&
    !/rdv pris|rdv confirm/i.test(String(conversation.status || ""))
  ) {
    next = {
      ...conversation,
      status: intent.conversationStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,phone,status,recall_date")
      .eq("id", conversation.leadId)
      .eq("center_id", centerId)
      .maybeSingle();
    if (error || !lead) {
      return next;
    }
    if (isLockedCrmStatus(lead.status) || isCrmRelanceHold(lead)) {
      if (isCrmRelanceHold(lead) && crmHold) {
        for (const key of leadRelanceKeys(lead)) {
          crmHold.add(key);
        }
      }
      return next;
    }

    const now = new Date().toISOString();
    const patch = {
      status: intent.status,
      last_activity_at: now,
      updated_at: now,
      next_action: intent.reminderDate
        ? `Recontacter le ${intent.reminderDate}`
        : intent.status,
    };
    if (intent.reminderDate) {
      patch.recall_date = intent.reminderDate;
    }
    const { error: updateError } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", lead.id)
      .eq("center_id", centerId);
    if (!updateError && crmHold && isCrmRelanceHold({ ...lead, ...patch })) {
      for (const key of leadRelanceKeys(lead)) {
        crmHold.add(key);
      }
    }
  } catch {
    return next;
  }

  return next;
}

function conversationOnRelanceHold(conversation, hold) {
  if (
    /reviendra vers nous|pas int[eé]ress|hors[- ]?zone|intraitable|contre[- ]?indication|revue sant[eé]/i.test(
      String(conversation?.status || ""),
    )
  ) {
    return true;
  }
  if (!hold || hold.size === 0) {
    return false;
  }
  if (conversation?.leadId && hold.has(`id:${conversation.leadId}`)) {
    return true;
  }
  const phone = last9(conversation?.phone);
  return Boolean(phone && hold.has(`phone:${phone}`));
}

module.exports = {
  WA_SENT_STATUS,
  conversationHasSentSeyaMessage,
  conversationOnRelanceHold,
  isCrmRelanceHold,
  loadRelanceHoldKeys,
  markLeadWhatsAppSent,
  markMessagedNouveauLeads,
  syncCrmFromConversation,
};
