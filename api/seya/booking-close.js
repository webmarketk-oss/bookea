const { last9Phone } = require("./conversation-key");

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
  return (
    conversation?.bookingState?.appointmentStatus === "confirmed" ||
    Boolean(conversation?.bookedSlot)
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
  closeConversationsForBooking,
  conversationHasStaffBooking,
  conversationMatchesBookedVisit,
  matchesBookedLead,
};
