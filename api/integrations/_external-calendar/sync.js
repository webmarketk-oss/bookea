/**
 * Exécute la synchronisation d'une connexion partenaire (lecture de leurs rendez-vous).
 * Rien n'est écrit chez le partenaire. Côté Bookea :
 *  - mode « read »   : table external_appointments seulement ;
 *  - mode « import » : en plus, un créneau « Indisponible » par rendez-vous, dans la cabine liée.
 */
const { createExternalCalendarClient, ExternalCalendarError } = require("./client");
const { planExternalSync } = require("./sync-plan");
const { DEFAULT_TIMEZONE, PARTNER_IMPORT_ORIGIN, isoToLocal } = require("../../partner/_lib");

const BLOCK_CLIENT = {
  first_name: "Agenda",
  last_name: "Partenaire",
  private_note: "[agenda-block] Créneaux importés depuis un agenda partenaire.",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function addDaysIso(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function minutesBetween(startTime, endTime) {
  const toMinutes = (time) => {
    const [h, m] = String(time).split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(0, toMinutes(endTime) - toMinutes(startTime));
}

async function unwrap(promise, context) {
  const { data, error } = await promise;
  if (error) {
    throw new ExternalCalendarError("bookea_db_error", `${context} : ${error.message}`);
  }
  return data;
}

async function ensureBlockClient(supabase, centerId) {
  const found = await unwrap(
    supabase
      .from("clients")
      .select("id")
      .eq("center_id", centerId)
      .eq("first_name", BLOCK_CLIENT.first_name)
      .eq("last_name", BLOCK_CLIENT.last_name)
      .limit(1),
    "client agenda partenaire",
  );
  if (found?.[0]?.id) {
    return found[0].id;
  }
  const created = await unwrap(
    supabase.from("clients").insert({ center_id: centerId, ...BLOCK_CLIENT }).select("id").single(),
    "création client agenda partenaire",
  );
  return created.id;
}

/** Créneau Bookea pour un rendez-vous partenaire (même jour ; fin ramenée à 23:59 sinon). */
function blockFields(connection, item, mapping, timezone) {
  const start = isoToLocal(item.start, timezone);
  const end = isoToLocal(item.end, timezone);
  const endsAt = end.date === start.date ? end.time : "23:59:00";
  return {
    room_id: mapping?.room_id || null,
    practitioner_id: mapping?.practitioner_id || null,
    appointment_date: start.date,
    starts_at: start.time,
    ends_at: endsAt,
    duration_minutes: minutesBetween(start.time, endsAt),
    notes: `[kind:Indisponible]\nRendez-vous partenaire (${connection.provider} #${item.externalId})`,
  };
}

async function runConnectionSync(
  supabase,
  connection,
  { now = new Date(), env, fetchImpl, registry, daysBack = 1, daysAhead = 60 } = {},
) {
  const client = createExternalCalendarClient(connection, { env, fetchImpl, registry });
  const from = addDaysIso(now, -daysBack);
  const to = addDaysIso(now, daysAhead);

  const items = await client.listAppointments({
    from,
    to,
    updatedSince: connection.last_synced_at || null,
  });

  const [mappingRows, existingRows, centerRows] = await Promise.all([
    unwrap(
      supabase
        .from("external_calendar_mappings")
        .select("external_calendar_id,room_id,practitioner_id")
        .eq("connection_id", connection.id),
      "correspondances d'agendas",
    ),
    unwrap(
      supabase
        .from("external_appointments")
        .select("external_id,external_calendar_id,starts_at,ends_at,status,appointment_id")
        .eq("connection_id", connection.id)
        .limit(10000),
      "rendez-vous partenaire connus",
    ),
    unwrap(
      supabase.from("centers").select("id,timezone:settings->>timezone").eq("id", connection.center_id),
      "centre",
    ),
  ]);
  const timezone = String(centerRows?.[0]?.timezone || "").trim() || DEFAULT_TIMEZONE;
  const mappings = new Map(
    (mappingRows || []).map((row) => [String(row.external_calendar_id), row]),
  );
  const existing = new Map((existingRows || []).map((row) => [String(row.external_id), row]));

  const refs = [...new Set(items.map((item) => String(item.sourceRef || "").toLowerCase()))].filter(
    (ref) => UUID.test(ref),
  );
  const bookeaIds = new Set();
  if (refs.length) {
    const ours = await unwrap(
      supabase.from("appointments").select("id").eq("center_id", connection.center_id).in("id", refs),
      "rendez-vous Bookea",
    );
    for (const row of ours || []) {
      bookeaIds.add(String(row.id).toLowerCase());
    }
  }

  // Une relecture incrémentale ne renvoie pas tout : on ne déduit les suppressions que sur une relecture complète.
  const fullWindow = connection.last_synced_at ? null : { from, to };
  const actions = planExternalSync({
    mode: connection.mode,
    items,
    existing,
    mappings,
    bookeaIds,
    fullWindow,
  });

  const importMode = connection.mode === "import";
  const blockClientId =
    importMode && actions.some((action) => action.kind === "create")
      ? await ensureBlockClient(supabase, connection.center_id)
      : null;
  const stamp = now.toISOString();
  const counts = { create: 0, update: 0, cancel: 0, unchanged: 0, skip: 0 };

  for (const action of actions) {
    counts[action.kind] += 1;
    if (action.kind === "skip" || action.kind === "unchanged") {
      continue;
    }

    if (action.kind === "cancel") {
      await unwrap(
        supabase
          .from("external_appointments")
          .update({ status: "cancelled", last_seen_at: stamp, updated_at: stamp })
          .eq("connection_id", connection.id)
          .eq("external_id", action.existing.external_id),
        "annulation rendez-vous partenaire",
      );
      if (importMode && action.existing.appointment_id) {
        await unwrap(
          supabase
            .from("appointments")
            .update({ status: "cancelled" })
            .eq("id", action.existing.appointment_id)
            .eq("origin", PARTNER_IMPORT_ORIGIN),
          "annulation créneau importé",
        );
      }
      continue;
    }

    const { item, mapping } = action;
    let appointmentId = action.existing?.appointment_id || null;
    if (importMode) {
      const fields = blockFields(connection, item, mapping, timezone);
      if (appointmentId) {
        await unwrap(
          supabase
            .from("appointments")
            .update({ ...fields, status: "confirmed" })
            .eq("id", appointmentId)
            .eq("origin", PARTNER_IMPORT_ORIGIN),
          "mise à jour créneau importé",
        );
      } else {
        const created = await unwrap(
          supabase
            .from("appointments")
            .insert({
              center_id: connection.center_id,
              client_id: blockClientId,
              status: "confirmed",
              origin: PARTNER_IMPORT_ORIGIN,
              ...fields,
            })
            .select("id")
            .single(),
          "création créneau importé",
        );
        appointmentId = created.id;
      }
    }

    await unwrap(
      supabase.from("external_appointments").upsert(
        {
          connection_id: connection.id,
          external_id: item.externalId,
          external_calendar_id: item.calendarId ? String(item.calendarId) : null,
          starts_at: new Date(item.start).toISOString(),
          ends_at: new Date(item.end).toISOString(),
          timezone: item.timezone || null,
          status: "confirmed",
          external_updated_at: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
          appointment_id: appointmentId,
          last_seen_at: stamp,
          updated_at: stamp,
        },
        { onConflict: "connection_id,external_id" },
      ),
      "enregistrement rendez-vous partenaire",
    );
  }

  await unwrap(
    supabase
      .from("external_calendar_connections")
      .update({ last_synced_at: stamp, last_error: null, updated_at: stamp })
      .eq("id", connection.id),
    "connexion partenaire",
  );

  return { connectionId: connection.id, mode: connection.mode, counts };
}

module.exports = { blockFields, runConnectionSync };
