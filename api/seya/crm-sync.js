const { crmUpdateFromLeadMessage, lockedCrmStatuses } = require("./conversation");
const {
  closeConversationForCrmStatus,
  crmStatusLabel,
  seyaStatusForCrmStatus,
  withCrmStatus,
} = require("./booking-close");

const WA_SENT_STATUS = "Message WhatsApp envoyé";
const CRM_LEAD_COLUMNS = "id,client_id,status,recall_date,created_at,updated_at,clients(phone)";
const CRM_PAGE_SIZE = 1000;
const crmLeadIndexes = new WeakMap();

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

const CRM_HOLD_STATUS =
  /reviendra vers nous|pas int[eé]ress|hors[- ]?zone|intraitable|contre[- ]?indication|revue sant[eé]|prospect perdu|client perdu|no[- ]?show|doublon|num[eé]ro invalide/i;
const CRM_RELANCE_HOLD_STATUS =
  /en r[eé]flexion|acompte|devis|vendu|rdv pris|rdv confirm|client converti/i;

function crmStatusText(status) {
  return `${String(status || "").trim()} | ${crmStatusLabel(status)}`;
}

function crmLeadRow(row) {
  if (!row) {
    return row;
  }
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return { ...row, phone: row.phone || client?.phone || "" };
}

function newerLead(current, next) {
  if (!current) {
    return next;
  }
  const at = (row) => String(row.updated_at || row.created_at || "");
  return at(next) > at(current) ? next : current;
}

function indexCrmLeads(rows) {
  const byId = new Map();
  const byClient = new Map();
  const byPhone = new Map();
  for (const raw of rows || []) {
    const row = crmLeadRow(raw);
    if (row?.id) {
      byId.set(String(row.id), row);
    }
    if (row?.client_id) {
      const key = String(row.client_id);
      byClient.set(key, newerLead(byClient.get(key), row));
    }
    const phone = last9(row?.phone);
    if (phone.length === 9) {
      byPhone.set(phone, newerLead(byPhone.get(phone), row));
    }
  }
  return { byId, byClient, byPhone };
}

function crmLeadFor(conversation, crmHold) {
  const index = crmHold ? crmLeadIndexes.get(crmHold) : null;
  if (!index || !conversation) {
    return null;
  }
  const leadId = String(conversation.leadId || "");
  const phone = last9(conversation.phone);
  return (
    (leadId && (index.byId.get(leadId) || index.byClient.get(leadId))) ||
    (phone.length === 9 && index.byPhone.get(phone)) ||
    null
  );
}

function isCrmRelanceHold(row) {
  if (!row) {
    return false;
  }
  if (CRM_HOLD_STATUS.test(crmStatusText(row.status))) {
    return true;
  }
  return Boolean(crmRecallDay(row));
}

