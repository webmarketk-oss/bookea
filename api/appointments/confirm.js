const { APPOINTMENT_SELECT } = require("./issue");
const {
  CLIENT_CANCELLED,
  CLIENT_CONFIRMED,
  appendStatusHistory,
  formatPublicAppointmentDate,
  hashConfirmationToken,
  parisDateOf,
  readConfirmationState,
  stateMessage,
} = require("./token-utils");
const {
  createServiceClient,
  firstValue,
  parsePayload,
  rateLimit,
  relationObject,
} = require("./service");

function publicAppointmentView(row) {
  const center = relationObject(row?.centers);
  const service = relationObject(row?.services);
  const time = String(row?.starts_at || "").slice(0, 5);

  return {
    centerName: String(center?.name || "votre centre").trim() || "votre centre",
    date: formatPublicAppointmentDate(row?.appointment_date),
    time,
    treatment: String(service?.name || "").trim(),
    durationMinutes: Number(row?.duration_minutes) || 0,
  };
}

function canRescheduleState(state) {
  return state === "pending" || state === "confirmed" || state === "rescheduled";
}

function jsonState(state, row) {
  return {
    ok: state === "pending" || state === "confirmed" || state === "cancelled" || state === "need_phone" || state === "rescheduled",
    state,
    message: stateMessage(state),
    appointment: row && state !== "invalid" ? publicAppointmentView(row) : null,
    canReschedule: canRescheduleState(state),
  };
}

function last9Phone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.slice(-9);
}

async function loadByPhone(supabase, phone) {
  const last9 = last9Phone(phone);

  if (last9.length < 9) {
    return null;
  }

  const { data: clients, error: clientError } = await supabase
    .from("clients")
    .select("id,phone")
    .or(`phone.eq.33${last9},phone.eq.0${last9},phone.ilike.%${last9}%`)
    .limit(12);

  if (clientError) {
    throw new Error(clientError.message);
  }

  const clientIds = (clients ?? [])
    .filter((row) => last9Phone(row.phone) === last9)
    .map((row) => row.id);

  if (clientIds.length === 0) {
    return null;
  }

  const today = parisDateOf(new Date());
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `${APPOINTMENT_SELECT},
      centers(name),
      services(name)`,
    )
    .in("client_id", clientIds)
    .gte("appointment_date", today)
    .order("appointment_date", { ascending: true })
    .order("starts_at", { ascending: true })
    .limit(12);

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []).find((row) => readConfirmationState(row) !== "cancelled") ?? null
  );
}

async function applyAppointmentUpdate(supabase, row, fields, extra) {
  let query = supabase
    .from("appointments")
    .update(fields)
    .eq("id", row.id)
    .is("cancelled_at", null);

  if (extra?.requireUnconfirmed) {
    query = query.is("confirmed_at", null);
  }

  if (row.confirmation_token_hash) {
    query = query.eq("confirmation_token_hash", row.confirmation_token_hash);
  }

  return query.select("id").maybeSingle();
}

