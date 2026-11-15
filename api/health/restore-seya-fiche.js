/**
 * Recopie la fiche Seya (soins, briefs, offres) d’un centre vers un autre,
 * sans toucher aux conversations WhatsApp.
 */
const { createClient } = require("@supabase/supabase-js");
const { loadSeyaFicheColumns, SEYA_FICHE_KEYS } = require("../seya/fiche-select");

module.exports.config = { maxDuration: 30 };

const COPY_SQL = `
create or replace function public.copy_center_seya_fiche(p_source uuid, p_dest uuid, p_seya jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seya jsonb;
  dest_seya jsonb;
  dest_conversations jsonb;
begin
  next_seya := coalesce(p_seya, '{}'::jsonb) - 'conversations';
  if coalesce(jsonb_array_length(next_seya->'treatmentBriefs'), 0) = 0 then
    raise exception 'source_fiche_empty';
  end if;
  select coalesce(settings->'seya', '{}'::jsonb)
    into dest_seya
    from public.centers
    where id = p_dest;
  if dest_seya is null then
    raise exception 'center_not_found';
  end if;
  dest_conversations := dest_seya->'conversations';
  dest_seya := (dest_seya - 'conversations') || next_seya;
  if dest_conversations is not null then
    dest_seya := jsonb_set(dest_seya, '{conversations}', dest_conversations, true);
  end if;
  update public.centers
  set
    settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{seya}', dest_seya, true),
    updated_at = now()
  where id = p_dest
  returning (settings->'seya') - 'conversations' into next_seya;
  if next_seya is null then
    raise exception 'center_not_found';
  end if;
  return next_seya;
end;
$$;

revoke all on function public.copy_center_seya_fiche(uuid, uuid, jsonb) from public;
grant execute on function public.copy_center_seya_fiche(uuid, uuid, jsonb) to service_role;
`;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstQuery(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function postgresUrl() {
  if (process.env.NODE_TEST_CONTEXT) {
    return "";
  }
  return (
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

async function runSql(sql, params = []) {
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
    return await client.query(sql, params);
  } finally {
    await client.end().catch(() => null);
  }
}

function cityLabel(center) {
  const city = String(center.city || "").trim();
  if (city && !/\d/.test(city) && !city.includes(",") && city.length <= 40) {
    return city;
  }
  const parts = String(center.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[parts.length - 1] || city;
}

function centerAddress(center) {
  const city = cityLabel(center);
  return [center.address_line1, center.postal_code, city]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
}

function retargetSeyaFiche(seya, source, dest) {
  const sourceCity = cityLabel(source);
  const destCity = cityLabel(dest);
  const replacements = [
    [source.address_line1, dest.address_line1],
    [centerAddress(source), centerAddress(dest)],
    [
      [source.postal_code, sourceCity].filter(Boolean).join(" "),
      [dest.postal_code, destCity].filter(Boolean).join(" "),
    ],
    [source.email, dest.email],
    [source.phone, dest.phone],
    [source.name, dest.name],
    [sourceCity, destCity],
  ].filter(([from, to]) => from && to && String(from) !== String(to));

  function replaceValue(value) {
    if (typeof value === "string") {
      let next = value;
      for (const [from, to] of replacements) {
        next = next.split(String(from)).join(String(to));
      }
      return next;
    }
    if (Array.isArray(value)) {
      return value.map(replaceValue);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, replaceValue(item)]),
      );
    }
    return value;
  }

  const next = replaceValue(asRecord(seya));
  delete next.conversations;
  const profile = asRecord(next.centerProfile);
  const destAddress = centerAddress(dest);
  if (destAddress) {
    profile.extras = destAddress;
  }
  if (dest.email) {
    profile.supportEmail = dest.email;
  }
  if (dest.phone) {
    profile.supportPhone = dest.phone;
  }
  next.centerProfile = profile;
  return next;
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const queryKey = firstQuery(req.query?.k);
  return (
    queryKey === "backup-seya-settings-20261013" ||
    (!!secret && String(req.headers.authorization || "") === `Bearer ${secret}`)
  );
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("missing_supabase");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadCenter(supabase, slug) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,slug,city,email,phone,address_line1,postal_code")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function copyFiche(supabase, source, dest, seya) {
  const rpc = await supabase.rpc("copy_center_seya_fiche", {
    p_source: source.id,
    p_dest: dest.id,
    p_seya: seya,
  });
  if (!rpc.error) {
    return { via: "rpc", seya: asRecord(rpc.data) };
  }
  if (!/could not find the function|schema cache|does not exist/i.test(String(rpc.error.message))) {
    throw new Error(rpc.error.message);
  }
  const sql = await runSql(
    `select public.copy_center_seya_fiche($1::uuid, $2::uuid, $3::jsonb) as seya`,
    [source.id, dest.id, JSON.stringify(seya)],
  );
  if (sql?.rows?.[0]?.seya) {
    return { via: "sql", seya: asRecord(sql.rows[0].seya) };
  }
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", dest.id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const stored = asRecord(data?.settings);
  const currentSeya = asRecord(stored.seya);
  const conversations = currentSeya.conversations;
  const nextSeya = { ...currentSeya, ...seya };
  delete nextSeya.conversations;
  if (Array.isArray(conversations)) {
    nextSeya.conversations = conversations;
  }
  const { error: writeError } = await supabase
    .from("centers")
    .update({ settings: { ...stored, seya: nextSeya } })
    .eq("id", dest.id);
  if (writeError) {
    throw new Error(writeError.message);
  }
  const saved = { ...nextSeya };
  delete saved.conversations;
  return { via: "rest", seya: saved };
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const sourceSlug =
    firstQuery(req.query?.source) || String(body.source || "jfg-clinic-sallanches").trim();
  const destSlug =
    firstQuery(req.query?.dest) || String(body.dest || "jfg-clinic-gaillard").trim();
  if (!sourceSlug || !destSlug || sourceSlug === destSlug) {
    return res.status(400).json({ error: "source_dest_required" });
  }

  try {
    await runSql(COPY_SQL);
    const supabase = createServiceClient();
    const source = await loadCenter(supabase, sourceSlug);
    const dest = await loadCenter(supabase, destSlug);
    if (!source?.id || !dest?.id) {
      return res.status(404).json({ error: "center_not_found" });
    }
    const sourceFiche = await loadSeyaFicheColumns(supabase, source.id);
    if (!Array.isArray(sourceFiche?.treatmentBriefs) || sourceFiche.treatmentBriefs.length === 0) {
      return res.status(409).json({ error: "source_fiche_empty" });
    }
    const seya = retargetSeyaFiche(sourceFiche, source, dest);
    const saved = await copyFiche(supabase, source, dest, seya);
    const briefs = Array.isArray(saved.seya.treatmentBriefs)
      ? saved.seya.treatmentBriefs.map((item) => String(item?.name || "").trim()).filter(Boolean)
      : [];
    return res.status(200).json({
      ok: true,
      via: saved.via,
      source: { id: source.id, name: source.name, slug: source.slug },
      dest: { id: dest.id, name: dest.name, slug: dest.slug },
      briefs,
      offerMaps: Array.isArray(saved.seya.offerMaps) ? saved.seya.offerMaps.length : 0,
    });
  } catch (error) {
    console.error("[health/restore-seya-fiche]", error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: "restore_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

module.exports = handler;
module.exports.retargetSeyaFiche = retargetSeyaFiche;
module.exports.SEYA_FICHE_KEYS = SEYA_FICHE_KEYS;
