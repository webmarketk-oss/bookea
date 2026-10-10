const {
  createServiceClient,
  parsePayload,
  sanitizeId,
} = require("../center/_stripe-lib");
const { invoiceCenterAlert } = require("./_subscription-invoice");

async function canInvoiceCenter(supabase, req, centerId) {
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

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const payload = parsePayload(req.body);
  const centerId = sanitizeId(payload.centerId);
  const alertId = sanitizeId(payload.alertId);
  if (!centerId || !alertId) {
    return res.status(400).json({ ok: false, error: "Souscription introuvable." });
  }

  try {
    const supabase = createServiceClient();
    if (!(await canInvoiceCenter(supabase, req, centerId))) {
      return res.status(403).json({ ok: false, error: "Accès refusé." });
    }
    const result = await invoiceCenterAlert(supabase, { centerId, alertId });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[billing/subscription-invoice]", error);
    return res.status(Number(error?.status) || 500).json({
      ok: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "La facture n’a pas pu être préparée.",
    });
  }
};
