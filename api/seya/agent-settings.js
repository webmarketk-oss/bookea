/**
 * POST /api/seya/agent-settings — enregistre la fiche Seya (soins, briefs, mission)
 * sans lire les conversations WhatsApp du centre.
 */
const { createClient } = require("@supabase/supabase-js");
const { repairGaillardLaserSettings } = require("./gaillard-laser-pricing");
const { applySettingsPatch } = require("./settings-patch");
const { mutateCenterSettings } = require("./settings-write");
const { staffCanUseCenter } = require("./_staff-auth");
const { loadSeyaFicheColumns } = require("./fiche-select");

const ALLOWED_ORIGINS = new Set([
  "https://www.bookeai.fr",
  "https://bookeai.fr",
  "https://app.bookeai.fr",
]);

const ENSURE_SQL = `
create or replace function public.center_seya_fiche(p_center_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(settings->'seya', '{}'::jsonb) - 'conversations'
  from public.centers
  where id = p_center_id;
$$;

create or replace function public.save_center_seya_settings(p_center_id uuid, p_seya jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seya jsonb;
begin
  next_seya := coalesce(p_seya, '{}'::jsonb) - 'conversations';
  update public.centers
  set
    settings = jsonb_set(
      coalesce(settings, '{}'::jsonb) #- '{seya,conversations}',
      '{seya}',
      (coalesce(settings->'seya', '{}'::jsonb) - 'conversations') || next_seya,
      true
    ),
    updated_at = now()
  where id = p_center_id
  returning (settings->'seya') - 'conversations' into next_seya;
  if next_seya is null then
    raise exception 'center_not_found';
  end if;
  return next_seya;
end;
$$;

revoke all on function public.center_seya_fiche(uuid) from public;
revoke all on function public.save_center_seya_settings(uuid, jsonb) from public;
grant execute on function public.center_seya_fiche(uuid) to service_role;
grant execute on function public.save_center_seya_settings(uuid, jsonb) to service_role;

drop policy if exists "centers_bookea_admin_update" on public.centers;
create policy "centers_bookea_admin_update"
on public.centers
for update
to authenticated
using (public.is_bookea_admin())
with check (public.is_bookea_admin());
`;