function crmRecallDay(row) {
  const day = String(row?.recall_date || row?.reminderDate || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function parisToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isCrmRelanceHeld(row, now = new Date()) {
  if (!row) {
    return false;
  }
  const status = crmStatusText(row.status);
  if (CRM_HOLD_STATUS.test(status) || CRM_RELANCE_HOLD_STATUS.test(status)) {
    return true;
  }
  const recall = crmRecallDay(row);
  return Boolean(recall && recall > parisToday(now));
}

async function loadRelanceHoldKeys(supabase, centerId, now = new Date()) {
  const hold = new Set();
  crmLeadIndexes.set(hold, { ...indexCrmLeads([]), now });
  if (!supabase?.from || !centerId) {
    return hold;
  }

  try {
    const rows = [];
    for (let from = 0; ; from += CRM_PAGE_SIZE) {
      const query = supabase.from("leads").select(CRM_LEAD_COLUMNS).eq("center_id", centerId);
      const paged = typeof query.range === "function";
      const { data, error } = await (paged
        ? query.order("id").range(from, from + CRM_PAGE_SIZE - 1)
        : query);
      if (error) {
        console.error("[seya/crm-sync] leads", centerId, error.message);
        return hold;
      }
      rows.push(...(data || []));
      if (!paged || (data || []).length < CRM_PAGE_SIZE) {
        break;
      }
    }
    crmLeadIndexes.set(hold, { ...indexCrmLeads(rows), now });
  } catch (error) {
    console.error("[seya/crm-sync] leads", centerId, error);
    return hold;
  }

  return hold;
}

function crmRecallDayFor(conversation, crmHold) {
  const lead = crmLeadFor(conversation, crmHold);
  return lead ? crmRecallDay(lead) : "";
}

function withCrmSnapshot(conversation, crmHold) {
  const lead = crmLeadFor(conversation, crmHold);
  if (!lead) {
    return conversation;
  }
  return withCrmStatus(conversation, lead.status, crmRecallDay(lead));
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
  const current = [String(status || ""), crmStatusLabel(status)].map((item) =>
    item.toLowerCase(),
  );
  return lockedCrmStatuses().some((item) => current.includes(item.toLowerCase()));
}

function closeForCrmStatus(conversation, crmHold) {
  const lead = crmLeadFor(conversation, crmHold);
  return lead && seyaStatusForCrmStatus(lead.status)
    ? closeConversationForCrmStatus(conversation, lead.status)
    : conversation;
}

async function syncCrmFromConversation(supabase, centerId, original, crmHold) {
  const conversation = withCrmSnapshot(original, crmHold);
  const closed = closeForCrmStatus(conversation, crmHold);
  if (closed !== conversation) {
    return closed;
  }
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
    const { data: row, error } = await supabase
      .from("leads")
      .select(CRM_LEAD_COLUMNS)
      .eq("id", conversation.leadId)
      .eq("center_id", centerId)
      .maybeSingle();
    if (error) {
      console.error("[seya/crm-sync] lead", conversation.leadId, error.message);
    }
    if (error || !row) {
      return next;
    }
    const lead = crmLeadRow(row);
    next = withCrmStatus(next, lead.status, crmRecallDay(lead));
    const crmChangedAfterLead =
      Date.parse(lead.updated_at || "") > Date.parse(lastLead.at || "");
    if (crmChangedAfterLead || isLockedCrmStatus(lead.status) || isCrmRelanceHold(lead)) {
      if (isCrmRelanceHeld(lead) && crmHold) {
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
    if (!updateError) {
      const updated = { ...lead, ...patch };
      next = withCrmStatus(next, updated.status, crmRecallDay(updated));
      rememberCrmLead(crmHold, updated);
      if (crmHold && isCrmRelanceHeld(updated)) {
        for (const key of leadRelanceKeys(lead)) {
          crmHold.add(key);
        }
      }
    }
  } catch {
    return next;
  }

  return next;
}

function rememberCrmLead(crmHold, row) {
  const index = crmHold ? crmLeadIndexes.get(crmHold) : null;
  if (!index || !row?.id) {
    return;
  }
  index.byId.set(String(row.id), row);
  if (row.client_id) {
    index.byClient.set(String(row.client_id), row);
  }
  const phone = last9(row.phone);
  if (phone.length === 9) {
    index.byPhone.set(phone, row);
  }
}

function conversationOnRelanceHold(conversation, hold) {
  if (
    /reviendra vers nous|pas int[eé]ress|hors[- ]?zone|intraitable|contre[- ]?indication|revue sant[eé]/i.test(
      String(conversation?.status || ""),
    )
  ) {
    return true;
  }
  if (!hold) {
    return false;
  }
  if (conversation?.leadId && hold.has(`id:${conversation.leadId}`)) {
    return true;
  }
  const lead = crmLeadFor(conversation, hold);
  if (lead) {
    return isCrmRelanceHeld(lead, crmLeadIndexes.get(hold)?.now);
  }
  const phone = last9(conversation?.phone);
  return Boolean(phone && hold.has(`phone:${phone}`));
}

module.exports = {
  WA_SENT_STATUS,
  conversationHasSentSeyaMessage,
  conversationOnRelanceHold,
  crmRecallDayFor,
  isCrmRelanceHeld,
  isCrmRelanceHold,
  loadRelanceHoldKeys,
  markLeadWhatsAppSent,
  markMessagedNouveauLeads,
  syncCrmFromConversation,
  withCrmSnapshot,
};
