const {
  amountDue,
  canonicalStatus,
  movementLabel,
  normalizeProgram,
  noShowRuleText,
  pendingPoints,
  progressText,
  syncAppointment,
} = require("../../lib/loyalty");

function isMissingSchema(error) {
  const message = String(error?.message || error || "");
  return /loyalty_deposits|loyalty_reward_requests|idempotency_key|apply_loyalty_batch|redeem_loyalty_reward|schema cache/i.test(
    message,
  );
}

function programFromSettings(settings) {
  const source = settings && typeof settings === "object" ? settings.loyalty : null;
  return normalizeProgram(source);
}

function mapEvent(row) {
  return {
    id: row.id,
    centerId: row.center_id,
    clientId: row.client_id,
    appointmentId: row.appointment_id || "",
    key: row.idempotency_key || "",
    kind: row.kind || "",
    points: Number(row.points) || 0,
    reason: row.reason || "",
    scale: row.scale || {},
    at: row.created_at,
  };
}

function mapDeposit(row) {
  return {
    id: row.id,
    centerId: row.center_id,
    clientId: row.client_id || "",
    appointmentId: row.appointment_id || "",
    bookingId: row.booking_id || "",
    sessionId: row.stripe_session_id || "",
    paymentIntentId: row.payment_intent_id || "",
    amountCents: Number(row.amount_cents) || 0,
    refundedCents: Number(row.refunded_cents) || 0,
    confirmed: true,
  };
}

async function loadProgram(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return {
    center: data,
    program: programFromSettings(data?.settings),
  };
}

async function saveProgram(supabase, centerId, rawProgram) {
  const program = normalizeProgram(rawProgram);
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  const settings =
    data?.settings && typeof data.settings === "object" ? data.settings : {};
  const { error: updateError } = await supabase
    .from("centers")
    .update({
      settings: { ...settings, loyalty: program },
      updated_at: new Date().toISOString(),
    })
    .eq("id", centerId);
  if (updateError) {
    throw updateError;
  }
  return program;
}

async function loadEvents(supabase, centerId, clientId) {
  let query = supabase
    .from("loyalty_events")
    .select("id,center_id,client_id,appointment_id,points,reason,created_at,idempotency_key,kind,scale")
    .eq("center_id", centerId);
  if (clientId) {
    query = query.eq("client_id", clientId);
  }
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data || []).map(mapEvent);
}

async function loadDeposits(supabase, centerId, appointmentIds) {
  if (!appointmentIds?.length) {
    return [];
  }
  const { data, error } = await supabase
    .from("loyalty_deposits")
    .select(
      "id,center_id,client_id,appointment_id,booking_id,stripe_session_id,payment_intent_id,amount_cents,refunded_cents",
    )
    .eq("center_id", centerId)
    .in("appointment_id", appointmentIds);
  if (error) {
    if (isMissingSchema(error)) {
      return [];
    }
    throw error;
  }
  return (data || []).map(mapDeposit);
}

function depositPaid(deposits, appointmentId) {
  return (deposits || [])
    .filter((row) => row.appointmentId === appointmentId)
    .reduce(
      (sum, row) => sum + Math.max(0, row.amountCents - row.refundedCents) / 100,
      0,
    );
}

