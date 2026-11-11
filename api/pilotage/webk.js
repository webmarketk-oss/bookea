const { createClient } = require("@supabase/supabase-js");
const { requireWebkPilotage } = require("./webk-access");
const {
  buildPilotageCenters,
  sortPilotageCenters,
  thresholdOf,
} = require("./webk-logic");

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

function parsePayload(body) {
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

function isoDay(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "";
  }
  const time = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(time)) {
    return "";
  }
  return raw;
}

async function readDashboard(supabase) {
  const since = new Date();
  const [
    { data: centers, error: centersError },
    countsResult,
    rdvResult,
    thresholdsResult,
    actionsResult,
    campaignsResult,
    leadAxesResult,
    rdvAxesResult,
  ] = await Promise.all([
    supabase.from("centers").select("id,name,city,admin:settings->admin").order("name"),
    supabase.rpc("webk_pilotage_counts"),
    supabase.rpc("webk_pilotage_rdv_counts"),
    supabase.from("webk_pilotage_thresholds").select("center_id,min_leads_48h,min_rdv_48h"),
    supabase
      .from("webk_pilotage_actions")
      .select("id,center_id,acted_on,campaign,change_text,review_on,author_name,created_at")
      .order("acted_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("campaigns").select("center_id,name").eq("is_active", true),
    supabase.rpc("webk_pilotage_lead_axes"),
    supabase.rpc("webk_pilotage_rdv_axes"),
  ]);

  if (centersError) {
    throw new Error(centersError.message);
  }
  for (const result of [countsResult, rdvResult]) {
    if (!result.error) {
      continue;
    }
    const missing = /webk_pilotage_counts|webk_pilotage_rdv_counts|schema cache|PGRST202/i.test(
      result.error.message || "",
    );
    const error = new Error(
      missing
        ? "Le classement n’est pas encore installé dans la base."
        : "Les totaux n’ont pas pu être lus.",
    );
    error.status = missing ? 503 : 500;
    throw error;
  }
  for (const result of [thresholdsResult, actionsResult, campaignsResult]) {
    if (result.error) {
      const missing = /webk_pilotage|min_rdv_48h|schema cache|PGRST205/i.test(result.error.message || "");
      const error = new Error(
        missing
          ? "Le suivi n’est pas encore installé dans la base."
          : "Le suivi n’a pas pu être lu.",
      );
      error.status = missing ? 503 : 500;
      throw error;
    }
  }
  const axesReady = !leadAxesResult.error && !rdvAxesResult.error;
  if (!axesReady) {
    const missing = /webk_pilotage_lead_axes|webk_pilotage_rdv_axes|schema cache|PGRST202/i.test(
      `${leadAxesResult.error?.message || ""} ${rdvAxesResult.error?.message || ""}`,
    );
    if (!missing) {
      const error = new Error("Les axes n’ont pas pu être lus.");
      error.status = 500;
      throw error;
    }
  }

  const mapAxis = (row, kind) => ({
    centerId: row.center_id,
    axis: row.axis,
    ...(kind === "leads"
      ? {
          leads48h: row.leads_48h,
          leads7d: row.leads_7d,
          leadsPrev7d: row.leads_prev_7d,
          leadsMonth: row.leads_month,
          leadsPrevMonth: row.leads_prev_month,
        }
      : {
          rdv48h: row.rdv_48h,
          rdv7d: row.rdv_7d,
          rdvPrev7d: row.rdv_prev_7d,
          rdvMonth: row.rdv_month,
          rdvPrevMonth: row.rdv_prev_month,
        }),
  });

  const rows = buildPilotageCenters({
    centers: centers || [],
    counts: (countsResult.data || []).map((row) => ({
      centerId: row.center_id,
      leads48h: row.leads_48h,
      leads7d: row.leads_7d,
      leadsPrev7d: row.leads_prev_7d,
      leadsMonth: row.leads_month,
      leadsPrevMonth: row.leads_prev_month,
    })),
    rdvCounts: (rdvResult.data || []).map((row) => ({
      centerId: row.center_id,
      rdv48h: row.rdv_48h,
      rdv7d: row.rdv_7d,
      rdvPrev7d: row.rdv_prev_7d,
      rdvMonth: row.rdv_month,
      rdvPrevMonth: row.rdv_prev_month,
    })),
    thresholds: (thresholdsResult.data || []).map((row) => ({
      centerId: row.center_id,
      minLeads48h: row.min_leads_48h,
      minRdv48h: row.min_rdv_48h,
    })),
    actions: (actionsResult.data || []).map((row) => ({
      id: row.id,
      centerId: row.center_id,
      actedOn: row.acted_on,
      campaign: row.campaign,
      changeText: row.change_text,
      reviewOn: row.review_on,
      authorName: row.author_name,
      createdAt: row.created_at,
    })),
    campaigns: campaignsResult.data || [],
    leadAxes: axesReady ? (leadAxesResult.data || []).map((row) => mapAxis(row, "leads")) : [],
    rdvAxes: axesReady ? (rdvAxesResult.data || []).map((row) => mapAxis(row, "rdv")) : [],
  });

  return {
    ok: true,
    generatedAt: since.toISOString(),
    axesReady,
    centers: sortPilotageCenters(rows, "desc"),
  };
}

async function saveThreshold(supabase, viewer, body) {
  const centerId = String(body.centerId || "").trim();
  const metric = body.metric === "rdv" ? "rdv" : body.metric === "leads" ? "leads" : "";
  const value = Number(metric === "rdv" ? body.minRdv48h : body.minLeads48h);
  if (!centerId || !metric || value !== thresholdOf(value)) {
    return { status: 400, body: { ok: false, error: "Seuil invalide." } };
  }
  const { error } = await supabase.from("webk_pilotage_thresholds").upsert({
    center_id: centerId,
    ...(metric === "rdv" ? { min_rdv_48h: value } : { min_leads_48h: value }),
    updated_at: new Date().toISOString(),
    updated_by: viewer.userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return { status: 200, body: { ok: true } };
}

async function saveAction(supabase, viewer, body) {
  const centerId = String(body.centerId || "").trim();
  const actedOn = isoDay(body.actedOn);
  const reviewOn = body.reviewOn ? isoDay(body.reviewOn) : "";
  const changeText = String(body.changeText || "").trim();
  const campaign = String(body.campaign || "").trim().slice(0, 120);
  if (!centerId || !actedOn || !changeText || changeText.length > 500) {
    return { status: 400, body: { ok: false, error: "Modification incomplète." } };
  }
  if (body.reviewOn && !reviewOn) {
    return { status: 400, body: { ok: false, error: "Date de relecture invalide." } };
  }
  const { error } = await supabase.from("webk_pilotage_actions").insert({
    center_id: centerId,
    acted_on: actedOn,
    campaign: campaign || null,
    change_text: changeText,
    review_on: reviewOn || null,
    author_id: viewer.userId,
    author_name: viewer.authorName,
  });
  if (error) {
    throw new Error(error.message);
  }
  return { status: 200, body: { ok: true } };
}

async function handler(req, res) {
  try {
    const supabase = createServiceClient();
    const viewer = await requireWebkPilotage(supabase, req);
    if (!viewer.ok) {
      return res.status(viewer.status).json({ ok: false });
    }
    if (req.method === "GET") {
      const dashboard = await readDashboard(supabase);
      return res.status(200).json(dashboard);
    }
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false });
    }
    const body = parsePayload(req.body);
    const saved =
      body.op === "threshold"
        ? await saveThreshold(supabase, viewer, body)
        : body.op === "action"
          ? await saveAction(supabase, viewer, body)
          : { status: 400, body: { ok: false, error: "Opération inconnue." } };
    return res.status(saved.status).json(saved.body);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      ok: false,
      error: status === 503 ? error.message : "Le pilotage n’a pas pu répondre.",
    });
  }
}

module.exports = handler;
module.exports.readDashboard = readDashboard;
