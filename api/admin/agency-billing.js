const { createClient } = require("@supabase/supabase-js");
const { parsePayload } = require("../appointments/service");

const BUCKET = "bookea-admin-private";
const MAX_BYTES = 8 * 1024 * 1024;
const COMPANIES = new Set(["webk", "bookea"]);

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

async function requireBookeaAdmin(supabase, req) {
  const token = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return false;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return false;
  }
  const { data: admin } = await supabase
    .from("bookea_admins")
    .select("profile_id")
    .eq("profile_id", data.user.id)
    .maybeSingle();
  return Boolean(admin?.profile_id);
}

async function ensureBucket(supabase) {
  const existing = await supabase.storage.getBucket(BUCKET);
  if (existing.data) {
    return;
  }
  const created = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message || "")) {
    throw created.error;
  }
}

function billingPath(company) {
  return `agency-billing/${company}.json`;
}

function isMissingObject(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  return status === 404 || /not.?found|does not exist/i.test(String(error?.message || ""));
}

async function readBilling(supabase, company) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(billingPath(company));
  if (error) {
    if (isMissingObject(error)) {
      return null;
    }
    throw error;
  }
  const text = await data.text();
  return text ? JSON.parse(text) : null;
}

async function writeBilling(supabase, company, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.length > MAX_BYTES) {
    throw new Error("Données de facturation trop volumineuses.");
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(billingPath(company), body, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) {
    throw error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const supabase = createServiceClient();
    if (!(await requireBookeaAdmin(supabase, req))) {
      return res.status(403).json({
        ok: false,
        error: "Accès réservé à l’équipe Bookea.",
      });
    }

    const payload = req.method === "PUT" ? parsePayload(req.body) : {};
    const company = String(req.query?.company || payload.company || "").trim();
    if (!COMPANIES.has(company)) {
      return res.status(400).json({ ok: false, error: "Société inconnue." });
    }

    await ensureBucket(supabase);

    if (req.method === "GET") {
      const state = await readBilling(supabase, company);
      return res.status(200).json({ ok: true, state });
    }

    const state = payload.state;
    if (!state || typeof state !== "object" || state.company !== company) {
      return res.status(400).json({ ok: false, error: "Facturation invalide." });
    }
    await writeBilling(supabase, company, state);
    return res.status(200).json({ ok: true, updatedAt: state.updatedAt || null });
  } catch (error) {
    console.error("[admin/agency-billing]", error);
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "La facturation n’a pas pu être enregistrée.",
    });
  }
};