async function reattachDeposit(supabase, appointment) {
  const match = String(appointment?.notes || "").match(/booking:([^\s]+)/);
  if (!match || !appointment?.id) {
    return;
  }
  const bookingId = match[1];
  const { data, error } = await supabase
    .from("loyalty_deposits")
    .select("id,appointment_id")
    .eq("center_id", appointment.center_id)
    .eq("booking_id", bookingId);
  if (error) {
    if (isMissingSchema(error)) {
      return;
    }
    throw error;
  }
  for (const row of data || []) {
    if (row.appointment_id === appointment.id) {
      continue;
    }
    let movable = !row.appointment_id;
    if (row.appointment_id) {
      const previous = await supabase
        .from("appointments")
        .select("status")
        .eq("id", row.appointment_id)
        .maybeSingle();
      movable =
        !previous.data ||
        ["cancelled", "no_show"].includes(String(previous.data.status || ""));
    }
    if (!movable || ["cancelled", "no_show"].includes(appointment.status)) {
      continue;
    }
    await supabase
      .from("loyalty_deposits")
      .update({
        appointment_id: appointment.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }
}

async function syncStoredAppointment(supabase, appointment, previousStatus, status) {
  await reattachDeposit(supabase, appointment);
  const [loaded, events] = await Promise.all([
    loadProgram(supabase, appointment.center_id),
    loadEvents(supabase, appointment.center_id, appointment.client_id),
  ]);
  const deposits = await loadDeposits(supabase, appointment.center_id, [
    appointment.id,
  ]);
  const state = { events, deposits, requests: [] };
  const result = syncAppointment(state, {
    centerId: appointment.center_id,
    clientId: appointment.client_id,
    appointmentId: appointment.id,
    program: loaded.program,
    previousStatus,
    status: status || appointment.status,
  });
  if (!result.applied.length && !result.closed) {
    return {
      ok: true,
      balance: result.balance,
      pending: result.pending,
      manualReview: "",
      applied: [],
    };
  }
  const { data, error } = await supabase.rpc("apply_loyalty_batch", {
    p_center_id: appointment.center_id,
    p_client_id: appointment.client_id,
    p_appointment_id: appointment.id,
    p_movements: result.applied.map((event) => ({
      key: event.key,
      kind: event.kind,
      points: event.points,
      reason: event.reason,
      clamp: event.kind === "no_show",
      scale: event.scale || {},
    })),
    p_close_reward: result.closed > 0,
  });
  if (error) {
    throw error;
  }
  return {
    ok: data?.ok !== false,
    balance: data?.balance ?? result.balance,
    pending: result.pending,
    manualReview: result.manualReview,
    applied: data?.applied || [],
  };
}

async function closeRequestedReward(supabase, appointmentId) {
  const { error } = await supabase
    .from("loyalty_reward_requests")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("appointment_id", appointmentId)
    .eq("status", "requested");
  if (error && !isMissingSchema(error)) {
    throw error;
  }
}

function relationName(value) {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row : null;
}

async function buildClientCard(supabase, center, clientId) {
  const loaded = await loadProgram(supabase, center.id);
  const program = loaded.program;
  let events = [];
  try {
    events = await loadEvents(supabase, center.id, clientId);
  } catch (error) {
    if (!isMissingSchema(error)) {
      throw error;
    }
  }
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id,appointment_date,starts_at,status,notes,services(name,price_ttc)")
    .eq("center_id", center.id)
    .eq("client_id", clientId)
    .order("appointment_date", { ascending: true });
  const rows = appointments || [];
  const deposits = await loadDeposits(
    supabase,
    center.id,
    rows.map((row) => row.id),
  );
  let requests = [];
  const requestQuery = await supabase
    .from("loyalty_reward_requests")
    .select("id,appointment_id,reward_id,points,discount_eur,min_service_eur,status")
    .eq("center_id", center.id)
    .eq("client_id", clientId);
  if (!requestQuery.error) {
    requests = requestQuery.data || [];
  } else if (!isMissingSchema(requestQuery.error)) {
    throw requestQuery.error;
  }
  const balance = events.reduce((sum, event) => sum + event.points, 0);
  const history = [...events].reverse().map((event) => ({
    id: event.id,
    at: event.at,
    points: event.points,
    label: event.kind ? movementLabel(event) : `${event.reason} ${event.points > 0 ? `+${event.points}` : event.points}`,
  }));
  const openAppointments = rows
    .filter((row) => canonicalStatus(row.status) === "open")
    .map((row) => {
      const service = relationName(row.services);
      const request = requests.find((item) => item.appointment_id === row.id);
      return {
        id: row.id,
        date: String(row.appointment_date || "").slice(0, 10),
        time: String(row.starts_at || "").slice(0, 5),
        status: row.status,
        service: service?.name || "Prestation",
        price: Number(service?.price_ttc) || 0,
        pending: pendingPoints({
          program,
          status: row.status,
          deposits,
          events,
          appointmentId: row.id,
        }),
        request: request
          ? {
              id: request.id,
              status: request.status,
              points: request.points,
              discountEur: Number(request.discount_eur),
            }
          : null,
      };
    });
  const pending = openAppointments.reduce((sum, row) => sum + row.pending, 0);
  return {
    centerId: center.id,
    centerName: center.name || loaded.center?.name || "Institut",
    clientId,
    enabled: program.enabled,
    balance,
    pending,
    progress: progressText(balance, program.rewards),
    noShowRule: noShowRuleText(program),
    rewards: program.rewards.map((reward) => ({
      ...reward,
      affordable: balance >= reward.points,
    })),
    history,
    appointments: openAppointments,
  };
}

async function recordOnlineDeposit(supabase, session) {
  if (!session || session.payment_status !== "paid") {
    return { ok: true, ignored: true };
  }
  const metadata = session.metadata || {};
  const centerId = String(metadata.center_id || "").trim();
  const sessionId = String(session.id || "").trim();
  if (!centerId || !sessionId) {
    return { ok: true, ignored: true };
  }
  const bookingId = String(metadata.booking_id || "").trim();
  let appointmentId = null;
  let clientId = null;
  if (bookingId) {
    const { data } = await supabase
      .from("appointments")
      .select("id,status,client_id")
      .eq("center_id", centerId)
      .like("notes", `%booking:${bookingId}%`)
      .order("created_at", { ascending: false });
    const rows = data || [];
    const open = rows.find((row) => !["cancelled", "no_show", "quote"].includes(row.status));
    const chosen = open || rows[0];
    appointmentId = chosen?.id || null;
    clientId = chosen?.client_id || null;
  }
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || "";
  const { error } = await supabase.from("loyalty_deposits").insert({
    center_id: centerId,
    client_id: clientId,
    appointment_id: appointmentId,
    booking_id: bookingId || null,
    stripe_session_id: sessionId,
    payment_intent_id: paymentIntent || null,
    amount_cents: Number(session.amount_total) || 0,
    refunded_cents: 0,
    confirmed_at: new Date().toISOString(),
  });
  if (error && /duplicate|unique/i.test(error.message || "")) {
    return { ok: true, duplicate: true };
  }
  if (error) {
    throw error;
  }
  return { ok: true, created: true };
}

async function recordDepositRefund(supabase, charge) {
  const paymentIntentId =
    typeof charge?.payment_intent === "string"
      ? charge.payment_intent
      : charge?.payment_intent?.id || "";
  if (!paymentIntentId) {
    return { ok: true, ignored: true };
  }
  const refunded = Math.max(0, Number(charge.amount_refunded) || 0);
  const { error } = await supabase
    .from("loyalty_deposits")
    .update({
      refunded_cents: refunded,
      updated_at: new Date().toISOString(),
    })
    .eq("payment_intent_id", paymentIntentId);
  if (error) {
    throw error;
  }
  const { data: deposits } = await supabase
    .from("loyalty_deposits")
    .select("center_id,client_id,appointment_id,amount_cents,refunded_cents")
    .eq("payment_intent_id", paymentIntentId);
  for (const row of deposits || []) {
    if (!row.client_id || !row.appointment_id || row.refunded_cents < row.amount_cents) {
      continue;
    }
    try {
      const events = await loadEvents(supabase, row.center_id, row.client_id);
      const { planDepositRefund } = require("../../lib/loyalty");
      const plan = planDepositRefund({
        centerId: row.center_id,
        clientId: row.client_id,
        appointmentId: row.appointment_id,
        events,
      });
      if (!plan.movements.length) {
        continue;
      }
      const { error: rpcError } = await supabase.rpc("apply_loyalty_batch", {
        p_center_id: row.center_id,
        p_client_id: row.client_id,
        p_appointment_id: row.appointment_id,
        p_movements: plan.movements,
        p_close_reward: false,
      });
      if (rpcError && !isMissingSchema(rpcError)) {
        throw rpcError;
      }
    } catch (refundError) {
      if (!isMissingSchema(refundError)) {
        console.error("[loyalty] refund correction", refundError);
      }
    }
  }
  return { ok: true };
}

async function redeemStoredReward(supabase, requestId, servicePrice) {
  const { data: request, error } = await supabase
    .from("loyalty_reward_requests")
    .select("id,center_id,appointment_id,discount_eur,points,min_service_eur,status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!request) {
    return { ok: false, error: "request_not_found" };
  }
  const loaded = await loadProgram(supabase, request.center_id);
  if (!loaded.program.enabled) {
    return { ok: false, error: "program_disabled" };
  }
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id,services(price_ttc)")
    .eq("id", request.appointment_id)
    .maybeSingle();
  const catalog = Number(relationName(appointment?.services)?.price_ttc) || 0;
  const price = Number(servicePrice) > 0 ? Number(servicePrice) : catalog;
  const deposits = await loadDeposits(supabase, request.center_id, [request.appointment_id]);
  const paid = depositPaid(deposits, request.appointment_id);
  const { data, error: rpcError } = await supabase.rpc("redeem_loyalty_reward", {
    p_request_id: requestId,
    p_service_price: price,
    p_deposit_paid: paid,
  });
  if (rpcError) {
    throw rpcError;
  }
  const due = amountDue({
    servicePrice: price,
    discountEur: Number(request.discount_eur),
    depositPaid: paid,
  });
  return {
    ...(data || { ok: false }),
    due: data?.due ?? due.due,
    discounted: data?.discounted ?? due.discounted,
    refund: 0,
  };
}

module.exports = {
  buildClientCard,
  closeRequestedReward,
  depositPaid,
  isMissingSchema,
  loadEvents,
  loadProgram,
  movementLabel,
  recordDepositRefund,
  recordOnlineDeposit,
  redeemStoredReward,
  saveProgram,
  syncStoredAppointment,
};
