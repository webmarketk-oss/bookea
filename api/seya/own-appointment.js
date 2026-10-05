function slotDate(value) {
  return String(value || "").slice(0, 10);
}

function slotTime(value) {
  return String(value || "").slice(0, 5);
}

function isActiveAppointment(row) {
  if (!row) {
    return false;
  }
  if (row.cancelled_at) {
    return false;
  }
  return !/annul|cancel/i.test(String(row.status || ""));
}

function sameOwner(row, context) {
  const leadId = String(context?.leadId || "");
  const clientId = String(context?.clientId || "");
  return (
    (leadId && String(row.lead_id || "") === leadId) ||
    (clientId && String(row.client_id || "") === clientId)
  );
}

function findOwnSeyaAppointment(rows, context, conversation) {
  const list = (Array.isArray(rows) ? rows : []).filter(isActiveAppointment);
  const booked = conversation?.bookedSlot;
  const bookedDate = slotDate(booked?.date);
  const bookedTime = slotTime(booked?.time);

  if (bookedDate && bookedTime) {
    const sameSlot = list.filter(
      (row) =>
        slotDate(row.appointment_date) === bookedDate &&
        slotTime(row.starts_at) === bookedTime,
    );
    const owned = sameSlot.find((row) => sameOwner(row, context));
    if (owned) {
      return owned;
    }
    const seyaNoted = sameSlot.find((row) => /seya/i.test(String(row.notes || "")));
    if (seyaNoted) {
      return seyaNoted;
    }
    if (sameSlot.length === 1) {
      return sameSlot[0];
    }
  }

  const owned = list.filter((row) => sameOwner(row, context));
  if (bookedDate) {
    const sameDay = owned.find((row) => slotDate(row.appointment_date) === bookedDate);
    if (sameDay) {
      return sameDay;
    }
  }
  if (owned.length === 1) {
    return owned[0];
  }
  return owned[0] || null;
}

module.exports = {
  findOwnSeyaAppointment,
  slotDate,
  slotTime,
  isActiveAppointment,
};
