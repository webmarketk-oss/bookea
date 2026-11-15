/**
 * POST /api/seya/agent-settings — enregistre la fiche Seya (soins, briefs, mission)
 * avec le rôle service, pour que l'admin Bookea puisse écrire même s'il n'est
 * pas propriétaire du centre (RLS centers_managers_update).
 */
const { createClient } = require("@supabase/supabase-js");
const { repairGaillardLaserSettings } = require("./gaillard-laser-pricing");
const { applySettingsPatch } = require("./settings-patch");
const { mutateCenterSettings } = require("./settings-write");
const { staffCanUseCenter } = require("./_staff-auth");

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
  return {
    ...currentSettings,
    seya: {
      ...currentSeya,
      ...merged,
      conversations: currentSeya.conversations,
    },
  };
}

function createAgentSettingsHandler({ createSupabase = createServiceClient } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
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

      const result = await mutateCenterSettings(
        supabase,
        centerId,
        (currentSettings) =>
          applyAgentSettings(currentSettings, payload, {
            id: center.id,
            name: center.name,
            slug: center.public_slug,
          }),
        { settingsOnly: true },
      );
      const seya = asRecord(result.settings.seya);
      delete seya.conversations;
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
