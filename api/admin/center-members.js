const { createClient } = require("@supabase/supabase-js");
const {
  isAttachableEmail,
  memberFromProfile,
  normalizeAttachEmail,
} = require("./center-members-lib");

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parsePayload(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

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

async function canManageCenter(supabase, userId, centerId) {
  const { data: admin } = await supabase
    .from("bookea_admins")
    .select("profile_id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (admin?.profile_id) {
    return true;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (String(profile?.role || "") === "bookea_admin") {
    return true;
  }

  const { data: member } = await supabase
    .from("center_members")
    .select("role")
    .eq("center_id", centerId)
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return ["owner", "manager"].includes(String(member?.role || ""));
}

async function findAuthUserByEmail(supabase, email) {
  if (typeof supabase.auth.admin.getUserByEmail === "function") {
    const { data, error } = await supabase.auth.admin.getUserByEmail(email);
    if (error && !/not found|unable to find|user not found/i.test(error.message || "")) {
      throw error;
    }
    return data?.user || null;
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw error;
    }
    const users = data?.users || [];
    const found = users.find(
      (user) => normalizeAttachEmail(user.email) === email,
    );
    if (found) {
      return found;
    }
    if (users.length < 200) {
      return null;
    }
  }
  return null;
}

async function findOrCreateProfile(supabase, email) {
  const { data: existing, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (profileError) {
    throw profileError;
  }
  if (existing?.id) {
    return existing;
  }

  const authUser = await findAuthUserByEmail(supabase, email);
  if (!authUser?.id) {
    return null;
  }

  const fullName =
    String(authUser.user_metadata?.full_name || "").trim() ||
    email.split("@")[0];
  const { data: upserted, error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email: authUser.email || email,
        full_name: fullName,
      },
      { onConflict: "id" },
    )
    .select("id,email,full_name,role")
    .single();
  if (upsertError) {
    throw upsertError;
  }
  return upserted;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const centerId = String(payload.centerId || "").trim();
    const email = normalizeAttachEmail(payload.email);

    if (!centerId) {
      return res.status(400).json({ ok: false, error: "Centre manquant." });
    }
    if (!isAttachableEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: "Email incomplet. Exemple : sandra.lucard@gmail.com",
      });
    }

    const supabase = createServiceClient();
    const caller = await requireUser(supabase, req);
    if (!caller) {
      return res.status(401).json({
        ok: false,
        error: "Reconnecte-toi pour rattacher un accès.",
      });
    }
    if (!(await canManageCenter(supabase, caller.id, centerId))) {
      return res.status(403).json({
        ok: false,
        error: "Cet accès ne peut pas être modifié depuis ce compte.",
      });
    }

    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select("id")
      .eq("id", centerId)
      .maybeSingle();
    if (centerError) {
      throw centerError;
    }
    if (!center?.id) {
      return res.status(404).json({ ok: false, error: "Centre introuvable." });
    }

    const profile = await findOrCreateProfile(supabase, email);
    if (!profile) {
      return res.status(404).json({
        ok: false,
        error:
          "Aucun compte Bookea avec cet email. La personne doit d’abord créer son compte sur la page connexion.",
      });
    }

    const { error: memberError } = await supabase.from("center_members").upsert(
      {
        center_id: centerId,
        profile_id: profile.id,
        role: "owner",
        is_active: true,
      },
      { onConflict: "center_id,profile_id" },
    );
    if (memberError) {
      throw memberError;
    }

    return res.status(200).json({
      ok: true,
      member: memberFromProfile(profile, "owner"),
    });
  } catch (error) {
    console.error("[admin/center-members]", error);
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Impossible de rattacher cet accès.",
    });
  }
};

module.exports.findOrCreateProfile = findOrCreateProfile;
module.exports.canManageCenter = canManageCenter;
