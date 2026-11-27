const { appendStatusHistory } = require("../appointments/token-utils");
const {
  HOLD_MS,
  buildHoldNotes,
  checkoutParams,
  euros,
  holdExpired,
  onlineQuote,
  paymentOutcome,
  readHold,
  slotTaken,
  verifyPaidSession,
} = require("../../lib/online-deposit");
const {
  appBaseUrl,
  parseStoredStripe,
  stripeRequest,
} = require("./_stripe-lib");
const { notifyAppointmentEvent, notifyCenterEvent } = require("./event-notify");
const {
  alreadyNotified,
  appointmentEventCopy,
  eventNotifyKey,
  formatEventWhen,
} = require("./event-copy");
const { sendBrevoToCenter, resolveNotifySender } = require("../seya/center-notify");
const { readCenterSeya } = require("../seya/store");

function addMinutes(time, minutes) {
  const [hours, mins] = String(time || "00:00")
    .slice(0, 5)
    .split(":")
    .map((part) => Number(part) || 0);
  const total = hours * 60 + mins + Number(minutes || 0);
  const nextHours = Math.floor(((total % (24 * 60)) + 24 * 60) / 60) % 24;
  const nextMins = ((total % 60) + 60) % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMins).padStart(2, "0")}`;
}

function last9Phone(value) {
  return String(value || "").replace(/[^\d]/g, "").slice(-9);
}

async function findOrCreateClient(supabase, centerId, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const phoneKey = last9Phone(payload.phone);
  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("center_id", centerId)
      .is("merged_into_client_id", null)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data?.id) {
      return data.id;
    }
  }
  if (phoneKey.length === 9) {
    const { data, error } = await supabase
      .from("clients")
      .select("id,phone")
      .eq("center_id", centerId)
      .is("merged_into_client_id", null)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) {
      throw new Error(error.message);
    }
    const match = (data || []).find((row) => last9Phone(row.phone) === phoneKey);
    if (match?.id) {
      return match.id;
    }
  }
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: String(payload.firstName || "").trim() || "Cliente",
      last_name: String(payload.lastName || "").trim() || "Bookea",
      email: email || null,
      phone: String(payload.phone || "").trim() || null,
      status: "in_care",
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data.id;
}

async function findOrCreateService(supabase, centerId, name, duration) {
  const treatment = String(name || "").trim() || "Soin";
  const { data: existing, error: existingError } = await supabase
    .from("services")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", treatment)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing?.id) {
    return existing.id;
  }
  const { data, error } = await supabase
    .from("services")
    .insert({
      center_id: centerId,
      name: treatment,
      duration_minutes: duration,
      price_ttc: 0,
      is_public: true,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data.id;
}

async function firstRoomAndPractitioner(supabase, centerId) {
  const [{ data: rooms }, { data: staff }] = await Promise.all([
    supabase.from("rooms").select("id").eq("center_id", centerId).limit(1),
    supabase.from("practitioners").select("id").eq("center_id", centerId).limit(1),
  ]);
  return {
    roomId: rooms?.[0]?.id || null,
    practitionerId: staff?.[0]?.id || null,
  };
}

async function dayRows(supabase, centerId, date) {
  const { data, error } = await supabase
    .from("appointments")
    .select("id,appointment_date,starts_at,ends_at,status,notes,origin,duration_minutes")
    .eq("center_id", centerId)
    .eq("appointment_date", date);
  if (error) {
    throw new Error(error.message);
  }
  return data || [];
}

async function findBooking(supabase, centerId, bookingId) {
  if (!bookingId) {
    return null;
  }
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id,center_id,client_id,lead_id,appointment_date,starts_at,ends_at,status,notes,status_history,origin,services(name),clients(first_name,last_name,email),centers(name)",
    )
    .eq("center_id", centerId)
    .like("notes", `%booking:${bookingId}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(error.message);
  }
  return data?.[0] || null;
}

function publicUrls(req, slug) {
  const origin = appBaseUrl(req);
  const path = `/centres/${slug}`;
  return {
    successUrl: `${origin}${path}?paid=1`,
    cancelUrl: `${origin}${path}?paid=0`,
  };
}

async function openCheckout(center, appointment, payload, urls) {
  const hold = readHold(appointment.notes);
  const expiresAt = Math.floor(new Date(hold.holdUntil).getTime() / 1000);
  const stored = parseStoredStripe(center.settings);
  const session = await stripeRequest(
    "POST",
    "checkout/sessions",
    checkoutParams({
      cents: hold.depositCents,
      serviceName: payload.treatment,
      email: payload.email,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      expiresAt,
      centerId: center.id,
      bookingId: payload.bookingId,
      customerName: `${payload.firstName || ""} ${payload.lastName || ""}`.trim(),
    }),
    { account: stored.accountId },
  );
  const notes = buildHoldNotes({
    bookingId: payload.bookingId,
    depositCents: hold.depositCents,
    priceCents: hold.priceCents,
    holdUntil: hold.holdUntil,
    payment: "pending",
    sessionId: session.id,
  });
  await appointmentUpdate(center, appointment.id, { notes });
  return session;
}

