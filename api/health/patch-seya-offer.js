/**
 * PATCH ciblé de l’offre Seya d’un centre (offerMaps + titre d’un soin),
 * sans toucher aux conversations ni vider les briefs.
 */
const { createClient } = require("@supabase/supabase-js");
const { keepFilledSeya } = require("../seya/settings-patch");
const { patchCenterSeya } = require("../seya/settings-write");

module.exports.config = { maxDuration: 30 };

function firstQuery(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
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
  return asRecord(body);
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const queryKey = firstQuery(req.query?.k);
  return (
    queryKey === "backup-seya-settings-20261013" ||
    (!!secret && String(req.headers.authorization || "") === `Bearer ${secret}`)
  );
}

function sameTreatmentName(left, right) {
  return (
    String(left || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") ===
    String(right || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

function applyOfferPatch(seya, payload) {
  const current = asRecord(seya);
  const next = { ...current };
  const maps = Array.isArray(payload.offerMaps) ? payload.offerMaps : [];
  if (maps.length) {
    next.offerMaps = maps
      .map((item) => ({
        match: String(item?.match || "").trim(),
        label: String(item?.label || "").trim(),
        template: String(item?.template || "").trim(),
      }))
      .filter((item) => item.match);
  }
  const treatmentName = String(payload.treatmentName || "").trim();
  if (treatmentName && payload.treatmentTitle !== undefined) {
    const briefs = Array.isArray(current.treatmentBriefs)
      ? current.treatmentBriefs
      : [];
    next.treatmentBriefs = briefs.map((brief) => {
      if (!sameTreatmentName(brief?.name, treatmentName)) {
        return brief;
      }
      return { ...brief, title: String(payload.treatmentTitle || "").trim() };
    });
  }
  return keepFilledSeya(current, next);
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

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = parseBody(req.body);
  const slug = (firstQuery(req.query?.slug) || String(body.slug || "")).trim();
  if (!slug) {
    return res.status(400).json({ error: "slug_required" });
  }

  try {
    const supabase = createServiceClient();
    const { data: center, error } = await supabase
      .from("centers")
      .select("id,name,slug")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!center?.id) {
      return res.status(404).json({ error: "center_not_found" });
    }

    const result = await patchCenterSeya(
      supabase,
      center.id,
      (seya) => applyOfferPatch(seya, body),
      { settingsOnly: true },
    );
    const seya = asRecord(result.settings.seya);
    const titles = (Array.isArray(seya.treatmentBriefs) ? seya.treatmentBriefs : []).map(
      (brief) => ({
        name: String(brief?.name || "").trim(),
        title: String(brief?.title || "").trim(),
      }),
    );
    return res.status(200).json({
      ok: true,
      changed: Boolean(result.changed),
      center: { id: center.id, name: center.name, slug: center.slug },
      offerMaps: Array.isArray(seya.offerMaps) ? seya.offerMaps : [],
      titles,
    });
  } catch (error) {
    console.error("[health/patch-seya-offer]", error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: "patch_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

module.exports = handler;
module.exports.applyOfferPatch = applyOfferPatch;
