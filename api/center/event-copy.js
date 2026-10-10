function personLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || "Cliente";
}

function treatmentLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || "Soin";
}

function formatEventWhen(date, time) {
  const day = String(date || "").slice(0, 10);
  const clock = String(time || "").slice(0, 5);
  const stamp = Date.parse(`${day}T${clock || "12:00"}:00`);
  if (Number.isNaN(stamp)) {
    return [day, clock].filter(Boolean).join(" à ");
  }
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(stamp));
  if (!clock) {
    return label;
  }
  return `${label} à ${clock.replace(":", "h")}`;
}

function formatShortEventWhen(date, time) {
  const day = String(date || "").slice(0, 10);
  const clock = String(time || "").slice(0, 5);
  const stamp = Date.parse(`${day}T${clock || "12:00"}:00`);
  if (Number.isNaN(stamp)) {
    return [day, clock].filter(Boolean).join(" à ");
  }
  const label = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(stamp));
  return clock ? `${label} à ${clock}` : label;
}

function parseHistorySlot(value) {
  const [date, time] = String(value || "").split("|");
  if (!date) {
    return null;
  }
  return {
    date: date.slice(0, 10),
    time: String(time || "").slice(0, 5),
  };
}

function notificationVia(source) {
  const value = String(source || "").toLowerCase();
  if (
    value === "client_link" ||
    value === "sms_link" ||
    value === "sms"
  ) {
    return "lien SMS";
  }
  return "Bookea Client";
}

function eventNotifyKey(kind, extra) {
  return [
    kind,
    String(extra?.id || extra?.appointmentId || extra?.messageId || ""),
    String(extra?.date || "").slice(0, 10),
    String(extra?.time || "").slice(0, 5),
  ]
    .filter(Boolean)
    .join(":");
}

function alreadyNotified(history, key) {
  const wanted = String(key || "");
  if (!wanted) {
    return false;
  }
  return (Array.isArray(history) ? history : []).some(
    (entry) =>
      entry &&
      entry.action === "center_notify" &&
      String(entry.to || "") === wanted,
  );
}

function appointmentEventCopy({
  kind,
  via,
  personName,
  treatment,
  when,
  previousWhen,
  centerName,
} = {}) {
  const name = personLabel(personName);
  const care = treatmentLabel(treatment);
  const slot = String(when || "").trim() || "horaire à confirmer";
  const previous = String(previousWhen || "").trim();
  const centre = String(centerName || "").trim() || "le centre";
  const channel = String(via || "Bookea Client").trim() || "Bookea Client";

  if (kind === "appointment_booked") {
    return {
      title: "Nouveau RDV en ligne",
      subject: `RDV en ligne — ${name}`,
      body: `${name} · ${care} · ${slot}`,
      text: [
        `Un rendez-vous a été pris depuis Bookea Client pour ${centre}.`,
        "",
        `Cliente : ${name}`,
        `Soin : ${care}`,
        `Créneau : ${slot}`,
        "",
        "Le rendez-vous est dans l’agenda Bookea.",
      ].join("\n"),
    };
  }

  if (kind === "appointment_moved") {
    return {
      title: "RDV déplacé",
      subject: `RDV déplacé — ${name}`,
      body: previous
        ? `${name} a déplacé ${care} du ${previous} au ${slot} (${channel}).`
        : `${name} a déplacé ${care} au ${slot} (${channel}).`,
      text: [
        `${name} a déplacé son rendez-vous via ${channel === "lien SMS" ? "le lien SMS de confirmation" : "Bookea Client"}.`,
        "",
        `Cliente : ${name}`,
        `Soin : ${care}`,
        previous ? `Ancien créneau : ${previous}` : "",
        `Nouveau créneau : ${slot}`,
        "",
        "Le rendez-vous mis à jour est dans l’agenda Bookea.",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    };
  }

  return {
    title: "RDV annulé",
    subject: `RDV annulé — ${name}`,
    body: `${name} a annulé ${care} du ${slot} (${channel}).`,
    text: [
      `${name} a annulé son rendez-vous via ${channel === "lien SMS" ? "le lien SMS de confirmation" : "Bookea Client"}.`,
      "",
      `Cliente : ${name}`,
      `Soin : ${care}`,
      `Rendez-vous annulé : ${slot}`,
    ].join("\n"),
  };
}

function messageEventCopy({
  personName,
  preview,
  conversationUrl,
  centerName,
} = {}) {
  const name = personLabel(personName);
  const centre = String(centerName || "").trim() || "le centre";
  const snippet = String(preview || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  const url = String(conversationUrl || "").trim();
  return {
    title: "Message cliente Bookea",
    subject: `Nouveau message — ${name}`,
    body: snippet ? `${name} : ${snippet}` : `${name} vous a écrit.`,
    href: url ? url.replace(/^https?:\/\/[^/]+/, "") : "/dashboard/messagerie",
    text: [
      `${name} vous a écrit dans la messagerie Bookea de ${centre}.`,
      "",
      snippet || "Ouvrez la conversation pour lire le message.",
      "",
      "Ouvrir la conversation :",
      url || "https://www.bookeai.fr/dashboard/messagerie",
    ].join("\n"),
  };
}

function conversationUrl(conversationId) {
  const id = String(conversationId || "").trim();
  const origin = String(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://www.bookeai.fr",
  ).replace(/\/+$/, "");
  if (!id) {
    return `${origin}/dashboard/messagerie`;
  }
  return `${origin}/dashboard/messagerie?conversation=${encodeURIComponent(id)}`;
}

module.exports = {
  alreadyNotified,
  appointmentEventCopy,
  conversationUrl,
  eventNotifyKey,
  formatEventWhen,
  formatShortEventWhen,
  messageEventCopy,
  notificationVia,
  parseHistorySlot,
  personLabel,
  treatmentLabel,
};
