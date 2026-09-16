/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

const GRAPH_VERSION = "v26.0";

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return verifyWebhook(req, res);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createServiceClient();
    const changes = extractLeadgenChanges(req.body);

    for (const change of changes) {
      await importMetaLead(supabase, change);
    }

    return res.status(200).json({ received: true, imported: changes.length });
  } catch (error) {
    console.error("[meta/leads]", error);
    return res.status(500).json({ error: "Unable to import Meta lead" });
  }
};

function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken = process.env.META_VERIFY_TOKEN || "bookea-meta-leads-2026";

  if (mode === "subscribe" && token === expectedToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Forbidden");
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

function extractLeadgenChanges(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  return entries.flatMap((entry) =>
    (Array.isArray(entry.changes) ? entry.changes : [])
      .filter((change) => change?.field === "leadgen" && change.value?.leadgen_id)
      .map((change) => ({
        leadgenId: change.value.leadgen_id,
        pageId: change.value.page_id ?? null,
        formId: change.value.form_id ?? null,
        adId: change.value.ad_id ?? null,
        campaignId: change.value.campaign_id ?? null,
        raw: change.value,
      })),
  );
}

async function importMetaLead(supabase, change) {
  const lead = await fetchMetaLead(change.leadgenId);
  const mapped = mapMetaLead(lead, change);
  const centerId = await resolveCenterId(supabase, change);
  const [sourceId, campaignId, serviceId] = await Promise.all([
    ensureLeadSource(supabase, centerId, "Facebook"),
    ensureCampaign(supabase, centerId, mapped.campaign),
    ensureService(supabase, centerId, mapped.treatment),
  ]);

  const clientId = await createClientRecord(supabase, centerId, mapped, sourceId, campaignId);
  const now = new Date().toISOString();

  const { data: crmLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      center_id: centerId,
      client_id: clientId,
      source_id: sourceId,
      campaign_id: campaignId,
      service_id: serviceId,
      status: "Nouveau",
      next_action: "À contacter",
      latest_comment: `Lead Facebook importé depuis le formulaire ${change.formId ?? "Meta"}.`,
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

  const note = buildLeadNote(mapped, change);
  await supabase.from("lead_events").insert({
    center_id: centerId,
    lead_id: crmLead.id,
    event_type: "system",
    note,
  });
}

async function fetchMetaLead(leadgenId) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing META_PAGE_ACCESS_TOKEN");
  }

  const fields = "created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data";
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Unable to fetch Meta lead");
  }

  return data;
}

function mapMetaLead(lead, change) {
  const fields = Object.fromEntries(
    (Array.isArray(lead.field_data) ? lead.field_data : []).map((field) => [
      normalizeFieldName(field.name),
      Array.isArray(field.values) ? field.values[0] ?? "" : "",
    ]),
  );

  const fullName =
    pick(fields, ["full_name", "nom_complet", "name", "prenom_nom"]) || "Prospect Facebook";
  const nameParts = splitName(fullName);

  return {
    firstName: pick(fields, ["first_name", "prenom"]) || nameParts.firstName,
    lastName: pick(fields, ["last_name", "nom"]) || nameParts.lastName,
    email: pick(fields, ["email", "email_address", "adresse_email"]),
    phone: pick(fields, ["phone_number", "phone", "telephone", "numero_de_telephone"]),
    treatment:
      pick(fields, ["service", "soin", "prestation", "traitement", "interet"]) ||
      lead.ad_name ||
      "Soin à préciser",
    campaign: lead.campaign_name || change.campaignId || "Meta Lead Ads",
    rawFields: fields,
  };
}

async function resolveCenterId(supabase, change) {
  if (change.formId) {
    try {
      const { data, error } = await supabase
        .from("facebook_lead_forms")
        .select("center_id")
        .eq("form_id", change.formId)
        .eq("is_active", true)
        .maybeSingle();

      if (!error && data?.center_id) {
        return data.center_id;
      }
    } catch {
      // The mapping table is optional for the first setup. Fallback below keeps Meta import usable.
    }
  }

  if (change.pageId) {
    try {
      const { data, error } = await supabase
        .from("facebook_lead_forms")
        .select("center_id")
        .eq("page_id", change.pageId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!error && data?.center_id) {
        return data.center_id;
      }
    } catch {
      // Same optional mapping fallback as above.
    }
  }

  const slug = process.env.META_DEFAULT_CENTER_SLUG ?? process.env.NEXT_PUBLIC_DEFAULT_CENTER_SLUG;

  if (!slug) {
    throw new Error("Missing META_DEFAULT_CENTER_SLUG");
  }

  const { data: center, error } = await supabase
    .from("centers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!center?.id) {
    throw new Error(`Center not found for slug ${slug}`);
  }

  return center.id;
}

async function createClientRecord(supabase, centerId, lead, sourceId, campaignId) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: lead.firstName || "Prospect",
      last_name: lead.lastName || "Facebook",
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

function buildLeadNote(lead, change) {
  const details = [
    "Lead reçu depuis Facebook Lead Ads.",
    change.formId ? `Formulaire Meta : ${change.formId}.` : null,
    lead.phone ? `Téléphone : ${lead.phone}.` : null,
    lead.email ? `Email : ${lead.email}.` : null,
    lead.treatment ? `Demande : ${lead.treatment}.` : null,
  ].filter(Boolean);

  return details.join(" ");
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
    return { firstName: parts[0] || "Prospect", lastName: "Facebook" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
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
