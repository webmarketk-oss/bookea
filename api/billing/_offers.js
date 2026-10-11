const { nextRenewalPeriod } = require("./_renewal");

const BREVO_SMS_FRANCE_UNIT = 0.045;
const SMS_PACK_QUANTITIES = [30, 50, 100, 200, 300, 800];
const CRM_PLUS_PRICE = 49;
const ADMIN_ALERTS_LIMIT = 200;
const OFFER_HISTORY_LIMIT = 200;

const WHATSAPP_LEAD_PACKS = [
  { leads: 100, price: 69.97 },
  { leads: 150, price: 99.97 },
  { leads: 200, price: 129.95 },
  { leads: 250, price: 159.95 },
  { leads: 300, price: 189.95 },
  { leads: 400, price: 249.92 },
  { leads: 500, price: 309.9 },
];

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function brevoUnitForQuantity(quantity) {
  if (quantity >= 800) return 0.038;
  if (quantity >= 300) return 0.04;
  if (quantity >= 200) return 0.042;
  return BREVO_SMS_FRANCE_UNIT;
}

function brevoSmsCost(quantity) {
  return Number((quantity * brevoUnitForQuantity(quantity)).toFixed(2));
}

function whatsappPackPrice(leads) {
  return WHATSAPP_LEAD_PACKS.find((pack) => pack.leads === leads)?.price ?? null;
}

function addOneMonth(from) {
  const next = new Date(from.getTime());
  const day = next.getDate();
  next.setMonth(next.getMonth() + 1);
  if (next.getDate() < day) {
    next.setDate(0);
  }
  return next;
}

function formatEuro(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOfferDate(value) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) {
    return "";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(time));
}