async function appointmentUpdate(center, id, patch) {
  const supabase = center._supabase;
  const { error } = await supabase
    .from("appointments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("center_id", center.id);
  if (error) {
    throw new Error(error.message);
  }
}

function moneyBody(quote, extra) {
  return {
    depositEur: euros(quote.cents),
    priceEur: euros(quote.priceCents),
    remainingEur: euros(quote.remainingCents),
    ...extra,
  };
}

async function startOnlineDeposit(supabase, center, payload, req) {
  const stored = parseStoredStripe(center.settings);
  const quote = onlineQuote(center.settings, payload.treatment, stored.chargesEnabled);
  if (!quote.online) {
    return null;
  }
  const now = new Date();
  const bookingId = String(payload.bookingId || "").trim();
  const date = String(payload.date || "").slice(0, 10);
  const start = String(payload.start || "").slice(0, 5);
  const duration = Number(payload.duration) > 0 ? Number(payload.duration) : 60;
  const end = addMinutes(start, duration);
  const existing = await findBooking(supabase, center.id, bookingId);
  if (existing?.id) {
    const hold = readHold(existing.notes);
    if (hold.payment === "received" || existing.status === "confirmed") {
      return {
        status: 200,
        body: { ok: true, already: true, appointmentId: existing.id, ...moneyBody(quote) },
      };
    }
    if (hold.payment === "pending" && !holdExpired(existing, now)) {
      const session = await openCheckout(
        { ...center, _supabase: supabase },
        existing,
        payload,
        publicUrls(req, center.slug),
      );
      return {
        status: 200,
        body: {
          ok: true,
          pending: true,
          checkoutUrl: session.url,
          appointmentId: existing.id,
          ...moneyBody({ ...quote, cents: hold.depositCents, priceCents: hold.priceCents, remainingCents: Math.max(0, hold.priceCents - hold.depositCents) }),
        },
      };
    }
  }

  const rows = await dayRows(supabase, center.id, date);
  if (slotTaken(rows, { date, start, end, ignoreId: existing?.id }, now)) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "slot_taken",
        message: "Ce créneau vient d’être réservé. Choisissez un autre horaire.",
      },
    };
  }

  const holdUntil = new Date(now.getTime() + HOLD_MS).toISOString();
  const [clientId, serviceId, assignment] = await Promise.all([
    findOrCreateClient(supabase, center.id, payload),
    findOrCreateService(supabase, center.id, payload.treatment, duration),
    firstRoomAndPractitioner(supabase, center.id),
  ]);
  const notes = buildHoldNotes({
    bookingId,
    depositCents: quote.cents,
    priceCents: quote.priceCents,
    holdUntil,
    payment: "pending",
  });
  const history = appendStatusHistory([], {
    at: now.toISOString(),
    source: "public_bookea",
    action: "hold",
    to: `${date}|${start}`,
  });
  let appointment = existing;
  if (!appointment?.id) {
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        center_id: center.id,
        client_id: clientId,
        service_id: serviceId,
        room_id: assignment.roomId,
        practitioner_id: assignment.practitionerId,
        appointment_date: date,
        starts_at: start,
        ends_at: end,
        duration_minutes: duration,
        status: "to_confirm",
        origin: "public_hold",
        notes,
        status_history: history,
        updated_at: now.toISOString(),
      })
      .select("id,notes")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    appointment = data;
  } else {
    await appointmentUpdate(
      { ...center, _supabase: supabase },
      appointment.id,
      {
        status: "to_confirm",
        origin: "public_hold",
        notes,
        starts_at: start,
        ends_at: end,
        appointment_date: date,
      },
    );
    appointment = { ...appointment, notes };
  }

  const session = await openCheckout(
    { ...center, _supabase: supabase },
    appointment,
    payload,
    publicUrls(req, center.slug),
  );
  return {
    status: 200,
    body: {
      ok: true,
      pending: true,
      checkoutUrl: session.url,
      appointmentId: appointment.id,
      ...moneyBody(quote),
    },
  };
}

