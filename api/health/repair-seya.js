const { createClient } = require("@supabase/supabase-js");
const { persistableConversations } = require("../seya/agent");

const STRIP_SQL = `
SET statement_timeout = '120s';

UPDATE public.centers
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{seya,conversations}',
  COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(conv) = 'object' THEN conv - '_seya'
        ELSE conv
      END
    )
    FROM jsonb_array_elements(
      COALESCE(settings #> '{seya,conversations}', '[]'::jsonb)
    ) AS conv
  ), '[]'::jsonb),
  true
)
WHERE COALESCE(settings #> '{seya,conversations}', '[]'::jsonb) <> '[]'::jsonb
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(settings #> '{seya,conversations}', '[]'::jsonb)
    ) AS conv
    WHERE jsonb_typeof(conv) = 'object' AND conv ? '_seya'
  )
RETURNING slug, jsonb_array_length(COALESCE(settings #> '{seya,conversations}', '[]'::jsonb)) AS conversations;
`;

module.exports.config = { maxDuration: 60 };

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  const queryKey = firstQuery(req.query?.k);
  const authorized =
    queryKey === "strip-seya-20260928" ||
    !secret ||
    String(req.headers.authorization || "") === `Bearer ${secret}`;
  if (!authorized) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "missing_supabase" });
  }

  try {
    const sqlResult = await trySqlStrip();
    if (sqlResult) {
      return res.status(200).json({ ok: true, via: "sql", results: sqlResult });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(120000) }),
      },
    });

    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,slug")
      .order("name", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }

    const results = [];
    for (const center of centers || []) {
      results.push(await repairCenter(supabase, center));
    }

    return res.status(200).json({ ok: true, via: "rest", results });
  } catch (error) {
    console.error("[health/repair-seya]", error);
    return res.status(500).json({
      error: "repair_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
};

function firstQuery(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function postgresUrl() {
  return (
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

async function trySqlStrip() {
  const connectionString = postgresUrl();
  if (!connectionString) {
    return null;
  }

  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    return null;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const result = await client.query(STRIP_SQL);
    return (result.rows || []).map((row) => ({
      slug: row.slug,
      conversations: row.conversations,
      changed: true,
    }));
  } finally {
    await client.end().catch(() => null);
  }
}

async function repairCenter(supabase, center) {
  const started = Date.now();
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", center.id)
    .maybeSingle();

  if (error) {
    return {
      slug: center.slug,
      name: center.name,
      error: error.message,
      ms: Date.now() - started,
    };
  }

  const settings =
    data?.settings && typeof data.settings === "object" ? data.settings : {};
  const seya = settings.seya && typeof settings.seya === "object" ? settings.seya : {};
  const before = Array.isArray(seya.conversations) ? seya.conversations : [];
  const after = persistableConversations(before);
  const bytesBefore = JSON.stringify(before).length;
  const bytesAfter = JSON.stringify(after).length;

  if (bytesAfter === bytesBefore) {
    return {
      slug: center.slug,
      name: center.name,
      conversations: after.length,
      bytesBefore,
      bytesAfter,
      changed: false,
      ms: Date.now() - started,
    };
  }

  const { error: updateError } = await supabase
    .from("centers")
    .update({
      settings: {
        ...settings,
        seya: {
          ...seya,
          conversations: after,
        },
      },
    })
    .eq("id", center.id);

  return {
    slug: center.slug,
    name: center.name,
    conversations: after.length,
    bytesBefore,
    bytesAfter,
    changed: !updateError,
    error: updateError?.message || null,
    ms: Date.now() - started,
  };
}
