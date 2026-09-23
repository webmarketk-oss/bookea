const { APPOINTMENT_SELECT } = require("./issue");
const {
  CLIENT_CONFIRMED,
  appendStatusHistory,
  appointmentSlot,
  confirmationExpiresAt,
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
const {
  isAppointmentReminderKind,
  mergeCenterSmsSettings,
  parseCenterSmsSettings,
  reminderHoursForKind,
  reminderSendAt,
} = require("../sms/brevo");

const SLOT_STEP = 30;
const DAYS_AHEAD = 21;
const MIN_LEAD_MINUTES = 60;
const DEFAULT_OPEN = "08:00";
const DEFAULT_CLOSE = "19:00";

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

function jsonState(state, row, extra = {}) {
  return {
    ok:
      state === "pending" ||
      state === "confirmed" ||
      state === "cancelled" ||
      state === "rescheduled",
    state,
    message: extra.message || stateMessage(state),
    appointment: row && state !== "invalid" ? publicAppointmentView(row) : null,
    canReschedule: extra.canReschedule ?? canRescheduleState(state),
    ...extra,
  };
}

function timeToMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value || "").slice(0, 5).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function minutesToTime(total) {
  const hours = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addDaysYmd(ymd, days) {
  const date = new Date(`${ymd}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayFromYmd(ymd) {
  return new Date(`${ymd}T12:00:00`).getDay();
}

function formatDayLabel(ymd) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${ymd}T12:00:00`));
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function parisNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function hoursForDay(settings, weekday) {
  const record = settings && typeof settings === "object" ? settings : {};
  const list = [
    record.agenda?.hours,
    record.hours,
    record.agendaHours,
    record.public?.hours,
  ].find((value) => Array.isArray(value));

  const day = Array.isArray(list)
    ? list.find(
        (item) =>
          Number(item?.weekday) === weekday || Number(item?.day) === weekday,
      )
    : null;

  if (!day) {
    return { start: DEFAULT_OPEN, end: DEFAULT_CLOSE, closed: false };
  }

  return {
    start: String(day.startTime || day.start || DEFAULT_OPEN).slice(0, 5),
    end: String(day.endTime || day.end || DEFAULT_CLOSE).slice(0, 5),
    closed: Boolean(day.closed),
  };
}

function appointmentDuration(row) {
  const duration = Number(row?.duration_minutes);
  if (Number.isFinite(duration) && duration > 0) {
    return duration;
  }

  const start = timeToMinutes(row?.starts_at);
  const end = timeToMinutes(row?.ends_at);
  if (end > start) {
    return end - start;
  }

  return 60;
}

function isOccupyingAppointment(row) {
  if (!row || row.cancelled_at) {
    return false;
  }

  return !["cancelled", "no_show", "done"].includes(String(row.status || ""));
}

function isDateTimeValid(date, time) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
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
      centers(name,settings),
      services(name)`,
    )
    .eq("confirmation_token_hash", hash)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function loadOccupiedSlots(supabase, centerId, fromDate, toDate, exceptId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("id,appointment_date,starts_at,ends_at,duration_minutes,room_id,status,cancelled_at")
    .eq("center_id", centerId)
    .gte("appointment_date", fromDate)
    .lte("appointment_date", toDate);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .filter((row) => row.id !== exceptId && isOccupyingAppointment(row))
    .map((row) => {
      const start = timeToMinutes(row.starts_at);
      const duration = appointmentDuration(row);
      return {
        date: String(row.appointment_date || "").slice(0, 10),
        start,
        end: start + duration,
        roomId: row.room_id || null,
      };
    });
}

async function loadRoomCount(supabase, centerId) {
  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("center_id", centerId);

  if (error) {
    return 0;
  }

  return (data ?? []).length;
}

function isSlotFree(occupied, date, start, end, roomId, roomCount) {
  const overlaps = occupied.filter(
    (item) =>
      item.date === date && rangesOverlap(start, end, item.start, item.end),
  );

  if (roomId) {
    return !overlaps.some((item) => item.roomId === roomId);
  }

  return overlaps.length < Math.max(1, roomCount);
}

function buildAvailableDays(row, occupied, roomCount, settings) {
  const now = parisNow();
  const duration = appointmentDuration(row);
  const roomId = row.room_id || null;
  const days = [];

  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const date = addDaysYmd(now.date, offset);
    const hours = hoursForDay(settings, weekdayFromYmd(date));

    if (hours.closed) {
      continue;
    }

    const open = timeToMinutes(hours.start);
    const close = timeToMinutes(hours.end);
    const times = [];
    const minStart =
      date === now.date ? now.minutes + MIN_LEAD_MINUTES : open;

    for (let start = open; start + duration <= close; start += SLOT_STEP) {
      if (start < minStart) {
        continue;
      }

      if (isSlotFree(occupied, date, start, start + duration, roomId, roomCount)) {
        times.push(minutesToTime(start));
      }
    }

    if (times.length > 0) {
      days.push({
        date,
        label: formatDayLabel(date),
        times,
      });
    }
  }

  return days;
}

async function syncLinkedLead(supabase, row, note) {
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
      status: "RDV confirmé",
      updated_at: now,
      last_activity_at: now,
    })
    .eq("id", lead.id);

  await supabase.from("lead_events").insert({
    center_id: row.center_id,
    lead_id: lead.id,
    event_type: "status",
    from_value: lead.status,
    to_value: "RDV confirmé",
    note,
  });
}

async function rescheduleSmsJobs(supabase, appointment) {
  const { data: center, error } = await supabase
    .from("centers")
    .select("id,settings")
    .eq("id", appointment.center_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!center?.id) {
    return;
  }

  const sms = parseCenterSmsSettings(center.settings);
  const jobs = sms.jobs.map((job) => {
    if (job?.appointmentId !== appointment.id || job?.status !== "pending") {
      return job;
    }

    if (!isAppointmentReminderKind(job.kind)) {
      return job;
    }

    return {
      ...job,
      sendAt: reminderSendAt(
        appointment.appointment_date,
        appointment.starts_at,
        reminderHoursForKind(job.kind, job.hoursBefore),
      ),
    };
  });

  await supabase
    .from("centers")
    .update({ settings: mergeCenterSmsSettings(center.settings, { jobs }) })
    .eq("id", appointment.center_id);
}

async function applyReschedule(supabase, row, date, time) {
  const currentState = readConfirmationState(row);

  if (!canRescheduleState(currentState)) {
    return { state: currentState, row };
  }

  const duration = appointmentDuration(row);
  const start = timeToMinutes(time);
  const end = start + duration;
  const today = parisDateOf(new Date());
  const lastDay = addDaysYmd(today, DAYS_AHEAD - 1);
  const center = relationObject(row.centers);
  const hours = hoursForDay(center?.settings, weekdayFromYmd(date));
  const clock = parisNow();

  if (
    date < today ||
    date > lastDay ||
    hours.closed ||
    start < timeToMinutes(hours.start) ||
    end > timeToMinutes(hours.end) ||
    (date === clock.date && start < clock.minutes + MIN_LEAD_MINUTES)
  ) {
    return {
      state: currentState,
      row,
      error: "unavailable",
    };
  }

  const [occupied, roomCount] = await Promise.all([
    loadOccupiedSlots(supabase, row.center_id, today, lastDay, row.id),
    loadRoomCount(supabase, row.center_id),
  ]);

  if (
    !isSlotFree(
      occupied,
      date,
      start,
      end,
      row.room_id || null,
      roomCount,
    )
  ) {
    return {
      state: currentState,
      row,
      error: "unavailable",
    };
  }

  const now = new Date().toISOString();
  const nextHistory = appendStatusHistory(row.status_history, {
    at: now,
    source: "client_link",
    action: "reschedule",
    from: `${String(row.appointment_date || "").slice(0, 10)}|${String(row.starts_at || "").slice(0, 5)}`,
    to: `${date}|${time}`,
  });
  const nextRow = {
    ...row,
    appointment_date: date,
    starts_at: time,
    ends_at: minutesToTime(end),
    duration_minutes: duration,
    status: "confirmed",
    confirmed_at: row.confirmed_at || now,
    client_response: CLIENT_CONFIRMED,
    confirmation_token_slot: appointmentSlot(date, time),
    confirmation_token_expires_at: confirmationExpiresAt(date),
    status_history: nextHistory,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("appointments")
    .update({
      appointment_date: date,
      starts_at: time,
      ends_at: minutesToTime(end),
      duration_minutes: duration,
      status: "confirmed",
      confirmed_at: row.confirmed_at || now,
      cancelled_at: null,
      client_response: CLIENT_CONFIRMED,
      confirmation_token_slot: appointmentSlot(date, time),
      confirmation_token_expires_at: confirmationExpiresAt(date),
      status_history: nextHistory,
      updated_at: now,
    })
    .eq("id", row.id)
    .is("cancelled_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { state: readConfirmationState(row), row };
  }

  await Promise.all([
    syncLinkedLead(
      supabase,
      row,
      `La cliente a modifié son rendez-vous depuis le lien SMS : ${formatPublicAppointmentDate(date)} à ${time}.`,
    ),
    rescheduleSmsJobs(supabase, nextRow).catch((jobError) => {
      console.error("[appointments/reschedule] sms jobs", jobError);
    }),
  ]);

  return { state: "rescheduled", row: nextRow };
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
    const date = String(firstValue(payload?.date) || "").trim();
    const time = String(firstValue(payload?.time) || "").trim();
    const limitKey = `${req.socket?.remoteAddress || "ip"}:${hashConfirmationToken(token).slice(0, 12)}`;

    if (!rateLimit(limitKey)) {
      return res.status(429).json({
        ok: false,
        state: "error",
        message: "Trop de tentatives. Réessayez dans un instant.",
        appointment: null,
        canReschedule: false,
        days: [],
      });
    }

    if (!token) {
      return res.status(200).json(jsonState("invalid", null, { days: [] }));
    }

    const supabase = createServiceClient();
    const row = await loadByToken(supabase, token);

    if (!row) {
      return res.status(404).json(jsonState("invalid", null, { days: [] }));
    }

    const state = readConfirmationState(row);
    const today = parisDateOf(new Date());
    const lastDay = addDaysYmd(today, DAYS_AHEAD - 1);
    const center = relationObject(row.centers);
    const [occupied, roomCount] = await Promise.all([
      loadOccupiedSlots(supabase, row.center_id, today, lastDay, row.id),
      loadRoomCount(supabase, row.center_id),
    ]);
    const days = canRescheduleState(state)
      ? buildAvailableDays(row, occupied, roomCount, center?.settings)
      : [];

    if (req.method === "GET") {
      return res.status(200).json(jsonState(state, row, { days }));
    }

    if (!canRescheduleState(state)) {
      return res.status(200).json(jsonState(state, row, { days }));
    }

    if (!isDateTimeValid(date, time)) {
      return res.status(400).json(
        jsonState(state, row, {
          days,
          message: "Choisissez une date et une heure valides.",
        }),
      );
    }

    const selectedDay = days.find((day) => day.date === date);
    if (!selectedDay?.times.includes(time)) {
      return res.status(409).json(
        jsonState(state, row, {
          days,
          message:
            "Ce créneau n’est plus disponible. Choisissez un autre horaire.",
        }),
      );
    }

    const result = await applyReschedule(supabase, row, date, time);

    if (result.error === "unavailable") {
      return res.status(409).json(
        jsonState(state, row, {
          days,
          message:
            "Ce créneau n’est plus disponible. Choisissez un autre horaire.",
        }),
      );
    }

    const message = `Votre rendez-vous a bien été déplacé au ${formatPublicAppointmentDate(date)} à ${time}.`;

    return res.status(200).json(
      jsonState(result.state, result.row, {
        days: [],
        canReschedule: true,
        message,
      }),
    );
  } catch (error) {
    console.error("[appointments/reschedule]", error);
    return res.status(500).json({
      ok: false,
      state: "error",
      message: stateMessage("error"),
      appointment: null,
      canReschedule: false,
      days: [],
    });
  }
};