async function releaseHold(supabase, center, bookingId) {
  const row = await findBooking(supabase, center.id, bookingId);
  if (!row?.id) {
    return { status: 200, body: { ok: true, missing: true } };
  }
  const hold = readHold(row.notes);
  if (hold.payment === "received") {
    return { status: 200, body: { ok: true, kept: true } };
  }
  if (row.status === "cancelled") {
    return { status: 200, body: { ok: true, already: true } };
  }
  const { error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      notes: buildHoldNotes({
        ...hold,
        payment: "abandoned",
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("center_id", center.id);
  if (error) {
    throw new Error(error.message);
  }
  return { status: 200, body: { ok: true, released: true } };
}

async function markLeadReceived(supabase, appointment) {
  if (!appointment?.lead_id) {
    return;
  }
  const { data } = await supabase
    .from("leads")
    .select("id,status")
    .eq("id", appointment.lead_id)
    .maybeSingle();
  const waiting = new Set([
    "Nouveau",
    "À rappeler",
    "A rappeler",
    "Acompte envoyé",
    "Acompte en attente",
    "RDV",
    "Confirmé",
  ]);
  if (!data?.id || !waiting.has(String(data.status || ""))) {
    return;
  }
  await supabase.from("leads").update({ status: "Acompte reçu" }).eq("id", data.id);
}

async function notifyOnce(supabase, appointment, kind, extra) {
  const key = eventNotifyKey(kind, {
    id: appointment.id,
    date: String(appointment.appointment_date || "").slice(0, 10),
    time: String(appointment.starts_at || "").slice(0, 5),
  });
  if (alreadyNotified(appointment.status_history, key)) {
    return { sent: false, reason: "already" };
  }
  if (kind === "deposit_conflict") {
    const copy = appointmentEventCopy({
      kind,
      personName: extra.personName,
      treatment: extra.treatment,
      when: formatEventWhen(extra.date, extra.time),
      centerName: extra.centerName,
    });
    return notifyCenterEvent({
      supabase,
      centerId: appointment.center_id,
      kind,
      copy,
      appointment,
      dedupeKey: key,
    });
  }
  return notifyAppointmentEvent(supabase, appointment, kind, "public_bookea", extra);
}

async function emailClientOnce(supabase, appointment, payload) {
  const email = String(payload.email || appointment.clients?.email || "").trim();
  const key = `client_confirm:${appointment.id}`;
  if (!email || alreadyNotified(appointment.status_history, key)) {
    return { sent: false, reason: "already" };
  }
  if (!process.env.BREVO_API_KEY) {
    return { sent: false, reason: "missing_brevo" };
  }
  const { data: center } = await supabase
    .from("centers")
    .select("id,name,email,settings")
    .eq("id", appointment.center_id)
    .maybeSingle();
  const seya = center ? (await readCenterSeya(supabase, center.id)).seya : {};
  const resolved = await resolveNotifySender(center, seya);
  if (!resolved.senderEmail) {
    return { sent: false, reason: "missing_sender" };
  }
  const hold = readHold(appointment.notes);
  const result = await sendBrevoToCenter({
    to: email,
    subject: `Acompte reçu — ${center?.name || "Bookea"}`,
    text: [
      `Votre acompte de ${euros(hold.depositCents)} € est bien reçu.`,
      `Rendez-vous : ${payload.treatment || ""} le ${String(appointment.appointment_date || "").slice(0, 10)} à ${String(appointment.starts_at || "").slice(0, 5)}.`,
      `Reste à régler au salon : ${euros(Math.max(0, hold.priceCents - hold.depositCents))} €.`,
    ].join("\n"),
    centerName: center?.name,
    senderEmail: resolved.senderEmail,
    senderName: resolved.senderName,
    tags: ["bookea-client"],
  });
  if (result?.sent) {
    const history = appendStatusHistory(appointment.status_history, {
      at: new Date().toISOString(),
      source: "bookea",
      action: "center_notify",
      to: key,
    });
    await supabase
      .from("appointments")
      .update({ status_history: history })
      .eq("id", appointment.id);
  }
  return result;
}

async function handlePaidSession(supabase, event) {
  const session = event?.data?.object || {};
  const metadata = session.metadata || {};
  const centerId = String(metadata.center_id || "").trim();
  const bookingId = String(metadata.booking_id || "").trim();
  if (!centerId || !bookingId) {
    return { ok: true, ignored: true };
  }
  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,slug,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!center?.id) {
    return { ok: true, unmatched: true };
  }
  const stored = parseStoredStripe(center.settings);
  const appointment = await findBooking(supabase, center.id, bookingId);
  if (!appointment?.id) {
    return { ok: true, missing: true };
  }
  const hold = readHold(appointment.notes);
  const verified = verifyPaidSession({
    session,
    account: event.account || "",
    connectedAccount: stored.accountId,
    expected: {
      cents: hold.depositCents,
      bookingId,
      centerId: center.id,
    },
  });
  const now = new Date();
  const expired =
    holdExpired(appointment, now) ||
    appointment.status === "cancelled" ||
    hold.payment === "abandoned";
  let taken = false;
  if (expired) {
    const rows = await dayRows(supabase, center.id, appointment.appointment_date);
    taken = slotTaken(
      rows,
      {
        date: appointment.appointment_date,
        start: appointment.starts_at,
        end: appointment.ends_at,
        ignoreId: appointment.id,
      },
      now,
    );
  }
  if (verified.ok && hold.payment === "conflict") {
    const { recordOnlineDeposit } = require("./loyalty-store");
    await recordOnlineDeposit(supabase, session).catch(() => null);
    await notifyOnce(supabase, appointment, "deposit_conflict", {
      personName: `${session.metadata?.customer_name || ""}`.trim(),
      treatment: session.metadata?.service_name,
      date: appointment.appointment_date,
      time: String(appointment.starts_at || "").slice(0, 5),
      centerName: center.name,
    }).catch(() => null);
    return { ok: true, duplicate: true };
  }
  const outcome = paymentOutcome({
    verified: verified.ok,
    alreadyReceived: hold.payment === "received",
    holdExpired: expired,
    slotTakenByOther: taken,
  });
  if (outcome === "reject") {
    return { ok: false, error: "payment_mismatch", reasons: verified.reasons };
  }
  const { recordOnlineDeposit } = require("./loyalty-store");
  if (outcome === "duplicate") {
    await recordOnlineDeposit(supabase, session).catch((error) => {
      console.error("[online-deposit] deposit retry", error);
    });
    return { ok: true, duplicate: true };
  }

  if (outcome === "conflict") {
    const notes = buildHoldNotes({
      ...hold,
      payment: "conflict",
      sessionId: session.id,
    });
    await supabase
      .from("appointments")
      .update({
        status: "quote",
        notes: `Paiement reçu, créneau plus disponible. ${notes}`,
        updated_at: now.toISOString(),
      })
      .eq("id", appointment.id);
    await recordOnlineDeposit(supabase, session, appointment).catch(() => null);
    await notifyOnce(supabase, { ...appointment, notes }, "deposit_conflict", {
      personName: `${session.metadata?.customer_name || ""}`.trim(),
      treatment: session.metadata?.service_name,
      date: appointment.appointment_date,
      time: String(appointment.starts_at || "").slice(0, 5),
      centerName: center.name,
    }).catch(() => null);
    return { ok: true, conflict: true };
  }

  const notes = buildHoldNotes({
    ...hold,
    payment: "received",
    sessionId: session.id,
  });
  const history = appendStatusHistory(appointment.status_history, {
    at: now.toISOString(),
    source: "stripe",
    action: "deposit_received",
    to: "Acompte reçu",
  });
  await supabase
    .from("appointments")
    .update({
      status: "confirmed",
      origin: "public_bookea",
      notes: `Acompte reçu. ${notes}`,
      confirmed_at: now.toISOString(),
      status_history: history,
      updated_at: now.toISOString(),
    })
    .eq("id", appointment.id);
  const confirmed = { ...appointment, notes, status_history: history, status: "confirmed" };
  await recordOnlineDeposit(supabase, session);
  await markLeadReceived(supabase, confirmed);
  await notifyOnce(supabase, confirmed, "appointment_booked", {
    personName: session.metadata?.customer_name,
    treatment: session.metadata?.service_name,
    date: String(appointment.appointment_date || "").slice(0, 10),
    time: String(appointment.starts_at || "").slice(0, 5),
    centerName: center.name,
    statusHistory: history,
  }).catch((error) => {
    console.error("[online-deposit] notify", error);
  });
  await emailClientOnce(supabase, confirmed, {
    email: session.customer_email || session.customer_details?.email,
    treatment: session.metadata?.service_name,
  }).catch((error) => {
    console.error("[online-deposit] client mail", error);
  });
  return { ok: true, confirmed: true };
}

async function handleExpiredSession(supabase, event) {
  const session = event?.data?.object || {};
  const bookingId = String(session.metadata?.booking_id || "").trim();
  const centerId = String(session.metadata?.center_id || "").trim();
  if (!bookingId || !centerId) {
    return { ok: true, ignored: true };
  }
  const { data: center } = await supabase
    .from("centers")
    .select("id,name,slug,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (!center?.id) {
    return { ok: true, unmatched: true };
  }
  return releaseHold(supabase, center, bookingId);
}

module.exports = {
  handleExpiredSession,
  handlePaidSession,
  releaseHold,
  startOnlineDeposit,
};
