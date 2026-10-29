/** Utilisateur Bookea connecté et membre actif du centre (ou admin Bookea). */
async function staffCanUseCenter(supabase, req, centerId) {
  const token = String(req.headers?.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token || !centerId) {
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) {
    return null;
  }
  const [{ data: admin }, { data: member }] = await Promise.all([
    supabase.from("bookea_admins").select("profile_id").eq("profile_id", userId).maybeSingle(),
    supabase
      .from("center_members")
      .select("profile_id")
      .eq("center_id", centerId)
      .eq("profile_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  return admin?.profile_id || member?.profile_id ? { userId } : null;
}

module.exports = { staffCanUseCenter };
