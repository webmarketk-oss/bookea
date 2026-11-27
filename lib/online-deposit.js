const HOLD_MS = 31 * 60 * 1000;
const BLOCKING_STATUSES = new Set([
  "confirmed",
  "to_confirm",
  "present",
  "in_progress",
  "done",
  "sold",
]);

function quoteDeposit(service) {
  if (!service || service.onQuote === true || service.depositEnabled === false) {
    return { cents: 0, mode: "none", priceCents: priceCents(service) };
  }
  const price = priceCents(service);
  const mode = service.depositMode === "percent" ? "percent" : "fixed";
  if (mode === "percent") {
    const percent = Math.min(100, Math.max(0, Number(service.depositPercent) || 0));
    return {
      cents: Math.round((price * percent) / 100),
      mode,
      percent,
      priceCents: price,
    };
  }
  const euros = Number(service.depositAmount) || 0;
  return {
    cents: Math.max(0, Math.round(euros * 100)),
    mode,
    priceCents: price,
  };
}

function priceCents(service) {
  return Math.max(0, Math.round((Number(service?.price) || 0) * 100));
}

function serviceHiddenFromPublic(settings, name) {
  const service = findPublicService(servicesFromSettings(settings), name);
  return Boolean(service && service.visible === false);
}

function findPublicService(services, name) {
  const key = String(name || "").trim().toLowerCase();
  return (
    (services || []).find(
      (service) => String(service?.name || "").trim().toLowerCase() === key,
    ) || null
  );
}

function servicesFromSettings(settings) {
  const publicSettings =
    settings && typeof settings.public === "object" ? settings.public : {};
  return Array.isArray(publicSettings.services) ? publicSettings.services : [];
}

function onlineQuote(settings, serviceName, chargesEnabled) {
  const service = findPublicService(servicesFromSettings(settings), serviceName);
  const quote = quoteDeposit(service);
  const online = chargesEnabled === true && quote.cents >= 50;
  return {
    ...quote,
    online,
    remainingCents: Math.max(0, quote.priceCents - quote.cents),
    serviceName: service?.name || String(serviceName || ""),
  };
}

function minutesOf(value) {
  const [hours, mins] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map((part) => Number(part) || 0);
  return hours * 60 + mins;
}

function readHold(notes) {
  const text = String(notes || "");
  const token = (key) => {
    const match = text.match(new RegExp(`${key}:([^\\s]+)`));
    return match ? match[1] : "";
  };
  return {
    bookingId: token("booking"),
    depositCents: Number(token("deposit_cents")) || 0,
    priceCents: Number(token("price_cents")) || 0,
    holdUntil: token("hold_until"),
    payment: token("payment"),
    sessionId: token("session"),
  };
}

function buildHoldNotes(input) {
  const parts = [
    "Réservation publique Bookea.",
    input.bookingId ? `booking:${input.bookingId}` : "",
    `deposit_cents:${Math.max(0, Math.round(Number(input.depositCents) || 0))}`,
    `price_cents:${Math.max(0, Math.round(Number(input.priceCents) || 0))}`,
    input.holdUntil ? `hold_until:${input.holdUntil}` : "",
    `payment:${input.payment || "pending"}`,
    input.sessionId ? `session:${input.sessionId}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function holdExpired(row, now) {
  const hold = readHold(row?.notes);
  if (hold.payment && hold.payment !== "pending") {
    return false;
  }
  if (!hold.holdUntil) {
    return false;
  }
  return new Date(hold.holdUntil).getTime() <= now.getTime();
}

function slotTaken(rows, candidate, now) {
  const start = minutesOf(candidate.start);
  const end = minutesOf(candidate.end);
  return (rows || []).some((row) => {
    if (candidate.ignoreId && row.id === candidate.ignoreId) {
      return false;
    }
    const date = String(row.appointment_date || row.date || "").slice(0, 10);
    if (date !== String(candidate.date || "").slice(0, 10)) {
      return false;
    }
    if (!BLOCKING_STATUSES.has(String(row.status || ""))) {
      return false;
    }
    if (holdExpired(row, now)) {
      return false;
    }
    const rowStart = minutesOf(row.starts_at || row.start);
    const rowEnd =
      minutesOf(row.ends_at || row.end) ||
      rowStart + Number(row.duration_minutes || row.duration || 0);
    return start < rowEnd && rowStart < end;
  });
}

function verifyPaidSession(input) {
  const session = input.session || {};
  const expected = input.expected || {};
  const reasons = [];
  if (session.payment_status !== "paid") {
    reasons.push("unpaid");
  }
  if (String(session.currency || "").toLowerCase() !== "eur") {
    reasons.push("currency");
  }
  if (Number(session.amount_total) !== Number(expected.cents)) {
    reasons.push("amount");
  }
  const metadata = session.metadata || {};
  if (expected.bookingId && metadata.booking_id !== expected.bookingId) {
    reasons.push("booking");
  }
  if (expected.centerId && metadata.center_id !== expected.centerId) {
    reasons.push("center");
  }
  if (
    input.connectedAccount &&
    input.account &&
    input.account !== input.connectedAccount
  ) {
    reasons.push("account");
  }
  if (input.connectedAccount && !input.account) {
    reasons.push("account");
  }
  return { ok: reasons.length === 0, reasons };
}

function paymentOutcome(input) {
  if (!input.verified) {
    return "reject";
  }
  if (input.alreadyReceived) {
    return "duplicate";
  }
  if (input.holdExpired && input.slotTakenByOther) {
    return "conflict";
  }
  return "confirm";
}

function checkoutParams(input) {
  return {
    mode: "payment",
    customer_email: input.email || undefined,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: input.expiresAt,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: input.cents,
          product_data: { name: `Acompte · ${input.serviceName || "Soin"}` },
        },
      },
    ],
    payment_intent_data: {
      metadata: {
        center_id: input.centerId,
        booking_id: input.bookingId,
        service_name: input.serviceName || "",
        customer_name: input.customerName || "",
      },
    },
    metadata: {
      center_id: input.centerId,
      booking_id: input.bookingId,
      service_name: input.serviceName || "",
    },
  };
}

function directChargeHasNoFee(params) {
  return (
    !params.payment_intent_data?.application_fee_amount &&
    !params.payment_intent_data?.transfer_data
  );
}

function euros(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

module.exports = {
  BLOCKING_STATUSES,
  HOLD_MS,
  buildHoldNotes,
  checkoutParams,
  directChargeHasNoFee,
  euros,
  findPublicService,
  serviceHiddenFromPublic,
  holdExpired,
  onlineQuote,
  paymentOutcome,
  quoteDeposit,
  readHold,
  servicesFromSettings,
  slotTaken,
  verifyPaidSession,
};
