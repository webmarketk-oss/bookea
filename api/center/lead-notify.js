/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { canManageCenterBilling } = require("../billing/_center-auth");
const { mutateCenterSettings } = require("../seya/settings-write");
const {
  cleanEmails,
  leadNotifyAllowed,
  leadNotifyConfig,
  loadCenterForLeadNotify,
  notifyNewLead,
} = require("./_lead-notify");

// Un ajout manuel notifie seulement juste après sa création, jamais une fiche plus ancienne.
const MANUAL_LEAD_MAX_AGE_MS = 15 * 60 * 1000;

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

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePayload(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    const text = body.trim();
    return text.startsWith("{") ? JSON.parse(text) : {};
  }
  return body;
}

function relationObject(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function readConfig(supabase, req, res, centerId) {
  if (!(await canManageCenterBilling(supabase, req, centerId))) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const center = await loadCenterForLeadNotify(supabase, centerId);
  if (!center) {
    return res.status(404).json({ ok: false, error: "unknown_center" });
  }
  const config = leadNotifyConfig(center.settings);
  return res.status(200).json({
    ok: true,
    available: leadNotifyAllowed(center),
    enabled: config.enabled,
    emails: config.emails,
    suggestedEmails: cleanEmails([center.email]),
  });
}

async function saveConfig(supabase, req, res, payload) {
  const centerId = String(payload.centerId || "").trim();
  if (!(await canManageCenterBilling(supabase, req, centerId))) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const center = await loadCenterForLeadNotify(supabase, centerId);
  if (!center) {
    return res.status(404).json({ ok: false, error: "unknown_center" });
  }
  if (!leadNotifyAllowed(center)) {
    return res.status(409).json({ ok: false, error: "center_not_allowed" });
  }
  const enabled = payload.enabled === true;
  const emails = cleanEmails(payload.emails);
  if (enabled && !emails.length) {
    return res.status(400).json({
      ok: false,
      error: "Ajoutez au moins une adresse e-mail valide avant d’activer les notifications.",
    });
  }
  const result = await mutateCenterSettings(supabase, centerId, (settings) => ({
    ...settings,
    leadNotify: { enabled, emails },
  }));
  const saved = leadNotifyConfig(result.settings);
  return res.status(200).json({ ok: true, enabled: saved.enabled, emails: saved.emails });
}

async function notifyManualLead(supabase, req, res, payload) {
  const leadId = String(payload.leadId || "").trim();
  if (!leadId) {
    return res.status(400).json({ ok: false, error: "missing_lead" });
  }
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id,center_id,created_at,clients(first_name,last_name,phone,email),campaigns(name),services(name)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!lead?.id) {
    return res.status(404).json({ ok: false, error: "unknown_lead" });
  }
  if (!(await canManageCenterBilling(supabase, req, lead.center_id))) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const createdAt = Date.parse(String(lead.created_at || ""));
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MANUAL_LEAD_MAX_AGE_MS) {
    return res.status(200).json({ ok: true, sent: false, reason: "not_new" });
  }
  const center = await loadCenterForLeadNotify(supabase, lead.center_id);
  const client = relationObject(lead.clients) || {};
  const result = await notifyNewLead(supabase, {
    center,
    leadId: lead.id,
    receivedAt: lead.created_at,
    lead: {
      firstName: client.first_name,
      lastName: client.last_name,
      phone: client.phone,
      email: client.email,
      offer: relationObject(lead.campaigns)?.name || relationObject(lead.services)?.name || "",
    },
  });
  return res.status(200).json({ ok: true, sent: result.sent, reason: result.reason });
}

module.exports = async function handler(req, res) {
  try {
    const supabase = createServiceClient();
    if (req.method === "GET") {
      const centerId = String(firstValue(req.query?.centerId) || "").trim();
      if (!centerId) {
        return res.status(400).json({ ok: false, error: "missing_center" });
      }
      return await readConfig(supabase, req, res, centerId);
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const payload = parsePayload(req.body);
    if (payload.action === "save") {
      return await saveConfig(supabase, req, res, payload);
    }
    if (payload.action === "lead") {
      return await notifyManualLead(supabase, req, res, payload);
    }
    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (error) {
    console.error("[center/lead-notify]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "lead_notify_failed",
    });
  }
};
