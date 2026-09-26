/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "saveleads",
      method: "POST",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    const centerSlug = firstValue(
      req.query.center,
      req.query.center_slug,
      payload.center_slug,
      payload.center,
    );

    if (!centerSlug) {
      return res.status(400).json({ ok: false, error: "missing_center" });
    }

    const mapped = mapIncomingLead(payload);

    if (!mapped.phone && !mapped.email) {
      return res.status(400).json({ ok: false, error: "missing_contact" });
    }

    const supabase = createServiceClient();
    const center = await findCenter(supabase, centerSlug);

    if (!center) {
      return res.status(404).json({
        ok: false,
        error: "unknown_center",
        center: centerSlug,
      });
    }

    const existingId = await findExistingLeadByPhone(
      supabase,
      center.id,
      mapped.phone,
    );
    const leadId = await importPostedLead(supabase, center.id, mapped, {
      possibleDuplicate: Boolean(existingId),
    });

    return res.status(200).json({
      ok: true,
      duplicate: Boolean(existingId),
      id: leadId,
      center: center.slug,
      center_name: center.name,
    });
  } catch (error) {
    console.error("[meta/saveleads]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to import lead",
    });
  }
};

function parsePayload(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    const text = body.trim();

    if (!text) {
      return {};
    }

    if (text.startsWith("{") || text.startsWith("[")) {
      return JSON.parse(text);
    }

    return Object.fromEntries(new URLSearchParams(text).entries());
  }

  return body;
}

function mapIncomingLead(payload) {
  const fields = flattenFields(payload);
  const fullName =
    pick(fields, ["full_name", "nom_complet", "name", "prenom_nom"]) || "";
  const nameParts = splitName(fullName);
  const formName = pick(fields, [
    "form_name",
    "form",
    "campaign",
    "campagne",
    "offre",
    "offer",
  ]);
  const pageName = pick(fields, ["page_name", "page"]);

  return {
    firstName:
      pick(fields, ["first_name", "prenom", "firstname"]) || nameParts.firstName,
    lastName:
      pick(fields, ["last_name", "nom", "lastname"]) || nameParts.lastName,
    email: pick(fields, ["email", "email_address", "mail"]),
    phone: pick(fields, ["phone", "phone_number", "telephone", "tel", "mobile"]),
    treatment:
      pick(fields, ["treatment", "service", "soin", "prestation"]) ||
      formName ||
      "Lead Meta",
    campaign: formName || pageName || "Meta Lead Ads",
    formName,
    pageName,
  };
}

async function importPostedLead(supabase, centerId, mapped, options = {}) {
  const [sourceId, campaignId, serviceId] = await Promise.all([
    ensureLeadSource(supabase, centerId, "Facebook"),
    ensureCampaign(supabase, centerId, mapped.campaign),
    ensureService(supabase, centerId, mapped.treatment),
  ]);

  const clientId = await createClientRecord(
    supabase,
    centerId,
    mapped,
    sourceId,
    campaignId,
  );
  const now = new Date().toISOString();
  const comment = mapped.pageName
    ? `Lead Meta importé depuis ${mapped.pageName}.`
    : `Lead importé depuis ${mapped.formName || "Meta"}.`;

  const { data: crmLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      center_id: centerId,
      client_id: clientId,
      source_id: sourceId,
      campaign_id: campaignId,
      service_id: serviceId,
      status: "Nouveau",
      next_action: mapped.pageName ? `Lead Meta — ${mapped.pageName}` : "À contacter",
      latest_comment: comment,
      amount_cure_ttc: 0,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
    })
    .select("id")
    .single();

  if (leadError) {
    throw new Error(leadError.message);
  }

  await supabase.from("lead_events").insert({
    center_id: centerId,
    lead_id: crmLead.id,
    event_type: "system",
    note: options.possibleDuplicate
      ? `${buildLeadNote(mapped)} Possible doublon : un prospect avec le même téléphone existe déjà.`
      : buildLeadNote(mapped),
  });

  return crmLead.id;
}

async function findCenter(supabase, slug) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,slug")
    .eq("slug", String(slug).trim().toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findExistingLeadByPhone(supabase, centerId, phone) {
  const last9 = String(phone || "").replace(/[^\d]/g, "").slice(-9);

  if (!last9) {
    return null;
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id,phone")
    .eq("center_id", centerId)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) {
    throw new Error(error.message);
  }

  const client = (data ?? []).find(
    (row) => String(row.phone || "").replace(/[^\d]/g, "").slice(-9) === last9,
  );

  if (!client?.id) {
    return null;
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("center_id", centerId)
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadError) {
    throw new Error(leadError.message);
  }

  return lead?.id ?? null;
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function createClientRecord(supabase, centerId, lead, sourceId, campaignId) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: lead.firstName || "Prospect",
      last_name: lead.lastName || "Meta",
      phone: lead.phone || null,
      email: lead.email || null,
      source_id: sourceId,
      campaign_id: campaignId,
      status: "prospect",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

async function ensureLeadSource(supabase, centerId, name) {
  const slug = slugify(name);
  const { data: existing, error: existingError } = await supabase
    .from("lead_sources")
    .select("id")
    .eq("center_id", centerId)
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("lead_sources")
    .insert({ center_id: centerId, name, slug, is_organic: false })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

async function ensureCampaign(supabase, centerId, name) {
  const normalizedName = name?.trim() || "Meta Lead Ads";
  const { data: existing, error: existingError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", normalizedName)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({ center_id: centerId, name: normalizedName, is_active: true })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

async function ensureService(supabase, centerId, name) {
  const normalizedName = name?.trim() || "Soin à préciser";
  const { data: existing, error: existingError } = await supabase
    .from("services")
    .select("id")
    .eq("center_id", centerId)
    .eq("name", normalizedName)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      center_id: centerId,
      name: normalizedName,
      duration_minutes: 60,
      price_ttc: 0,
      is_public: false,
      requires_room: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

function flattenFields(raw, prefix = "") {
  const result = {};

  if (raw == null) {
    return result;
  }

  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    if (prefix) {
      result[normalizeFieldName(prefix)] = String(raw).trim();
    }
    return result;
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object" && "name" in item) {
        const name = String(item.name);
        Object.assign(
          result,
          flattenFields(item.value ?? item.values, prefix ? `${prefix}.${name}` : name),
        );
        continue;
      }

      Object.assign(result, flattenFields(item, prefix));
    }
    return result;
  }

  if (typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      Object.assign(result, flattenFields(value, prefix ? `${prefix}.${key}` : key));
      if (value != null && (typeof value === "string" || typeof value === "number")) {
        result[normalizeFieldName(key)] = String(value).trim();
      }
    }
  }

  return result;
}

function buildLeadNote(lead) {
  return [
    "Lead reçu via webhook Meta.",
    lead.pageName ? `Page : ${lead.pageName}.` : null,
    lead.formName ? `Formulaire : ${lead.formName}.` : null,
    lead.phone ? `Téléphone : ${lead.phone}.` : null,
    lead.email ? `Email : ${lead.email}.` : null,
    lead.treatment ? `Demande : ${lead.treatment}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function pick(fields, names) {
  for (const name of names) {
    if (fields[name]) {
      return String(fields[name]).trim();
    }
  }

  return "";
}

function normalizeFieldName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitName(fullName) {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return { firstName: parts[0] || "Prospect", lastName: "Meta" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstValue(...values) {
  for (const value of values) {
    const resolved = Array.isArray(value) ? value[0] : value;
    if (resolved != null && String(resolved).trim()) {
      return String(resolved).trim().toLowerCase();
    }
  }

  return "";
}