function positiveInt(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function currentSeyaLeads(settings) {
  const quota = asRecord(asRecord(settings).seyaQuota);
  return positiveInt(quota.packLeads) ?? positiveInt(quota.conversationLimit);
}

function currentBookeaPlan(settings) {
  const plan = asRecord(asRecord(settings).bookeaPlan);
  return plan.id === "crm-plus" && plan.subscribedAt ? plan : null;
}

function resolveOffer(settings, request) {
  const type = String(asRecord(request).type || "");
  if (type === "seya") {
    const leads = positiveInt(request.leads);
    const price = whatsappPackPrice(leads);
    return price == null
      ? null
      : { type, kind: "seya_pack", quantity: leads, price, label: `Pack WhatsApp ${leads} conversations Seya` };
  }
  if (type === "sms") {
    const quantity = positiveInt(request.quantity);
    return SMS_PACK_QUANTITIES.includes(quantity)
      ? { type, kind: "sms_pack", quantity, price: brevoSmsCost(quantity), label: `Pack SMS ${quantity} crédits` }
      : null;
  }
  if (type === "crm") {
    return { type, kind: "crm_pack", quantity: 1, price: CRM_PLUS_PRICE, label: "Bookea CRM + SMS" };
  }
  if (type === "renew_seya") {
    const leads = currentSeyaLeads(settings);
    const price = whatsappPackPrice(leads);
    return price == null
      ? null
      : { type, kind: "seya_pack", quantity: leads, price, label: `Renouvellement WhatsApp ${leads} conversations Seya` };
  }
  if (type === "renew_crm") {
    const plan = currentBookeaPlan(settings);
    return plan
      ? { type, kind: "crm_pack", quantity: 1, price: Number(plan.price) || CRM_PLUS_PRICE, label: "Renouvellement Bookea CRM + SMS" }
      : null;
  }
  return null;
}

function smsQuotaWithCredit(quota, quantity) {
  return {
    remaining: quota.remaining + quantity,
    lastGrantMonth: quota.lastGrantMonth,
    monthlyGrant: quota.monthlyGrant,
    usedThisMonth: quota.usedThisMonth,
  };
}

function applyPaidOffer(settings, input) {
  const { centerName, offer, alertId, readSmsQuota } = input;
  const now = input.now || new Date();
  const nowIso = now.toISOString();
  const current = asRecord(settings);
  const next = { ...current };
  let title;
  let message;
  let historyLabel;
  let subscribedAt = nowIso;
  let renewsAt = addOneMonth(now).toISOString();
  let alertOffer;

  if (offer.type === "seya" || offer.type === "renew_seya") {
    if (offer.type === "renew_seya") {
      const period = nextRenewalPeriod(asRecord(current.seyaQuota).renewsAt, now);
      subscribedAt = period.renewedAt;
      renewsAt = period.renewsAt;
      alertOffer = "seya";
    }
    next.seyaQuota = {
      conversationLimit: offer.quantity,
      packLeads: offer.quantity,
      subscribedAt,
      renewsAt,
      updatedAt: subscribedAt,
    };
    const verb = offer.type === "renew_seya" ? "renouvelé" : "souscrit";
    title = `${centerName} a ${verb} ${offer.quantity} conversations Seya`;
    message = `${title} — ${formatEuro(offer.price)}${
      offer.type === "renew_seya" ? ` — jusqu’au ${formatOfferDate(renewsAt)}` : ""
    }`;
    historyLabel = `WhatsApp ${offer.quantity} leads`;
  } else if (offer.type === "sms") {
    const sms = asRecord(current.sms);
    next.sms = { ...sms, quota: smsQuotaWithCredit(readSmsQuota(sms), offer.quantity) };
    title = `${centerName} a rechargé ${offer.quantity} SMS`;
    message = `${title} — ${formatEuro(offer.price)} — à recharger côté opérateur`;
    historyLabel = `${offer.quantity} SMS`;
    renewsAt = null;
  } else {
    const plan = currentBookeaPlan(current);
    if (offer.type === "renew_crm") {
      const period = nextRenewalPeriod(plan?.renewsAt, now);
      subscribedAt = period.renewedAt;
      renewsAt = period.renewsAt;
      alertOffer = "crm";
    }
    if (offer.type === "renew_crm" && plan) {
      next.bookeaPlan = { ...plan, subscribedAt, renewsAt };
    } else {
      next.bookeaPlan = {
        id: "crm-plus",
        title: "CRM + SMS",
        price: CRM_PLUS_PRICE,
        subscribedAt,
        renewsAt,
      };
    }
    const verb = offer.type === "renew_crm" ? "renouvelé" : "souscrit";
    title = `${centerName} a ${verb} Bookea CRM + SMS`;
    message = `${title} — ${offer.price} € / mois${
      offer.type === "renew_crm" ? ` — jusqu’au ${formatOfferDate(renewsAt)}` : ""
    }`;
    historyLabel = "Bookea CRM + SMS";
  }

  const alert = {
    id: alertId,
    kind: offer.kind,
    createdAt: nowIso,
    readAt: null,
    title,
    message,
    amountEuros: offer.price,
    quantity: offer.quantity,
    billingStatus: "to_invoice",
    ...(alertOffer ? { offer: alertOffer } : {}),
    autoInvoice: true,
    paidAt: nowIso,
  };
  next.adminAlerts = [alert, ...asArray(current.adminAlerts)].slice(0, ADMIN_ALERTS_LIMIT);
  next.offerHistory = [
    {
      id: alertId,
      kind: offer.kind,
      label: historyLabel,
      amountEuros: offer.price,
      quantity: offer.quantity,
      subscribedAt,
      renewsAt,
    },
    ...asArray(current.offerHistory),
  ].slice(0, OFFER_HISTORY_LIMIT);
  return { settings: next, alert };
}

module.exports = {
  BREVO_SMS_FRANCE_UNIT,
  CRM_PLUS_PRICE,
  SMS_PACK_QUANTITIES,
  WHATSAPP_LEAD_PACKS,
  applyPaidOffer,
  brevoSmsCost,
  resolveOffer,
  whatsappPackPrice,
};
