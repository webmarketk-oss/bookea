const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (secret && String(req.headers.authorization || "") !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "missing_supabase" });
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,slug,city,is_public,updated_at")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const rows = [];
    for (const center of centers || []) {
      const [leads, appointments, clients, members] = await Promise.all([
        countEq(supabase, "leads", center.id),
        countEq(supabase, "appointments", center.id),
        countEq(supabase, "clients", center.id),
        countEq(supabase, "center_members", center.id),
      ]);
      rows.push({
        name: center.name,
        slug: center.slug,
        city: center.city,
        isPublic: center.is_public === true,
        updatedAt: center.updated_at,
        leads,
        appointments,
        clients,
        members,
      });
    }

    return res.status(200).json({
      ok: true,
      centerCount: rows.length,
      centers: rows,
    });
  } catch (error) {
    console.error("[health/integrity]", error);
    return res.status(500).json({ error: "integrity_failed" });
  }
};

async function countEq(supabase, table, centerId) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("center_id", centerId);
  if (error) {
    return { error: error.message };
  }
  return count ?? 0;
}