async function loadByToken(supabase, token) {
  const hash = hashConfirmationToken(token);

  if (!hash || hash.length < 32) {
    return null;
  }

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `${APPOINTMENT_SELECT},
      centers(name),
      services(name)`,
    )
    .eq("confirmation_token_hash", hash)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function syncLinkedLead(supabase, row, nextStatus, note) {
  if (!row?.lead_id) {
    return;
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("id,status")
    .eq("id", row.lead_id)
    .maybeSingle();

  if (!lead?.id) {
    return;
  }

  const now = new Date().toISOString();
  await supabase
    .from("leads")
    .update({
      status: nextStatus,
      updated_at: now,
      last_activity_at: now,
    })
    .eq("id", lead.id);

  await supabase.from("lead_events").insert({
    center_id: row.center_id,
    lead_id: lead.id,
    event_type: "status",
    from_value: lead.status,
    to_value: nextStatus,
    note,
  });
}

async function applyAction(supabase, row, action) {
  const now = new Date().toISOString();
  const currentState = readConfirmationState(row);

  if (currentState === "expired" || currentState === "moved" || currentState === "invalid") {
    return currentState;
  }

  if (action === "confirm") {
    if (currentState === "cancelled") {
      return "cancelled";
    }

    if (currentState === "confirmed") {
      return "confirmed";
    }

    const nextHistory = appendStatusHistory(row.status_history, {
      at: now,
      source: "client_link",
      action: "confirm",
      from: row.status,
      to: "confirmed",
    });

    const { data, error } = await applyAppointmentUpdate(
      supabase,
      row,
      {
        status: "confirmed",
        confirmed_at: now,
        client_response: CLIENT_CONFIRMED,
        status_history: nextHistory,
        updated_at: now,
      },
      { requireUnconfirmed: true },
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      const { data: latest } = await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .eq("id", row.id)
        .maybeSingle();
      return readConfirmationState(latest || row);
    }

    await syncLinkedLead(
      supabase,
      row,
      "RDV confirmé",
      "La cliente a confirmé son rendez-vous depuis le lien SMS.",
    );

    return "confirmed";
  }

  if (action === "cancel") {
    if (currentState === "cancelled") {
      return "cancelled";
    }

    const nextHistory = appendStatusHistory(row.status_history, {
      at: now,
      source: "client_link",
      action: "cancel",
      from: row.status,
      to: "cancelled",
    });

    const { data, error } = await applyAppointmentUpdate(supabase, row, {
      status: "cancelled",
      cancelled_at: now,
      client_response: CLIENT_CANCELLED,
      status_history: nextHistory,
      updated_at: now,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return "cancelled";
    }

    await syncLinkedLead(
      supabase,
      row,
      "À relancer",
      "La cliente a annulé son rendez-vous depuis le lien SMS.",
    );

    return "cancelled";
  }

  return currentState;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = req.method === "POST" ? parsePayload(req.body) : req.query;
    const token = String(firstValue(payload?.token) || "").trim();
    const phone = String(firstValue(payload?.phone) || "").trim();
    const action = String(firstValue(payload?.action) || "").trim();
    const limitKey = `${req.socket?.remoteAddress || "ip"}:${hashConfirmationToken(token || phone).slice(0, 12)}`;

    if (!rateLimit(limitKey)) {
      return res.status(429).json({
        ok: false,
        state: "error",
        message: "Trop de tentatives. Réessayez dans un instant.",
        appointment: null,
      });
    }

    if (!token && !phone) {
      return res.status(200).json(jsonState("need_phone"));
    }

    const supabase = createServiceClient();
    const row = token ? await loadByToken(supabase, token) : await loadByPhone(supabase, phone);

    if (!row) {
      return res.status(404).json({
        ok: false,
        state: "invalid",
        message: phone
          ? "Aucun rendez-vous à venir pour ce numéro."
          : stateMessage("invalid"),
        appointment: null,
      });
    }

    if (req.method === "GET") {
      const state = readConfirmationState(row);
      const status = state === "invalid" ? 404 : 200;
      return res.status(status).json(jsonState(state, row));
    }

    if (action !== "confirm" && action !== "cancel") {
      return res.status(400).json(jsonState("invalid", row));
    }

    const nextState = await applyAction(supabase, row, action);
    const latest =
      nextState === "confirmed" || nextState === "cancelled"
        ? { ...row, confirmed_at: nextState === "confirmed" ? new Date().toISOString() : row.confirmed_at, cancelled_at: nextState === "cancelled" ? new Date().toISOString() : row.cancelled_at, status: nextState === "cancelled" ? "cancelled" : "confirmed" }
        : row;

    return res.status(200).json(jsonState(nextState, latest));
  } catch (error) {
    console.error("[appointments/confirm]", error);
    return res.status(500).json({
      ok: false,
      state: "error",
      message: stateMessage("error"),
      appointment: null,
    });
  }
};
