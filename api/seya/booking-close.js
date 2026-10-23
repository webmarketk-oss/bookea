const { last9Phone } = require("./conversation-key");
const { threadHasConfirmedVisit } = require("./conversation");

function matchesBookedLead(conversation, match) {
  const leadId = String(match?.leadId || "").trim();
  const conversationLead = String(conversation?.leadId || "").trim();
  if (leadId && conversationLead && leadId === conversationLead) {
    return true;
  }
  const phoneA = last9Phone(conversation?.phone);
  const phoneB = last9Phone(match?.phone);
  return phoneA.length >= 9 && phoneA === phoneB;
}

function bookedSlotFromAppointment(appointment) {
  const date = String(appointment?.date || "").slice(0, 10);
  const time = String(appointment?.start || appointment?.time || "").slice(0, 5);
  if (!date || !time) {
    return null;
  }
  return {
    date,
    time,
    label: `${date} à ${time.replace(":", "h")}`,
  };
}

function closeConversationsForBooking(conversations, match, appointment) {
  const slot = bookedSlotFromAppointment(appointment);
  return (Array.isArray(conversations) ? conversations : []).map((item) => {
    if (!item || !matchesBookedLead(item, match)) {
      return item;
    }
    return {
      ...item,
      status: "RDV confirmé",
      bookedSlot: slot || item.bookedSlot,
      proposedSlots: [],
      bookingState: {
        ...(item.bookingState || {}),
        appointmentStatus: "confirmed",
        pendingQuestion: null,
        lastOfferedSlots: [],
      },
      updatedAt: new Date().toISOString(),
    };
  });
}

function conversationHasStaffBooking(conversation) {
  const status = String(conversation?.status || "");
  return (
    conversation?.bookingState?.appointmentStatus === "confirmed" ||
    Boolean(conversation?.bookedSlot) ||
    /rdv pris|rdv confirm|terminé|termine/i.test(status) ||
    threadHasConfirmedVisit(conversation)
  );
}

