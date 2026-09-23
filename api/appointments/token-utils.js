const crypto = require("crypto");

const CLIENT_CONFIRMED = "confirmed par le client";
const CLIENT_CANCELLED = "annuler";

function createConfirmationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashConfirmationToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function appointmentSlot(date, startsAt) {
  return `${String(date || "").slice(0, 10)}|${String(startsAt || "").slice(0, 5)}`;
}

function parisDateOf(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

function confirmationExpiresAt(appointmentDate) {
  const dateYmd = String(appointmentDate || "").slice(0, 10);
  const start = Date.parse(`${dateYmd}T20:00:00.000Z`);

  if (!dateYmd || Number.isNaN(start)) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  for (let minutes = 0; minutes <= 12 * 60; minutes += 15) {
    const instant = new Date(start + minutes * 60 * 1000);
    if (parisDateOf(instant) > dateYmd) {
      return instant.toISOString();
    }
  }

  return `${dateYmd}T22:59:59.000Z`;
}

function isConfirmationExpired(row, now = new Date()) {
  const appointmentDate = String(row?.appointment_date || "").slice(0, 10);
  if (appointmentDate && parisDateOf(now) > appointmentDate) {
    return true;
  }

  const expiresAt = row?.confirmation_token_expires_at
    ? new Date(row.confirmation_token_expires_at)
    : null;

  return Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime());
}

function isCancelledRow(row) {
  return Boolean(
    row?.cancelled_at ||
      row?.status === "cancelled" ||
      row?.client_response === CLIENT_CANCELLED,
  );
}

function isClientConfirmedRow(row) {
  return Boolean(row?.confirmed_at || row?.client_response === CLIENT_CONFIRMED);
}

function readConfirmationState(row, now = new Date()) {
  if (!row) {
    return "invalid";
  }

  if (isCancelledRow(row)) {
    return "cancelled";
  }

  if (isClientConfirmedRow(row)) {
    return "confirmed";
  }

  if (isConfirmationExpired(row, now)) {
    return "expired";
  }

  const currentSlot = appointmentSlot(row.appointment_date, row.starts_at);
  if (row.confirmation_token_slot && row.confirmation_token_slot !== currentSlot) {
    return "moved";
  }

  return "pending";
}

function publicSiteUrl() {
  return String(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://www.bookeai.fr",
  ).replace(/\/+$/, "");
}

function confirmationUrlForToken(token) {
  return `${publicSiteUrl()}/r/${encodeURIComponent(token)}`;
}

function confirmationSmsLinkForToken(token) {
  return confirmationUrlForToken(token);
}

function formatPublicAppointmentDate(dateYmd) {
  const date = new Date(`${String(dateYmd || "").slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(dateYmd || "");
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function appendStatusHistory(history, entry) {
  const current = Array.isArray(history) ? history : [];
  return [...current, entry].slice(-30);
}

function stateMessage(state) {
  switch (state) {
    case "confirmed":
      return "Votre rendez-vous est confirmé. Nous avons hâte de vous accueillir !";
    case "rescheduled":
      return "Votre rendez-vous a bien été déplacé. Nous avons hâte de vous accueillir !";
    case "cancelled":
      return "Votre rendez-vous a bien été annulé. Vous pouvez contacter le centre si vous souhaitez choisir un nouveau créneau.";
    case "expired":
      return "Ce lien n’est plus valable : la date du rendez-vous est passée.";
    case "moved":
      return "Ce rendez-vous a été déplacé ou n’est plus disponible. Contactez le centre pour convenir d’un nouveau créneau.";
    case "invalid":
      return "Ce lien n’est pas valide. Vérifiez le SMS reçu ou contactez le centre.";
    case "error":
      return "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.";
    default:
      return "";
  }
}

module.exports = {
  CLIENT_CANCELLED,
  CLIENT_CONFIRMED,
  appendStatusHistory,
  appointmentSlot,
  confirmationExpiresAt,
  confirmationSmsLinkForToken,
  confirmationUrlForToken,
  createConfirmationToken,
  formatPublicAppointmentDate,
  hashConfirmationToken,
  isCancelledRow,
  isClientConfirmedRow,
  isConfirmationExpired,
  parisDateOf,
  publicSiteUrl,
  readConfirmationState,
  stateMessage,
};
