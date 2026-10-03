function emptyAccount(user = {}) {
  const firstName = String(user.firstName || "").trim();
  const lastName = String(user.lastName || "").trim();
  const email = String(user.email || "").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return {
    firstName,
    lastName,
    email,
    displayName: displayName || email || "Mon compte",
    upcoming: [],
    past: [],
    centers: [],
    threads: [],
    loyalty: { points: 0, notes: [] },
  };
}

function appointmentStatusLabel(status) {
  const values = {
    confirmed: "Confirmé",
    to_confirm: "À confirmer",
    in_progress: "En cours",
    done: "Terminé",
    present: "Présent",
    cancelled: "Annulation",
    no_show: "No show",
    quote: "Devis",
    sold: "Vendu",
  };
  return values[String(status || "")] || "À confirmer";
}

function isCancelledStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "cancelled" || value === "annulation";
}

function isPastAppointment(row, now = new Date()) {
  const date = String(row?.appointment_date || "").slice(0, 10);
  const time = String(row?.starts_at || "00:00").slice(0, 5);
  if (!date) {
    return false;
  }
  const stamp = Date.parse(`${date}T${time}:00`);
  if (!Number.isFinite(stamp)) {
    return date < now.toISOString().slice(0, 10);
  }
  return stamp < now.getTime();
}

function formatSlot(date, time) {
  const day = String(date || "").slice(0, 10);
  const clock = String(time || "").slice(0, 5);
  const stamp = Date.parse(`${day}T${clock || "12:00"}:00`);
  if (!Number.isFinite(stamp)) {
    return [day, clock].filter(Boolean).join(" ");
  }
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(stamp));
  return clock ? `${label} · ${clock}` : label;
}

function canMessageCenter(account, centerId) {
  const id = String(centerId || "").trim();
  if (!id) {
    return false;
  }
  return (account?.centers || []).some((center) => center.id === id);
}

function clientMessageNotification(row) {
  const name = String(row?.clientName || "Une cliente").trim() || "Une cliente";
  const body = String(row?.body || "").replace(/\s+/g, " ").trim();
  return {
    id: `client-message-${row.id}`,
    kind: "client_message",
    title: "Message cliente Bookea",
    body: body ? `${name} : ${body}` : `${name} vous a écrit.`,
    href: "/dashboard/seya-crm",
    createdAt: row.createdAt,
    unread: true,
  };
}

module.exports = {
  appointmentStatusLabel,
  canMessageCenter,
  clientMessageNotification,
  emptyAccount,
  formatSlot,
  isCancelledStatus,
  isPastAppointment,
};