let schemaReady = false;

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

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseBody(body) {
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

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (!ALLOWED_ORIGINS.has(origin)) {
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
}

function applyAgentSettings(currentSettings, payload, center) {
  const currentSeya = asRecord(currentSettings.seya);
  const settings = asRecord(payload.settings);
  const changedKeys = payload.changedKeys;
  const removedTreatmentNames = payload.removedTreatmentNames;
  let merged = applySettingsPatch(
    currentSeya,
    settings,
    changedKeys,
    removedTreatmentNames,
  );
  const repaired = repairGaillardLaserSettings(
    merged,
    center?.name,
    center?.id || center?.slug,
  );
  if (repaired.changed) {
    merged = repaired.settings;
  }
  const { conversations: _omit, ...seya } = {
    ...currentSeya,
    ...merged,
  };
  void _omit;
  return { ...currentSettings, seya };
}

function rpcMissing(error) {
  return /could not find the function|schema cache|does not exist/i.test(
    String(error?.message || error || ""),
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
    const result = await client.query(sql, params);
    return result.rows || [];
  } finally {
    await client.end().catch(() => null);
  }
}

async function ensureSchema() {
  if (schemaReady) {
    return;
  }
  try {
    await runSql(ENSURE_SQL);
    schemaReady = true;
  } catch (error) {
    console.error("[seya/agent-settings] schema", error instanceof Error ? error.message : error);
  }
}

async function loadSeyaFiche(supabase, centerId) {
  const rpc = await supabase.rpc("center_seya_fiche", { p_center_id: centerId });
  if (!rpc.error) {
    return asRecord(rpc.data);
  }
  if (!rpcMissing(rpc.error)) {
    throw new Error(rpc.error.message);
  }
  const rows = await runSql(
    `select coalesce(settings->'seya', '{}'::jsonb) - 'conversations' as seya
     from public.centers where id = $1::uuid`,
    [centerId],
  );
  if (rows && rows[0]) {
    return asRecord(rows[0].seya);
  }
  try {
    return await loadSeyaFicheColumns(supabase, centerId);
  } catch (error) {
    console.error("[seya/agent-settings] fiche columns", error instanceof Error ? error.message : error);
    return null;
  }
}

async function saveSeyaFiche(supabase, centerId, seya) {
  const clean = asRecord(seya);
  delete clean.conversations;
  if (Array.isArray(clean.treatmentBriefs) && clean.treatmentBriefs.length === 0) {
    delete clean.treatmentBriefs;
  }
  if (Array.isArray(clean.offerMaps) && clean.offerMaps.length === 0) {
    delete clean.offerMaps;
  }
  const rpc = await supabase.rpc("save_center_seya_settings", {
    p_center_id: centerId,
    p_seya: clean,
  });
  if (!rpc.error) {
    return asRecord(rpc.data);
  }
  if (!rpcMissing(rpc.error)) {
    throw new Error(rpc.error.message);
  }
  const rows = await runSql(
    `update public.centers
     set settings = jsonb_set(
       coalesce(settings, '{}'::jsonb) #- '{seya,conversations}',
       '{seya}',
       (coalesce(settings->'seya', '{}'::jsonb) - 'conversations') || $2::jsonb,
       true
     ),
     updated_at = now()
     where id = $1::uuid
     returning (settings->'seya') - 'conversations' as seya`,
    [centerId, JSON.stringify(clean)],
  );
  if (rows && rows[0]) {
    return asRecord(rows[0].seya);
  }
  return null;
}

async function persistAgentFiche(supabase, center, payload) {
  await ensureSchema();
  const remoteSeya = await loadSeyaFiche(supabase, center.id);
  const next = applyAgentSettings(
    remoteSeya ? { seya: remoteSeya } : { seya: {} },
    payload,
    center,
  );
  const saved = await saveSeyaFiche(supabase, center.id, next.seya);
  if (saved) {
    return saved;
  }
  const result = await mutateCenterSettings(
    supabase,
    center.id,
    (currentSettings) => applyAgentSettings(currentSettings, payload, center),
    { settingsOnly: true },
  );
  const seya = asRecord(result.settings.seya);
  delete seya.conversations;
  return seya;
}

function createAgentSettingsHandler({
  createSupabase = createServiceClient,
} = {}) {
  return async function handler(req, res) {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    if (req.method === "GET") {
      const centerId = String(
        (Array.isArray(req.query?.centerId) ? req.query.centerId[0] : req.query?.centerId) ||
          "",
      ).trim();
      if (!centerId) {
        return res.status(400).json({ ok: false, error: "Centre manquant." });
      }
      try {
        const supabase = createSupabase();
        if (!(await staffCanUseCenter(supabase, req, centerId))) {
          return res.status(401).json({
            ok: false,
            error: "Connexion requise pour lire les réglages de ce centre.",
          });
        }
        const { data: center, error: centerError } = await supabase
          .from("centers")
          .select("id,name,public_slug")
          .eq("id", centerId)
          .maybeSingle();
        if (centerError) {
          throw new Error(centerError.message);
        }
        if (!center?.id) {
          return res.status(404).json({ ok: false, error: "Centre introuvable." });
        }
        const seya =
          (await loadSeyaFicheColumns(supabase, center.id)) ||
          (await loadSeyaFiche(supabase, center.id));
        return res.status(200).json({
          ok: true,
          centerId: center.id,
          centerName: center.name || "",
          settings: seya || {},
          empty: !seya,
        });
      } catch (error) {
        console.error("[seya/agent-settings] get", error instanceof Error ? error.message : error);
        return res.status(500).json({
          ok: false,
          error: "Impossible de lire les réglages pour le moment.",
        });
      }
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const payload = parseBody(req.body);
    const centerId = String(payload.centerId || "").trim();
    if (!centerId) {
      return res.status(400).json({ ok: false, error: "Centre manquant." });
    }
    if (!payload.settings || typeof payload.settings !== "object") {
      return res.status(400).json({ ok: false, error: "Réglages manquants." });
    }

    try {
      const supabase = createSupabase();
      if (!(await staffCanUseCenter(supabase, req, centerId))) {
        return res.status(401).json({
          ok: false,
          error: "Connexion requise pour enregistrer les réglages de ce centre.",
        });
      }

      const { data: center, error: centerError } = await supabase
        .from("centers")
        .select("id,name,public_slug")
        .eq("id", centerId)
        .maybeSingle();
      if (centerError) {
        throw new Error(centerError.message);
      }
      if (!center?.id) {
        return res.status(404).json({ ok: false, error: "Centre introuvable." });
      }

      const seya = await persistAgentFiche(supabase, center, payload);
      return res.status(200).json({
        ok: true,
        centerId: center.id,
        centerName: center.name || "",
        settings: seya,
      });
    } catch (error) {
      console.error("[seya/agent-settings]", error instanceof Error ? error.message : error);
      const message = error instanceof Error ? error.message : "";
      if (message === "settings_write_conflict") {
        return res.status(409).json({
          ok: false,
          error: "Un autre enregistrement a eu lieu en même temps. Réessayez.",
        });
      }
      if (message === "seya_conversations_unreadable") {
        return res.status(409).json({
          ok: false,
          error: "Les conversations de ce centre sont illisibles : réglages non enregistrés.",
        });
      }
      if (message === "settings_write_forbidden") {
        return res.status(403).json({
          ok: false,
          error: "Ce compte n’a pas le droit d’enregistrer les réglages de ce centre.",
        });
      }
      return res.status(500).json({
        ok: false,
        error:
          message && message.length < 180
            ? message
            : "Impossible d’enregistrer les réglages pour le moment.",
      });
    }
  };
}

module.exports = createAgentSettingsHandler();
module.exports.createAgentSettingsHandler = createAgentSettingsHandler;
module.exports.applyAgentSettings = applyAgentSettings;
module.exports.persistAgentFiche = persistAgentFiche;
