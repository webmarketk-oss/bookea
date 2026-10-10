const {
  createServiceClient,
  parsePayload,
  rateLimit,
} = require("../appointments/service");
const { appendStatusHistory } = require("../appointments/token-utils");
const { alreadyNotified, eventNotifyKey } = require("../center/event-copy");
const { notifyAppointmentEvent } = require("../center/event-notify");

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

async function findCenter(supabase, slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const bySlug = await supabase
    .from("centers")
    .select("id,name,email,settings,slug")
    .eq("slug", normalized)
    .maybeSingle();
  if (bySlug.data?.id) {
    return bySlug.data;
  }
  const byPublic = await supabase
    .from("centers")
    .select("id,name,email,settings,slug")
    .eq("public_slug", normalized)
    .maybeSingle();
  return byPublic.data || null;
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
    const match = (data || []).find(
      (row) => last9Phone(row.phone) === phoneKey,
    );
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
    supabase
      .from("practitioners")
      .select("id")
      .eq("center_id", centerId)
      .limit(1),
  ]);
  return {
    roomId: rooms?.[0]?.id || null,
    practitionerId: staff?.[0]?.id || null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const slug = String(payload.slug || "").trim().toLowerCase();
    const bookingId = String(payload.bookingId || payload.id || "").trim();
    const firstName = String(payload.firstName || "").trim();
    const lastName = String(payload.lastName || "").trim();
    const phone = String(payload.phone || "").trim();
    const email = String(payload.email || "").trim();
    const treatment = String(payload.treatment || "").trim();
    const date = String(payload.date || "").slice(0, 10);
    const start = String(payload.start || payload.time || "").slice(0, 5);
    const duration = Number(payload.duration) > 0 ? Number(payload.duration) : 60;

    if (!rateLimit(`public-booking:${req.socket?.remoteAddress || "ip"}`, 12, 60_000)) {
      return res.status(429).json({ ok: false, error: "too_many_requests" });
    }
    if (
      !slug ||
      !firstName ||
      !lastName ||
      !phone ||
      !email ||
      !treatment ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(start)
    ) {
      return res.status(400).json({ ok: false, error: "invalid_booking" });
    }

    const supabase = createServiceClient();
    const center = await findCenter(supabase, slug);
    if (!center?.id) {
      return res.status(404).json({ ok: false, error: "unknown_center" });
    }

    if (bookingId) {
      const { data: existing } = await supabase
        .from("appointments")
        .select(
          "id,center_id,appointment_date,starts_at,status_history,services(name),clients(first_name,last_name),centers(name)",
        )
        .eq("center_id", center.id)
        .like("notes", `%booking:${bookingId}%`)
        .maybeSingle();
      if (existing?.id) {
        const key = eventNotifyKey("appointment_booked", {
          id: existing.id,
          date: existing.appointment_date,
          time: existing.starts_at,
        });
        if (!alreadyNotified(existing.status_history, key)) {
          await notifyAppointmentEvent(
            supabase,
            existing,
            "appointment_booked",
            "public_bookea",
            {
              personName: `${firstName} ${lastName}`.trim(),
              treatment,
              date: String(existing.appointment_date || date).slice(0, 10),
              time: String(existing.starts_at || start).slice(0, 5),
              centerName: center.name,
            },
          ).catch((notifyError) => {
            console.error("[public/booking] center notify retry", notifyError);
          });
        }
        return res.status(200).json({ ok: true, appointmentId: existing.id, already: true });
      }
    }

    const now = new Date().toISOString();
    const [clientId, serviceId, assignment] = await Promise.all([
      findOrCreateClient(supabase, center.id, { firstName, lastName, phone, email }),
      findOrCreateService(supabase, center.id, treatment, duration),
      firstRoomAndPractitioner(supabase, center.id),
    ]);
    const history = appendStatusHistory([], {
      at: now,
      source: "public_bookea",
      action: "book",
      to: `${date}|${start}`,
    });
    const { data: appointment, error } = await supabase
      .from("appointments")
      .insert({
        center_id: center.id,
        client_id: clientId,
        service_id: serviceId,
        room_id: assignment.roomId,
        practitioner_id: assignment.practitionerId,
        appointment_date: date,
        starts_at: start,
        ends_at: addMinutes(start, duration),
        duration_minutes: duration,
        status: "confirmed",
        origin: "public_bookea",
        notes: `Réservation publique Bookea.${bookingId ? ` booking:${bookingId}` : ""}`,
        confirmed_at: now,
        status_history: history,
        updated_at: now,
      })
      .select(
        "id,center_id,appointment_date,starts_at,status_history,services(name),clients(first_name,last_name),centers(name)",
      )
      .single();
    if (error) {
      throw new Error(error.message);
    }

    await notifyAppointmentEvent(
      supabase,
      appointment,
      "appointment_booked",
      "public_bookea",
      {
        personName: `${firstName} ${lastName}`.trim(),
        treatment,
        date,
        time: start,
        centerName: center.name,
        statusHistory: history,
      },
    ).catch((notifyError) => {
      console.error("[public/booking] center notify", notifyError);
    });

    return res.status(200).json({ ok: true, appointmentId: appointment.id });
  } catch (error) {
    console.error("[public/booking]", error);
    return res.status(500).json({ ok: false, error: "booking_failed" });
  }
};
