/**
 * API partenaire Bookea (lecture seule) : authentification par clé, filtres, format des rendez-vous.
 * Aucune donnée client n'est exposée : ni nom, ni téléphone, ni soin, ni notes.
 */
const crypto = require("node:crypto");

const DEFAULT_TIMEZONE = "Europe/Paris";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_SPAN_DAYS = 90;
const MAX_SPAN_DAYS = 366;
const READ_SCOPE = "appointments:read";
// Créneaux importés depuis un partenaire : jamais renvoyés aux partenaires (pas d'aller-retour).
const PARTNER_IMPORT_ORIGIN = "partner_import";
const BLOCK_KIND = /\[kind:(Pause|Formation|Indisponible)\]/;
// Colonne « Annulation » de l'agenda : les rendez-vous qui y sont rangés ne bloquent pas de créneau.
const CANCELLATION_ROOM = /annul/i;

function isCancellationRoom(name) {
  return CANCELLATION_ROOM.test(String(name || ""));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_FORMAT = /^bkp_([0-9a-f]{12})_([0-9a-f]{48})$/;

class PartnerApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function readApiKey(req) {
  const header = String(req.headers?.authorization || "").trim();
  if (/^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }
  return String(req.headers?.["x-api-key"] || "").trim();
}

/** Clé valide, non révoquée, avec le droit de lecture. Sinon PartnerApiError 401/403. */
async function authenticatePartner(supabase, req, now = new Date()) {
  const key = readApiKey(req);
  const match = KEY_FORMAT.exec(key);
  if (!match) {
    throw new PartnerApiError(401, "invalid_api_key", "Clé API absente ou mal formée.");
  }
  const { data, error } = await supabase
    .from("partner_api_keys")
    .select("id,partner_name,key_hash,center_ids,room_ids,scopes,revoked_at,last_used_at")
    .eq("key_prefix", match[1])
    .maybeSingle();
  if (error) {
    throw new PartnerApiError(500, "auth_unavailable", "Vérification de la clé impossible.");
  }
  const expected = Buffer.from(String(data?.key_hash || ""), "utf8");
  const received = Buffer.from(sha256Hex(key), "utf8");
  if (
    !data ||
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    throw new PartnerApiError(401, "invalid_api_key", "Clé API inconnue.");
  }
  if (data.revoked_at) {
    throw new PartnerApiError(401, "revoked_api_key", "Clé API révoquée.");
  }
  if (!(data.scopes || []).includes(READ_SCOPE)) {
    throw new PartnerApiError(403, "insufficient_scope", "Cette clé n'a pas accès aux rendez-vous.");
  }
  const lastUsed = Date.parse(String(data.last_used_at || ""));
  if (!Number.isFinite(lastUsed) || now.getTime() - lastUsed > 5 * 60 * 1000) {
    void Promise.resolve(
      supabase
        .from("partner_api_keys")
        .update({ last_used_at: now.toISOString() })
        .eq("id", data.id),
    ).catch(() => null);
  }
  return {
    id: String(data.id),
    partnerName: String(data.partner_name || ""),
    centerIds: (data.center_ids || []).map(String),
    roomIds: Array.isArray(data.room_ids) && data.room_ids.length ? data.room_ids.map(String) : null,
  };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Date du jour dans le fuseau du centre. */
function todayIn(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Postgres date à la microseconde : comparer en millisecondes ferait sauter des lignes. */
function toMicros(value) {
  const text = String(value || "");
  const ms = Date.parse(text);
  const fraction = /\.(\d+)/.exec(text)?.[1] || "";
  const extra = Number((fraction + "000000").slice(3, 6));
  return BigInt(ms) * 1000n + BigInt(extra);
}

function encodeCursor(row) {
  return Buffer.from(`${row.updated_at}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(value) {
  try {
    const [updatedAt, id] = Buffer.from(String(value), "base64url").toString("utf8").split("|");
    if (!Number.isFinite(Date.parse(updatedAt)) || !UUID.test(id || "")) {
      return null;
    }
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function firstQuery(value) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

/** Filtres de /appointments, vérifiés contre les droits de la clé. */
function parseAppointmentFilters(query, access, { now = new Date(), timezone = DEFAULT_TIMEZONE } = {}) {
  const calendarId = firstQuery(query.calendar_id).trim();
  const roomId = firstQuery(query.room_id).trim();
  const fromRaw = firstQuery(query.from).trim();
  const toRaw = firstQuery(query.to).trim();
  const updatedSinceRaw = firstQuery(query.updated_since).trim();
  const cursorRaw = firstQuery(query.cursor).trim();
  const limitRaw = firstQuery(query.limit).trim();

  if (calendarId && !UUID.test(calendarId)) {
    throw new PartnerApiError(400, "invalid_calendar_id", "calendar_id doit être un identifiant d'agenda.");
  }
  if (calendarId && !access.centerIds.includes(calendarId)) {
    throw new PartnerApiError(403, "calendar_not_allowed", "Cet agenda n'est pas autorisé pour cette clé.");
  }
  if (roomId && !UUID.test(roomId)) {
    throw new PartnerApiError(400, "invalid_room_id", "room_id doit être un identifiant de cabine.");
  }
  if (roomId && access.roomIds && !access.roomIds.includes(roomId)) {
    throw new PartnerApiError(403, "room_not_allowed", "Cette cabine n'est pas autorisée pour cette clé.");
  }
  for (const [name, value] of [["from", fromRaw], ["to", toRaw]]) {
    if (value && !isIsoDate(value)) {
      throw new PartnerApiError(400, `invalid_${name}`, `${name} doit être une date AAAA-MM-JJ.`);
    }
  }
  let updatedSince = null;
  if (updatedSinceRaw) {
    const parsed = Date.parse(updatedSinceRaw);
    if (!Number.isFinite(parsed)) {
      throw new PartnerApiError(400, "invalid_updated_since", "updated_since doit être une date-heure ISO 8601.");
    }
    updatedSince = new Date(parsed).toISOString();
  }
  let limit = DEFAULT_LIMIT;
  if (limitRaw) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new PartnerApiError(400, "invalid_limit", `limit doit être un entier entre 1 et ${MAX_LIMIT}.`);
    }
  }
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    throw new PartnerApiError(400, "invalid_cursor", "cursor invalide.");
  }

  // Sans updated_since : une période (par défaut aujourd'hui → +90 jours).
  // Avec updated_since : toutes les modifications, éventuellement restreintes à une période.
  let from = fromRaw || null;
  let to = toRaw || null;
  if (!updatedSince || from || to) {
    from = from || todayIn(timezone, now);
    to = to || addDays(from, DEFAULT_SPAN_DAYS);
    if (to < from) {
      throw new PartnerApiError(400, "invalid_period", "to doit être après from.");
    }
    if (daysBetween(from, to) > MAX_SPAN_DAYS) {
      throw new PartnerApiError(400, "period_too_long", `La période ne peut pas dépasser ${MAX_SPAN_DAYS} jours.`);
    }
  }

  return {
    centerIds: calendarId ? [calendarId] : access.centerIds,
    roomIds: roomId ? [roomId] : access.roomIds,
    from,
    to,
    updatedSince,
    cursor,
    limit,
  };
}

/** Offset (minutes) du fuseau à un instant donné, ex. +60 pour Paris en hiver. */
function offsetMinutes(timezone, instant) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) {
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "-" ? -minutes : minutes;
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** « 2026-10-28 » + « 09:30 » à Paris → « 2026-10-28T09:30:00+01:00 ». */
function localToIso(date, time, timezone = DEFAULT_TIMEZONE) {
  const [hours, minutes, seconds] = String(time || "00:00").split(":").map((part) => Number(part || 0));
  const wallClock = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours,
    minutes,
    seconds || 0,
  );
  let offset = offsetMinutes(timezone, new Date(wallClock));
  offset = offsetMinutes(timezone, new Date(wallClock - offset * 60000));
  const pad = (value) => String(value).padStart(2, "0");
  return `${date}T${pad(hours)}:${pad(minutes)}:${pad(seconds || 0)}${formatOffset(offset)}`;
}

/** Instant ISO → date et heure locales du centre (pour importer un créneau partenaire). */
function isoToLocal(iso, timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function addMinutesToTime(time, minutes) {
  const [h, m] = String(time).split(":").map(Number);
  const total = h * 60 + m + Number(minutes || 0);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

/** Ligne appointments → format partenaire, sans donnée personnelle. */
function toPartnerAppointment(row, timezone = DEFAULT_TIMEZONE, { cancellationRooms } = {}) {
  const date = String(row.appointment_date).slice(0, 10);
  const start = String(row.starts_at || "00:00:00");
  let end = String(row.ends_at || "");
  if (!end || end <= start) {
    end = addMinutesToTime(start, row.duration_minutes || 0);
  }
  const block = BLOCK_KIND.exec(String(row.notes || ""));
  const inCancellationRoom = Boolean(row.room_id && cancellationRooms?.has(String(row.room_id)));
  const status = inCancellationRoom ? "cancelled" : String(row.status || "confirmed");
  return {
    id: String(row.id),
    calendar_id: String(row.center_id),
    room_id: row.room_id ? String(row.room_id) : null,
    type: block ? "block" : "appointment",
    ...(block ? { block_kind: block[1] } : {}),
    start: localToIso(date, start, timezone),
    end: localToIso(date, end, timezone),
    timezone,
    status,
    cancelled: status === "cancelled",
    deleted: false,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function toPartnerDeletion(row, timezone = DEFAULT_TIMEZONE) {
  const date = row.appointment_date ? String(row.appointment_date).slice(0, 10) : null;
  return {
    id: String(row.appointment_id),
    calendar_id: String(row.center_id),
    room_id: row.room_id ? String(row.room_id) : null,
    start: date && row.starts_at ? localToIso(date, row.starts_at, timezone) : null,
    end: date && row.ends_at ? localToIso(date, row.ends_at, timezone) : null,
    timezone,
    status: "deleted",
    cancelled: true,
    deleted: true,
    updated_at: new Date(row.deleted_at).toISOString(),
  };
}

async function loadCenterTimezones(supabase, centerIds) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,timezone:settings->>timezone")
    .in("id", centerIds);
  if (error) {
    throw new PartnerApiError(500, "calendars_unavailable", "Agendas indisponibles.");
  }
  const byId = new Map();
  for (const center of data || []) {
    byId.set(String(center.id), {
      name: String(center.name || ""),
      timezone: String(center.timezone || "").trim() || DEFAULT_TIMEZONE,
    });
  }
  return byId;
}

/**
 * Rendez-vous filtrés, triés par dernière modification puis identifiant (pagination stable).
 * Les suppressions sont renvoyées sur la première page quand updated_since est fourni.
 */
async function loadCancellationRooms(supabase, centerIds) {
  const { data, error } = await supabase
    .from("rooms")
    .select("id,name")
    .in("center_id", centerIds);
  if (error) {
    throw new PartnerApiError(500, "calendars_unavailable", "Agendas indisponibles.");
  }
  return new Set(
    (data || []).filter((room) => isCancellationRoom(room.name)).map((room) => String(room.id)),
  );
}

async function listPartnerAppointments(supabase, filters) {
  const [centers, cancellationRooms] = await Promise.all([
    loadCenterTimezones(supabase, filters.centerIds),
    loadCancellationRooms(supabase, filters.centerIds),
  ]);
  let query = supabase
    .from("appointments")
    .select("id,center_id,room_id,appointment_date,starts_at,ends_at,duration_minutes,status,notes,origin,created_at,updated_at")
    .in("center_id", filters.centerIds)
    .neq("origin", PARTNER_IMPORT_ORIGIN);
  if (filters.roomIds) {
    query = query.in("room_id", filters.roomIds);
  }
  if (filters.from) {
    query = query.gte("appointment_date", filters.from);
  }
  if (filters.to) {
    query = query.lte("appointment_date", filters.to);
  }
  const since = filters.cursor?.updatedAt || filters.updatedSince;
  if (since) {
    query = query.gte("updated_at", since);
  }
  const { data, error } = await query
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(filters.limit + 50);
  if (error) {
    throw new PartnerApiError(500, "appointments_unavailable", "Rendez-vous indisponibles.");
  }

  const rows = (data || []).filter((row) => {
    if (!filters.cursor) {
      return true;
    }
    const at = toMicros(row.updated_at);
    const cursorAt = toMicros(filters.cursor.updatedAt);
    return at > cursorAt || (at === cursorAt && String(row.id) > filters.cursor.id);
  });
  const page = rows.slice(0, filters.limit);
  const hasMore = rows.length > filters.limit;
  const timezoneOf = (centerId) => centers.get(String(centerId))?.timezone || DEFAULT_TIMEZONE;

  let deleted = [];
  if (filters.updatedSince && !filters.cursor) {
    let deletions = supabase
      .from("appointment_deletions")
      .select("appointment_id,center_id,room_id,appointment_date,starts_at,ends_at,deleted_at")
      .in("center_id", filters.centerIds)
      .gte("deleted_at", filters.updatedSince);
    if (filters.roomIds) {
      deletions = deletions.in("room_id", filters.roomIds);
    }
    if (filters.from) {
      deletions = deletions.gte("appointment_date", filters.from);
    }
    if (filters.to) {
      deletions = deletions.lte("appointment_date", filters.to);
    }
    const { data: removed, error: removedError } = await deletions
      .order("deleted_at", { ascending: true })
      .limit(1000);
    if (removedError) {
      throw new PartnerApiError(500, "appointments_unavailable", "Rendez-vous indisponibles.");
    }
    deleted = (removed || []).map((row) => toPartnerDeletion(row, timezoneOf(row.center_id)));
  }

  return {
    data: page.map((row) =>
      toPartnerAppointment(row, timezoneOf(row.center_id), { cancellationRooms }),
    ),
    deleted,
    next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
}

function sendError(res, error) {
  const status = error instanceof PartnerApiError ? error.status : 500;
  const code = error instanceof PartnerApiError ? error.code : "internal_error";
  const message = error instanceof PartnerApiError ? error.message : "Erreur interne.";
  return res.status(status).json({ error: { code, message } });
}

/** Lecture seule : tout autre verbe que GET est refusé. */
function rejectNonGet(req, res) {
  if (req.method === "GET") {
    return false;
  }
  res.setHeader("Allow", "GET");
  res.status(405).json({
    error: { code: "method_not_allowed", message: "Accès en lecture seule (GET uniquement)." },
  });
  return true;
}

module.exports = {
  DEFAULT_TIMEZONE,
  MAX_LIMIT,
  PARTNER_IMPORT_ORIGIN,
  PartnerApiError,
  authenticatePartner,
  decodeCursor,
  encodeCursor,
  isCancellationRoom,
  isoToLocal,
  listPartnerAppointments,
  loadCenterTimezones,
  localToIso,
  parseAppointmentFilters,
  rejectNonGet,
  sendError,
  sha256Hex,
  toPartnerAppointment,
  todayIn,
};