function sealConfirmedConversation(conversation) {
  const status = String(conversation?.status || "");
  const alreadyClosed = /rdv pris|rdv confirm|terminé|termine/i.test(status);
  const alreadyFlagged =
    conversation?.bookingState?.appointmentStatus === "confirmed" ||
    Boolean(conversation?.bookedSlot);
  if (alreadyClosed && alreadyFlagged) {
    return conversation;
  }
  return {
    ...conversation,
    status: /terminé|termine/i.test(status) ? conversation.status : "RDV confirmé",
    proposedSlots: [],
    bookingState: {
      ...(conversation.bookingState || {}),
      appointmentStatus: "confirmed",
      pendingQuestion: null,
      lastOfferedSlots: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

// Mêmes libellés et alias que lib/lead-statuses.ts (vérifié par crm-sync.test.js).
const CRM_LEAD_STATUSES = [
  "Nouveau",
  "Apl en abs",
  "Pas intéressé",
  "Reviendra vers nous",
  "En réflexion",
  "À relancer",
  "RDV pris",
  "RDV confirmé",
  "No show",
  "Annulation",
  "Client converti",
  "Acompte envoyé",
  "Acompte reçu",
  "Acompte en attente",
  "Devis",
  "Vendu",
  "Prospect perdu",
  "Intraitable",
  "Numéro invalide",
  "Doublon",
  "Hors zone",
  "Message WhatsApp envoyé",
  "SMS envoyé",
  "Message vocal envoyé",
  "Msg vocal laissé + SMS envoyé",
  "Mail envoyé",
  "Mail/SMS Injoignable",
  "Message vocal",
];

const CRM_STATUS_ALIASES = {
  PI: "Pas intéressé",
  "Pas intéressé": "Pas intéressé",
  "À rappeler": "À relancer",
  "A rappeler": "À relancer",
  "Souhaite être rappelé(e) plus tard": "À relancer",
  "À relancer": "À relancer",
  "RDV fixé": "RDV pris",
  "RDV programmé": "RDV pris",
  "Acompte validé": "Acompte reçu",
  Client: "Client converti",
  Perdu: "Prospect perdu",
  "msg WA envoyé": "Message WhatsApp envoyé",
  "Msg WA envoyé": "Message WhatsApp envoyé",
  "Message vocal laissé": "Message vocal envoyé",
  "Msg vocal laissé": "Message vocal envoyé",
  "Msg vocal laissé + SMS envoyé": "Msg vocal laissé + SMS envoyé",
  "msg vocal laisser + sms envoyer": "Msg vocal laissé + SMS envoyé",
  "Message vocal laissé + SMS envoyé": "Msg vocal laissé + SMS envoyé",
  "Msg vocal + Mail": "Message vocal",
  "Message vocal + Mail": "Message vocal",
};

function crmStatusLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Nouveau";
  }
  if (CRM_LEAD_STATUSES.includes(raw)) {
    return raw;
  }
  if (CRM_STATUS_ALIASES[raw]) {
    return CRM_STATUS_ALIASES[raw];
  }
  const lower = raw.toLowerCase();
  const alias = Object.keys(CRM_STATUS_ALIASES).find((key) => key.toLowerCase() === lower);
  if (alias) {
    return CRM_STATUS_ALIASES[alias];
  }
  return CRM_LEAD_STATUSES.find((status) => status.toLowerCase() === lower) || "Nouveau";
}

function withCrmStatus(conversation, crmStatus, recallDate) {
  if (!conversation || typeof conversation !== "object") {
    return conversation;
  }
  const status = crmStatusLabel(crmStatus);
  const day = String(recallDate || "").trim().slice(0, 10);
  const recall = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  if (conversation.crmStatus === status && (conversation.crmRecallDate || null) === recall) {
    return conversation;
  }
  return {
    ...conversation,
    crmStatus: status,
    crmRecallDate: recall,
    crmSyncedAt: new Date().toISOString(),
  };
}

function syncConversationsCrmStatus(conversations, match, crmStatus, recallDate) {
  return (Array.isArray(conversations) ? conversations : []).map((item) =>
    item && matchesBookedLead(item, match)
      ? closeConversationForCrmStatus(withCrmStatus(item, crmStatus, recallDate), crmStatus)
      : item,
  );
}

function seyaStatusForCrmStatus(crmStatus) {
  const value = crmStatusLabel(crmStatus).toLowerCase();
  if (/^hors[- ]?zone$/.test(value)) {
    return "Hors zone";
  }
  if (/^(pas int[eé]ress[eé]|prospect perdu|intraitable)$/.test(value)) {
    return "Pas intéressé";
  }
  return null;
}

function closeConversationForCrmStatus(conversation, crmStatus) {
  const status = seyaStatusForCrmStatus(crmStatus);
  if (
    !conversation ||
    !status ||
    conversation.status === status ||
    conversationHasStaffBooking(conversation)
  ) {
    return conversation;
  }
  return {
    ...conversation,
    status,
    welcomeSendAt: null,
    proposedSlots: [],
    bookingState: {
      ...(conversation.bookingState || {}),
      pendingQuestion: null,
      lastOfferedSlots: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

function closeConversationsForCrmStatus(conversations, match, crmStatus) {
  return (Array.isArray(conversations) ? conversations : []).map((item) =>
    item && matchesBookedLead(item, match)
      ? closeConversationForCrmStatus(item, crmStatus)
      : item,
  );
}

function bookedVisitKeysFromAppointments(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    const status = String(row?.status || "").toLowerCase();
    if (status === "cancelled" || status === "no_show") {
      continue;
    }
    const leadId = String(row?.lead_id || "").trim();
    if (leadId) {
      keys.add(`lead:${leadId}`);
    }
    const client = Array.isArray(row?.clients) ? row.clients[0] : row?.clients;
    const phone = last9Phone(client?.phone);
    if (phone.length >= 9) {
      keys.add(`phone:${phone}`);
    }
  }
  return keys;
}

function conversationMatchesBookedVisit(conversation, bookedKeys) {
  if (!bookedKeys || typeof bookedKeys.has !== "function") {
    return false;
  }
  const leadId = String(conversation?.leadId || "").trim();
  if (leadId && bookedKeys.has(`lead:${leadId}`)) {
    return true;
  }
  const phone = last9Phone(conversation?.phone);
  return phone.length >= 9 && bookedKeys.has(`phone:${phone}`);
}

module.exports = {
  bookedSlotFromAppointment,
  bookedVisitKeysFromAppointments,
  closeConversationForCrmStatus,
  closeConversationsForBooking,
  closeConversationsForCrmStatus,
  conversationHasStaffBooking,
  conversationMatchesBookedVisit,
  crmStatusLabel,
  CRM_LEAD_STATUSES,
  CRM_STATUS_ALIASES,
  matchesBookedLead,
  sealConfirmedConversation,
  seyaStatusForCrmStatus,
  syncConversationsCrmStatus,
  withCrmStatus,
};
