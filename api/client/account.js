const { createServiceClient } = require("../appointments/service");
const {
  appointmentStatusLabel,
  emptyAccount,
  formatSlot,
  isCancelledStatus,
  isPastAppointment,
} = require("./account-lib");

function bearerToken(req) {
  return String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function requireUser(supabase, req) {
  const token = bearerToken(req);
  if (!token) {
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return null;
  }
  return data.user;
}

function personFromUser(user) {
  const meta = user?.user_metadata || {};
  const full = String(meta.full_name || "").trim();
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    firstName: String(meta.first_name || parts[0] || "").trim(),
    lastName: String(meta.last_name || parts.slice(1).join(" ")).trim(),
    email: String(user?.email || "").trim().toLowerCase(),
    birthDate: String(meta.birthdate || "").slice(0, 10),
    address: String(meta.address || "").trim(),
    postalCode: String(meta.postal_code || "").trim(),
    city: String(meta.city || "").trim(),
  };
}

function relation(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

async function loadAccount(supabase, user) {
  const person = personFromUser(user);
  const account = emptyAccount(person);
  const email = person.email;

  let query = supabase
    .from("clients")
    .select(
      "id,center_id,first_name,last_name,email,phone,birthdate,address_line1,postal_code,city,shared_note,profile_user_id",
    )
    .is("merged_into_client_id", null);
  if (email) {
    query = query.or(`profile_user_id.eq.${user.id},email.eq.${email}`);
  } else {
    query = query.eq("profile_user_id", user.id);
  }

  const { data: clientRows, error: clientError } = await query;
  if (clientError) {
    throw new Error(clientError.message);
  }

  const clients = clientRows || [];
  if (clients.length === 0) {
    return account;
  }

  const named = clients.find((row) => row.first_name || row.last_name);
  if (named) {
    account.firstName = named.first_name || account.firstName;
    account.lastName = named.last_name || account.lastName;
    account.displayName =
      [account.firstName, account.lastName].filter(Boolean).join(" ").trim() ||
      account.displayName;
  }
  if (!account.email && clients[0]?.email) {
    account.email = String(clients[0].email).toLowerCase();
  }
  const detailed = clients.find(
    (row) => row.birthdate || row.address_line1 || row.postal_code || row.city,
  );
  const profileSource = detailed || named || clients[0];
  if (profileSource) {
    account.birthDate =
      String(profileSource.birthdate || account.birthDate || "").slice(0, 10);
    account.address =
      String(profileSource.address_line1 || account.address || "").trim();
    account.postalCode =
      String(profileSource.postal_code || account.postalCode || "").trim();
    account.city = String(profileSource.city || account.city || "").trim();
  }

  for (const row of clients) {
    if (!row.profile_user_id) {
      await supabase
        .from("clients")
        .update({ profile_user_id: user.id })
        .eq("id", row.id)
        .is("profile_user_id", null);
    }
  }

  const clientIds = clients.map((row) => row.id);
  const centerIds = [...new Set(clients.map((row) => row.center_id).filter(Boolean))];

  const [appointmentsResult, centersResult, loyaltyResult, conversationsResult] =
    await Promise.all([
      supabase
        .from("appointments")
        .select(
          `
            id,
            center_id,
            client_id,
            appointment_date,
            starts_at,
            duration_minutes,
            status,
            services(name),
            rooms(name),
            practitioners(first_name,last_name)
          `,
        )
        .in("client_id", clientIds)
        .order("appointment_date", { ascending: true })
        .order("starts_at", { ascending: true }),
      supabase.from("centers").select("id,name").in("id", centerIds),
      supabase
        .from("loyalty_events")
        .select("points,reason,center_id")
        .in("client_id", clientIds),
      supabase
        .from("conversations")
        .select("id,center_id,client_id,last_message_at")
        .in("client_id", clientIds),
    ]);

  if (appointmentsResult.error) {
    throw new Error(appointmentsResult.error.message);
  }

  const centerName = new Map(
    (centersResult.data || []).map((row) => [row.id, row.name || "Centre"]),
  );

  const now = new Date();
  for (const row of appointmentsResult.data || []) {
    if (isCancelledStatus(row.status)) {
      continue;
    }
    const service = relation(row.services);
    const room = relation(row.rooms);
    const practitioner = relation(row.practitioners);
    const practitionerName = [practitioner?.first_name, practitioner?.last_name]
      .filter(Boolean)
      .join(" ");
    const card = {
      id: row.id,
      centerId: row.center_id,
      center: centerName.get(row.center_id) || "Centre",
      service: service?.name || "Soin",
      date: formatSlot(row.appointment_date, row.starts_at),
      time: String(row.starts_at || "").slice(0, 5),
      isoDate: String(row.appointment_date || "").slice(0, 10),
      detail: [room?.name, practitionerName].filter(Boolean).join(" · "),
      status: appointmentStatusLabel(row.status),
    };
    if (isPastAppointment(row, now)) {
      account.past.push(card);
    } else {
      account.upcoming.push(card);
    }
  }
  account.past.reverse();

  account.centers = centerIds.map((id) => ({
    id,
    name: centerName.get(id) || "Centre",
    clientId: clients.find((row) => row.center_id === id)?.id || "",
  }));

  const points = (loyaltyResult.data || []).reduce(
    (sum, item) => sum + Number(item.points || 0),
    0,
  );
  account.loyalty.points = Number.isFinite(points) ? points : 0;
  account.loyalty.notes = clients
    .map((row) => String(row.shared_note || "").trim())
    .filter(Boolean);

  const conversationIds = (conversationsResult.data || []).map((row) => row.id);
  let messages = [];
  if (conversationIds.length > 0) {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id,conversation_id,center_id,sender_client_id,sender_profile_id,body,created_at",
      )
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    messages = data || [];
  }

  account.threads = (conversationsResult.data || []).map((conversation) => {
    const center = account.centers.find((item) => item.id === conversation.center_id);
    return {
      id: conversation.id,
      centerId: conversation.center_id,
      centerName: center?.name || centerName.get(conversation.center_id) || "Centre",
      messages: messages
        .filter((item) => item.conversation_id === conversation.id)
        .map((item) => ({
          id: item.id,
          side: item.sender_client_id ? "client" : "center",
          author: item.sender_client_id
            ? "Vous"
            : centerName.get(item.center_id) || "Le centre",
          text: item.body,
          at: item.created_at,
        })),
    };
  });

  return account;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createServiceClient();
    const user = await requireUser(supabase, req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const account = await loadAccount(supabase, user);
    return res.status(200).json(account);
  } catch (error) {
    console.error("[client/account]", error);
    return res.status(500).json({ error: "account_failed" });
  }
};

module.exports.requireUser = requireUser;
module.exports.loadAccount = loadAccount;
module.exports.personFromUser = personFromUser;
