const { canOpenWebkPilotage } = require("./webk-logic");

function bearerToken(req) {
  return String(req?.headers?.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

/**
 * Réservé à Samantha, Cynthia et au compte admin Bookea.
 * Un autre admin, ou un centre nommé Samantha, est refusé.
 */
async function requireWebkPilotage(supabase, req) {
  const token = bearerToken(req);
  if (!token) {
    return { ok: false, status: 401 };
  }
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id) {
    return { ok: false, status: 401 };
  }

  const [{ data: admin }, { data: profile }] = await Promise.all([
    supabase
      .from("bookea_admins")
      .select("label")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const allowed = canOpenWebkPilotage({
    isAdmin: Boolean(admin),
    email: user.email,
    fullName: profile?.full_name,
    adminLabel: admin?.label,
  });
  if (!allowed) {
    return { ok: false, status: 403 };
  }

  const authorName =
    String(profile?.full_name || admin?.label || "").trim() ||
    String(user.email || "").split("@")[0] ||
    "Équipe WEBK";

  return {
    ok: true,
    status: 200,
    userId: user.id,
    email: user.email || "",
    authorName,
  };
}

module.exports = {
  bearerToken,
  requireWebkPilotage,
};
