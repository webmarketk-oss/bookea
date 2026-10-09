const {
  parseMailingMailbox,
  resolveCenterSender,
} = require("../mailing/mailbox-lib");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function centerNotifyEmails(center, seya) {
  const settings = asRecord(center?.settings);
  const publicCenter = asRecord(asRecord(settings.public).center);
  const storedCenter = asRecord(settings.center);
  const profile = asRecord(seya?.centerProfile);
  const mailbox = parseMailingMailbox(settings);
  const seen = new Set();
  const emails = [];
  for (const raw of [
    profile.supportEmail,
    mailbox.email,
    center?.email,
    publicCenter.email,
    storedCenter.email,
  ]) {
    const email = String(raw || "").trim().toLowerCase();
    if (!isValidEmail(email) || seen.has(email)) {
      continue;
    }
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function personLabel(conversation) {
  return (
    [conversation?.firstName, conversation?.lastName]
      .map((item) => String(item || "").trim())
      .filter((item) => item && !/^(bonjour|hello|hi)$/i.test(item))
      .join(" ") || "Prospect"
  );
}

function careLabel(conversation) {
  return (
    String(
      conversation?.qualification?.need ||
        conversation?.treatment ||
        conversation?.offerLabel ||
        "",
    ).trim() || "soin"
  );
}

function slotLabel(slot) {
  if (!slot) {
    return "";
  }
  if (String(slot.label || "").trim()) {
    return String(slot.label).trim();
  }
  const date = String(slot.date || "").slice(0, 10);
  const time = String(slot.time || "").slice(0, 5).replace(":", "h");
  return [date, time].filter(Boolean).join(" à ");
}

function notifyKey(kind, slot) {
  return `${kind}:${String(slot?.date || "").slice(0, 10)}|${String(slot?.time || "").slice(0, 5)}`;
}

function centerNotifyCopy({ kind, centerName, conversation, slot }) {
  const name = personLabel(conversation);
  const phone = String(conversation?.phone || "").trim() || "non renseigné";
  const care = careLabel(conversation);
  const when = slotLabel(slot) || "horaire à confirmer";
  const centre = String(centerName || "").trim() || "le centre";

  if (kind === "booked") {
    return {
      subject: `Seya : RDV posé — ${name}`,
      text: [
        `Seya vient de poser un rendez-vous pour ${centre}.`,
        "",
        `Prospect : ${name}`,
        `Téléphone : ${phone}`,
        `Soin : ${care}`,
        `Créneau : ${when}`,
        "",
        "Le rendez-vous est dans l’agenda Bookea.",
      ].join("\n"),
    };
  }

  return {
    subject: `Seya : à rappeler — ${name}`,
    text: [
      `Seya a qualifié un prospect. Une opératrice doit le rappeler pour ${centre}.`,
      "",
      `Prospect : ${name}`,
      `Téléphone : ${phone}`,
      `Soin : ${care}`,
      `Rappel convenu : ${when}`,
      "",
      "Aucun rendez-vous n’a été posé dans l’agenda.",
    ].join("\n"),
  };
}

function defaultSenderEmail() {
  return String(
    process.env.BREVO_EMAIL_SENDER || process.env.BREVO_FROM_EMAIL || "",
  )
    .trim()
    .toLowerCase();
}

function centerNotifySender(center, seya) {
  const mailing = resolveCenterSender(center);
  if (mailing.mailboxConnected && isValidEmail(mailing.email)) {
    return mailing.email;
  }
  const fromEnv = defaultSenderEmail();
  if (isValidEmail(fromEnv)) {
    return fromEnv;
  }
  return centerNotifyEmails(center, seya)[0] || "";
}

function notifyMailStatus(center, seya) {
  const recipients = centerNotifyEmails(center, seya);
  const sender = centerNotifySender(center, seya);
  const missingBrevo = !process.env.BREVO_API_KEY;
  const missingRecipient = recipients.length === 0;
  const missingSender = !isValidEmail(sender);
  return {
    ready: !missingBrevo && !missingRecipient && !missingSender,
    recipients,
    sender,
    missingBrevo,
    missingRecipient,
    missingSender,
  };
}

function toHtml(text) {
  const body = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br />");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px"><p style="margin:0">${body}</p></div>`;
}

async function sendBrevoToCenter({ to, subject, text, centerName, senderEmail }) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = isValidEmail(senderEmail) ? senderEmail : defaultSenderEmail();
  if (!apiKey) {
    return { sent: false, reason: "missing_brevo" };
  }
  if (!isValidEmail(from)) {
    return { sent: false, reason: "missing_sender" };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: from,
        name: String(centerName || "Bookea Seya").slice(0, 70),
      },
      to: [{ email: to }],
      subject: String(subject || "").slice(0, 200),
      textContent: text,
      htmlContent: toHtml(text),
      tags: ["bookea-seya-center"],
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || `brevo_${response.status}`);
  }
  return { sent: true, to };
}

async function notifyCenterSeyaAction({
  center,
  seya,
  conversation,
  kind,
  slot,
} = {}) {
  if (kind !== "booked" && kind !== "callback") {
    return { sent: false, reason: "unknown_kind", conversation };
  }
  const key = notifyKey(kind, slot);
  if (conversation?.centerNotifyKey === key) {
    return { sent: false, reason: "already", conversation };
  }
  const emails = centerNotifyEmails(center, seya);
  if (!emails.length) {
    console.error("[seya/notify] no center email", center?.id);
    return { sent: false, reason: "no_email", conversation };
  }
  const senderEmail = centerNotifySender(center, seya);
  if (!process.env.BREVO_API_KEY) {
    return { sent: false, reason: "missing_brevo", conversation };
  }
  if (!isValidEmail(senderEmail)) {
    return { sent: false, reason: "missing_sender", conversation };
  }
  const copy = centerNotifyCopy({
    kind,
    centerName: center?.name,
    conversation,
    slot,
  });
  const results = [];
  for (const email of emails) {
    try {
      results.push(await sendBrevoToCenter({
        to: email,
        subject: copy.subject,
        text: copy.text,
        centerName: center?.name,
        senderEmail,
      }));
    } catch (error) {
      console.error("[seya/notify]", email, error);
      results.push({ sent: false, to: email, error: String(error?.message || error) });
    }
  }
  const sent = results.some((item) => item.sent);
  return {
    sent,
    reason: sent ? "sent" : "send_failed",
    conversation: sent ? { ...conversation, centerNotifyKey: key } : conversation,
    results,
  };
}

async function sendCenterNotifyTest({ center, seya } = {}) {
  const emails = centerNotifyEmails(center, seya);
  if (!emails.length) {
    return { sent: false, reason: "no_email", recipients: [] };
  }
  const senderEmail = centerNotifySender(center, seya);
  if (!process.env.BREVO_API_KEY) {
    return { sent: false, reason: "missing_brevo", recipients: emails, sender: senderEmail };
  }
  if (!isValidEmail(senderEmail)) {
    return { sent: false, reason: "missing_sender", recipients: emails, sender: senderEmail };
  }
  const centre = String(center?.name || "").trim() || "le centre";
  const copy = {
    subject: `Seya : test de notification — ${centre}`,
    text: [
      "Ceci est un test.",
      "",
      `Quand Seya pose un rendez-vous, ou quand une opératrice doit rappeler, ${centre} reçoit un mail comme celui-ci.`,
      "",
      `Destinataire : ${emails.join(", ")}`,
    ].join("\n"),
  };
  const results = [];
  for (const email of emails) {
    try {
      results.push(await sendBrevoToCenter({
        to: email,
        subject: copy.subject,
        text: copy.text,
        centerName: center?.name,
        senderEmail,
      }));
    } catch (error) {
      console.error("[seya/notify] test", email, error);
      results.push({ sent: false, to: email, error: String(error?.message || error) });
    }
  }
  const sent = results.some((item) => item.sent);
  return {
    sent,
    reason: sent ? "sent" : "send_failed",
    recipients: emails,
    sender: senderEmail,
    results,
  };
}

function callbackNotifySlot(conversation) {
  return conversation?.bookingState?.callbackSlot || null;
}

module.exports = {
  callbackNotifySlot,
  centerNotifyCopy,
  centerNotifyEmails,
  centerNotifySender,
  notifyCenterSeyaAction,
  notifyKey,
  notifyMailStatus,
  sendCenterNotifyTest,
};
