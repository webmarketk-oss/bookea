async function canManageCenterBilling(supabase, req, centerId) {
  const token = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return false;
  }
  const { data, error } = await supabase.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) {
    return false;
  }
  const [{ data: admin }, { data: member }] = await Promise.all([
    supabase
      .from("bookea_admins")
      .select("profile_id")
      .eq("profile_id", userId)
      .maybeSingle(),
    supabase
      .from("center_members")
      .select("profile_id")
      .eq("center_id", centerId)
      .eq("profile_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  return Boolean(admin?.profile_id || member?.profile_id);
}

module.exports = { canManageCenterBilling };
