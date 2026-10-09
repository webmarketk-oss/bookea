function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function parseMailingMailbox(settings) {
  const mailing = asRecord(asRecord(settings).mailing);
  const box = asRecord(mailing.mailbox);
  const email = String(box.email || "").trim().toLowerCase();
  const senderId = Number(box.senderId);
  return {
    email: isValidEmail(email) ? email : "",
    name: String(box.name || "").trim(),
    senderId: Number.isFinite(senderId) && senderId > 0 ? senderId : null,
    verified: box.verified === true,
    requestedAt: String(box.requestedAt || "").trim(),
  };
}

function mailingMailboxRecord(value) {
  const box = parseMailingMailbox({ mailing: { mailbox: value } });
  return {
    email: box.email,
    name: box.name,
    senderId: box.senderId,
    verified: box.verified,
    requestedAt: box.requestedAt,
  };
}

function mergeMailingMailbox(settings, mailbox) {
  const current = asRecord(settings);
  const mailing = asRecord(current.mailing);
  return {
    ...current,
    mailing: {
      ...mailing,
      mailbox: mailingMailboxRecord(mailbox),
    },
  };
}

function defaultSenderEmail() {
  return String(
    process.env.BREVO_EMAIL_SENDER || process.env.BREVO_FROM_EMAIL || "",
  )
    .trim()
    .toLowerCase();
}

function defaultSenderName(fallback = "Bookea") {
  return String(process.env.BREVO_EMAIL_SENDER_NAME || "").trim() || fallback;
}

function resolveCenterSender(center) {
  const mailbox = parseMailingMailbox(center?.settings);
  if (mailbox.verified && isValidEmail(mailbox.email)) {
    return {
      email: mailbox.email,
      name: mailbox.name || String(center?.name || "").trim() || "Bookea",
      mailboxConnected: true,
    };
  }
  const fallback =
    defaultSenderEmail() || String(center?.email || "").trim().toLowerCase();
  return {
    email: isValidEmail(fallback) ? fallback : "",
    name: defaultSenderName(String(center?.name || "").trim() || "Bookea"),
    mailboxConnected: false,
  };
}

function mailboxPublicStatus(center) {
  const mailbox = parseMailingMailbox(center?.settings);
  const sender = resolveCenterSender(center);
  return {
    brevoReady: Boolean(process.env.BREVO_API_KEY),
    connected: sender.mailboxConnected,
    pending: Boolean(mailbox.email && mailbox.senderId && !mailbox.verified),
    email: mailbox.email || sender.email || String(center?.email || "").trim().toLowerCase(),
    name: mailbox.name || sender.name,
    senderEmail: sender.email,
  };
}

function findBrevoSender(senders, email) {
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) {
    return null;
  }
  return (
    (Array.isArray(senders) ? senders : []).find(
      (item) => String(item?.email || "").trim().toLowerCase() === needle,
    ) || null
  );
}

module.exports = {
  findBrevoSender,
  isValidEmail,
  mailboxPublicStatus,
  mergeMailingMailbox,
  parseMailingMailbox,
  resolveCenterSender,
};
