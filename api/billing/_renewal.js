const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_REMINDER_DAYS = 3;
const RENEWAL_NOTICES_LIMIT = 60;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function parisDay(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function addMonths(from, months) {
  const next = new Date(from.getTime());
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < day) {
    next.setDate(0);
  }
  return next;
}

function toTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : null;
}

function daysUntilRenewal(renewsAt, now = new Date()) {
  const end = toTime(renewsAt);
  if (end == null) {
    return null;
  }
  const today = Date.parse(`${parisDay(now)}T00:00:00Z`);
  const due = Date.parse(`${parisDay(new Date(end))}T00:00:00Z`);
  return Math.round((due - today) / DAY_MS);
}

function renewalStage(renewsAt, now = new Date()) {
  const days = daysUntilRenewal(renewsAt, now);
  if (days == null || days > RENEWAL_REMINDER_DAYS) {
    return null;
  }
  if (days < 0) {
    return "expired";
  }
  return days === 0 ? "due_today" : "due_soon";
}

function currentPeriodStart(quota, now = new Date()) {
  const record = asRecord(quota);
  const end = toTime(record.renewsAt);
  if (end == null) {
    return toTime(record.subscribedAt);
  }
  let start = addMonths(new Date(end), -1);
  while (start.getTime() > now.getTime()) {
    start = addMonths(start, -1);
  }
  return start.getTime();
}

function conversationStartedAt(conversation) {
  const record = asRecord(conversation);
  const times = (Array.isArray(record.messages) ? record.messages : [])
    .map((message) => toTime(asRecord(message).at))
    .filter((time) => time != null);
  if (times.length > 0) {
    return Math.min(...times);
  }
  return toTime(record.updatedAt);
}

function periodConversationCount(conversations, quota, now = new Date()) {
  const list = Array.isArray(conversations) ? conversations : [];
  const start = currentPeriodStart(quota, now);
  if (start == null) {
    return list.length;
  }
  return list.filter((conversation) => {
    const startedAt = conversationStartedAt(conversation);
    return startedAt == null || startedAt >= start;
  }).length;
}

function nextRenewalPeriod(renewsAt, now = new Date()) {
  const end = toTime(renewsAt);
  const from = end != null && end > now.getTime() ? new Date(end) : now;
  return {
    renewedAt: now.toISOString(),
    renewsAt: addMonths(from, 1).toISOString(),
  };
}

function lastHistoryPrice(settings, kind, quantity) {
  const history = Array.isArray(asRecord(settings).offerHistory)
    ? asRecord(settings).offerHistory
    : [];
  const match = history
    .map(asRecord)
    .filter((item) => item.kind === kind && Number(item.quantity) === quantity)
    .sort(
      (left, right) =>
        (toTime(right.subscribedAt) || 0) - (toTime(left.subscribedAt) || 0),
    )[0];
  return Number(match?.amountEuros) || 0;
}

function renewableOffers(settings) {
  const record = asRecord(settings);
  const offers = [];
  const quota = asRecord(record.seyaQuota);
  const leads = Math.floor(Number(quota.packLeads ?? quota.conversationLimit));
  if (Number.isFinite(leads) && leads > 0 && toTime(quota.renewsAt) != null) {
    offers.push({
      offer: "seya",
      label: `pack WhatsApp Seya ${leads} conversations`,
      quantity: leads,
      price: lastHistoryPrice(record, "seya_pack", leads),
      renewsAt: String(quota.renewsAt),
    });
  }
  const plan = asRecord(record.bookeaPlan);
  if (plan.id === "crm-plus" && toTime(plan.renewsAt) != null) {
    offers.push({
      offer: "crm",
      label: "abonnement Bookea CRM + SMS",
      quantity: 1,
      price: Number(plan.price) || 0,
      renewsAt: String(plan.renewsAt),
    });
  }
  return offers;
}

function expiredAdminAlert({ centerName, offer, now = new Date() }) {
  const centre = String(centerName || "").trim() || "Centre Bookea";
  const day = formatRenewalDay(offer.renewsAt);
  return {
    id: crypto.randomUUID(),
    kind: "pack_expired",
    createdAt: now.toISOString(),
    readAt: null,
    title: `${centre} n’a pas renouvelé son ${offer.label}`,
    message:
      offer.offer === "seya"
        ? `Échéance dépassée le ${day}. Coupez Seya si le centre ne renouvelle pas.`
        : `Échéance dépassée le ${day}. À couper si le centre ne renouvelle pas.`,
    amountEuros: offer.price,
    quantity: offer.quantity,
    billingStatus: "to_invoice",
    offer: offer.offer,
  };
}

function renewalNoticeKey(offer, renewsAt, stage) {
  return `${offer}:${String(renewsAt).slice(0, 10)}:${stage}`;
}

function dueRenewalNotices(settings, now = new Date()) {
  const sent = new Set(
    Array.isArray(asRecord(settings).renewalNotices)
      ? asRecord(settings).renewalNotices.map(String)
      : [],
  );
  return renewableOffers(settings)
    .map((offer) => {
      const stage = renewalStage(offer.renewsAt, now);
      return stage
        ? { ...offer, stage, key: renewalNoticeKey(offer.offer, offer.renewsAt, stage) }
        : null;
    })
    .filter((item) => item && !sent.has(item.key));
}

function appendRenewalNotices(current, keys) {
  const list = Array.isArray(current) ? current.map(String) : [];
  return [...new Set([...list, ...keys])].slice(-RENEWAL_NOTICES_LIMIT);
}

function formatRenewalDay(renewsAt) {
  const time = toTime(renewsAt);
  if (time == null) {
    return "";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(time));
}

function renewalReminderCopy({ centerName, label, renewsAt, stage, tarifsUrl }) {
  const day = formatRenewalDay(renewsAt);
  const centre = String(centerName || "").trim() || "votre centre";
  const subject =
    stage === "due_today"
      ? `Bookea : votre ${label} arrive à échéance aujourd’hui`
      : `Bookea : votre ${label} se renouvelle le ${day}`;
  const text = [
    "Bonjour,",
    "",
    stage === "due_today"
      ? `Le ${label} de ${centre} arrive à échéance aujourd’hui (${day}).`
      : `Le ${label} de ${centre} arrive à échéance le ${day}.`,
    "",
    "Pour continuer sans interruption, renouvelez-le depuis Bookea : Tarifs → Offre actuelle → Renouveler.",
    tarifsUrl,
    "",
    "Sans renouvellement, le pack s’arrête à cette date.",
    "",
    "L’équipe Bookea",
  ].join("\n");
  return { subject, text };
}

module.exports = {
  RENEWAL_REMINDER_DAYS,
  addMonths,
  appendRenewalNotices,
  conversationStartedAt,
  currentPeriodStart,
  daysUntilRenewal,
  dueRenewalNotices,
  expiredAdminAlert,
  formatRenewalDay,
  nextRenewalPeriod,
  periodConversationCount,
  renewableOffers,
  renewalNoticeKey,
  renewalReminderCopy,
  renewalStage,
};
