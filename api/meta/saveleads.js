/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { careLabelForFamily, inferCareFamily } = require("../seya/care-family");
const { welcomeNewLead } = require("../seya/welcome");
const { resolvePersonName } = require("../../lib/seya-person-name");
const { findCenterBySlug } = require("./center-slug");

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
    const payload = await readRequestPayload(req);
    const centerSlug = firstValue(
      req.query.center,
      req.query.center_slug,
      payload.center_slug,
      payload.center,
    );

    if (!centerSlug) {
      return res.status(400).json({ ok: false, error: "missing_center" });
    }

    const mapped = recoverIncomingLead(
      mapIncomingLead(payload, req.query),
      { ...payload, ...queryFields(req.query) },
    );
    const sourceName = resolveIncomingSource(payload, req.query, "Facebook");
    const phone = isPlaceholderValue(mapped.phone) ? "" : mapped.phone;
    const email = isPlaceholderValue(mapped.email) ? "" : mapped.email;
    const firstName = isJunkLeadName(mapped.firstName) ? "" : mapped.firstName;

    if (!phone && !email) {
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

    const imported = {
      ...mapped,
      firstName: firstName || "Prospect",
      phone,
      email,
    };
    const existingId = await findExistingLeadByPhone(
      supabase,
      center.id,
      imported.phone,
    );
    const leadId = await importPostedLead(supabase, center.id, imported, {
      possibleDuplicate: Boolean(existingId),
      sourceName,
    });

    let whatsapp = { sent: false, skipped: "no_phone" };
    if (imported.phone) {
      whatsapp = await welcomeNewLead(supabase, center, {
        leadId,
        firstName: imported.firstName,
        lastName: imported.lastName,
        phone: imported.phone,
        treatment: mapped.treatment,
        campaign: mapped.campaign,
      }).catch((error) => {
        console.error("[meta/saveleads] seya welcome", error);
        return { sent: false, skipped: "welcome_failed" };
      });
    }

    return res.status(200).json({
      ok: true,
      duplicate: Boolean(existingId),
      id: leadId,
      center: center.slug,
      center_name: center.name,
      whatsapp,
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

  if (Array.isArray(body)) {
    return parsePayload(body[0]);
  }

  if (typeof body === "string") {
    const text = body.trim();

    if (!text) {
      return {};
    }

    if (text.startsWith("{") || text.startsWith("[")) {
      return JSON.parse(text);
    }

    const loose = extractLooseContact(text);
    if (loose.phone || loose.email) {
      return loose;
    }

    return Object.fromEntries(new URLSearchParams(text).entries());
  }

  return body;
}

function stringifyBody(body) {
  if (typeof body === "string") {
    return body;
  }
  if (body == null) {
    return "";
  }
  if (typeof body === "object") {
    try {
      return JSON.stringify(body);
    } catch {
      return Object.values(body).join("\n");
    }
  }
  return String(body);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function extractLooseContact(text) {
  const raw = String(text || "").replace(/\u00a0/g, " ");
  const emailMatch = extractEmailFromBlob(raw);
  const phoneMatch = raw.match(
    /(?:\+33|0033|0)\s*[1-9](?:[\s.-]*\d{2}){4}/,
  );
  let leftover = raw;
  if (emailMatch) {
    leftover = leftover.replace(emailMatch, "\n");
  }
  if (phoneMatch) {
    leftover = leftover.replace(phoneMatch[0], "\n");
  }
  const lines = leftover
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const names = [];
  const offers = [];
  for (const line of lines) {
    const split = splitNameAndOffer(line);
    if (split.name) {
      names.push(split.name);
    }
    if (split.offer) {
      offers.push(split.offer);
    }
  }
  return {
    full_name: names[0] || "",
    phone: phoneMatch ? phoneMatch[0] : "",
    email: emailMatch || "",
    offre: offers.join(" ").trim(),
  };
}

function looksLikeOfferText(value) {
  return /\b(offert|offre|bilan|laser|epilation|épilation|seance|séance|hydrafacial|minceur|cryolipolyse)\b/i.test(
    String(value || ""),
  );
}

function splitNameAndOffer(line) {
  const text = String(line || "").trim();
  if (!text) {
    return { name: "", offer: "" };
  }
  const match = text.match(
    /^(.*?)(?=\b(?:bilan|laser|offert|offre|epilation|épilation|hydrafacial|minceur|cryolipolyse)\b)/i,
  );
  const maybeName = String(match?.[1] || "").trim();
  if (maybeName && maybeName.split(/\s+/).length >= 2) {
    return { name: maybeName, offer: text.slice(maybeName.length).trim() };
  }
  if (looksLikeOfferText(text)) {
    return { name: "", offer: text };
  }
  return { name: text, offer: "" };
}

function extractEmailFromBlob(text) {
  const found = [];
  const raw = String(text || "");
  const pattern =
    /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.(?:com|fr|net|org|io|co|uk|eu|be|ch|info|app)/gi;
  let match;
  while ((match = pattern.exec(raw))) {
    found.push(match[0]);
    const [local, domain] = match[0].split("@");
    const splitOnPhone = String(local || "").match(/0[1-9]\d{8}([A-Z0-9._%+-]+)$/i);
    if (splitOnPhone?.[1] && domain) {
      found.push(`${splitOnPhone[1]}@${domain}`);
    }
  }
  const clean = found.filter((email) => {
    const local = email.split("@")[0] || "";
    return local.length >= 2 && local.length <= 64 && !/(?:0[1-9]\d{8})/.test(local);
  });
  return [...clean].sort((a, b) => a.length - b.length)[0] || "";
}

function payloadFromBody(body) {
  const parsed = unwrapLeadPayload(parsePayload(body));
  const loose = extractLooseContact(stringifyBody(body));
  if (!loose.phone && !loose.email) {
    return parsed;
  }
  return {
    ...loose,
    ...parsed,
    full_name: firstNonEmpty(
      skipPlaceholder(parsed.full_name),
      skipPlaceholder(parsed.name),
      loose.full_name,
    ),
    phone: firstNonEmpty(
      skipPlaceholder(parsed.phone),
      skipPlaceholder(parsed.phone_number),
      skipPlaceholder(parsed.telephone),
      loose.phone,
    ),
    email: firstNonEmpty(skipPlaceholder(parsed.email), loose.email),
    offre: firstNonEmpty(
      skipPlaceholder(parsed.offre),
      skipPlaceholder(parsed.offer),
      loose.offre,
    ),
  };
}

async function readRawBody(req) {
  if (typeof req.body === "string" && req.body.trim()) {
    return req.body;
  }
  if (Buffer.isBuffer(req.body) && req.body.length) {
    return req.body.toString("utf8");
  }
  if (req.rawBody) {
    return String(req.rawBody);
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return "";
  }
  const chunks = [];
  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    chunks.length = 0;
  }
  if (chunks.length) {
    return Buffer.concat(chunks).toString("utf8");
  }
  return "";
}

async function readRequestPayload(req) {
  const parsedObject =
    req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
      ? req.body
      : null;
  const raw = await readRawBody(req);
  const fromRaw = raw ? payloadFromBody(raw) : {};
  const fromParsed = parsedObject ? payloadFromBody(parsedObject) : {};
  return unwrapLeadPayload({ ...fromRaw, ...fromParsed });
}

function unwrapLeadPayload(payload) {
  if (Array.isArray(payload)) {
    return unwrapLeadPayload(payload[0] || {});
  }
  if (!payload || typeof payload !== "object") {
    return payload || {};
  }
  const nestedKeys = [
    "data",
    "payload",
    "body",
    "bundle",
    "lead",
    "contact",
    "item",
    "webhook",
  ];
  for (const key of nestedKeys) {
    const nested = payload[key];
    if (Array.isArray(nested)) {
      const rest = { ...payload };
      delete rest[key];
      return unwrapLeadPayload({ ...rest, ...(nested[0] || {}) });
    }
    if (nested && typeof nested === "object") {
      const rest = { ...payload };
      delete rest[key];
      return unwrapLeadPayload({ ...rest, ...nested });
    }
    if (typeof nested === "string" && nested.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(nested);
        if (parsed && typeof parsed === "object") {
          const rest = { ...payload };
          delete rest[key];
          return unwrapLeadPayload({ ...rest, ...parsed });
        }
      } catch {
        // keep going
      }
    }
  }
  return payload;
}

function skipPlaceholder(value) {
  return isPlaceholderValue(value) ? "" : String(value ?? "").trim();
}

function pickExact(fields, names) {
  for (const name of names) {
    if (fields[name]) {
      return String(fields[name]).trim();
    }
  }
  return "";
}

function mapIncomingLead(payload, query) {
  const fields = {
    ...flattenFields(queryFields(query)),
    ...flattenFields(payload),
  };
  const person = resolvePersonName(
    {
      ...fields,
      ...pickedField(fields, "first_name", [
        "member_first_name",
        "contact_first_name",
        "first_name",
        "prenom",
        "firstname",
      ]),
      ...pickedField(fields, "last_name", [
        "member_last_name",
        "contact_last_name",
        "last_name",
        "lastname",
        "surname",
      ]),
      ...pickedField(fields, "full_name", [
        "member_name",
        "contact_name",
        "full_name",
        "nom_complet",
        "prenom_nom",
        "name",
      ]),
    },
    pickExact,
  );
  const formName = pickUseful(fields, [
    "form_name",
    "form",
    "campaign",
    "campagne",
    "campaign_name",
  ]);
  const pageName = pickUseful(fields, ["page_name", "page"]);
  const adName = pickUseful(fields, ["ad_name", "ad", "adset_name", "publicite"]);
  const offer = pickOffer(fields);
  const treatment = cleanIncomingTreatment(
    offer ||
      pickUseful(fields, [
        "treatment",
        "service",
        "soin",
        "prestation",
        "interet",
        "interesse",
        "interest",
      ]) ||
      formName ||
      adName,
    fields,
  );

  const mapped = {
    firstName: person.firstName || "Prospect",
    lastName: person.lastName,
    email: pickLeadEmail(fields),
    phone: pickLeadValue(fields, [
      "contact_phone_number",
      "phone",
      "phone_number",
      "phonenumber",
      "work_phone_number",
      "mobile_phone",
      "telephone",
      "tel",
      "mobile",
      "numero",
      "numero_de_telephone",
    ]),
    treatment,
    campaign:
      offer ||
      treatment ||
      formName ||
      adName ||
      pageName ||
      "Meta Lead Ads",
    formName,
    pageName,
    offer,
  };
  return recoverIncomingLead(mapped, fields);
}

function isPlaceholderValue(value) {
  return /^(nom|tel|mail|email|offre|ici[1-4])$/i.test(String(value || "").trim());
}

function isJunkLeadName(value) {
  if (isPlaceholderValue(value)) {
    return true;
  }
  const needle = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /sfk|agency fz/.test(needle);
}

function stripPlaceholderTokens(text) {
  return String(text || "")
    .replace(/^(OFFRE|NOM|TEL|MAIL)+/i, "")
    .replace(/\b(NOM|TEL|MAIL|OFFRE|ICI[1-4])\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recoverIncomingLead(mapped, fields) {
  const phone = isPlaceholderValue(mapped.phone) ? "" : mapped.phone;
  const email = isPlaceholderValue(mapped.email) ? "" : mapped.email;
  const firstName = isJunkLeadName(mapped.firstName) ? "" : mapped.firstName;
  const campaign = isPlaceholderValue(mapped.campaign)
    ? ""
    : String(mapped.campaign || "").startsWith("OFFRE")
      ? ""
      : mapped.campaign;
  const needsRecovery =
    !firstName ||
    firstName === "Prospect" ||
    !phone ||
    !email ||
    /^OFFRE/i.test(String(mapped.campaign || ""));

  if (!needsRecovery) {
    return { ...mapped, phone, email, firstName };
  }

  const blob = stripPlaceholderTokens(
    [
      mapped.campaign,
      mapped.treatment,
      mapped.offer,
      fields?.offre,
      fields?.offer,
      mapped.firstName,
      mapped.lastName,
      mapped.phone,
      mapped.email,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const loose = extractLooseContact(blob);
  const recovered = resolvePersonName(
    { full_name: loose.full_name, first_name: firstName },
    pickExact,
  );
  const fromEmail = nameFromEmailLocal(email || loose.email);
  const recoveredEmail = fromEmail
    ? resolvePersonName({ full_name: fromEmail }, pickExact)
    : { firstName: "", lastName: "" };
  const lastName = isJunkLeadName(mapped.lastName) ? "" : mapped.lastName;

  return {
    ...mapped,
    firstName:
      firstName && firstName !== "Prospect"
        ? firstName
        : recovered.firstName || recoveredEmail.firstName || "Prospect",
    lastName: lastName || recovered.lastName || recoveredEmail.lastName,
    phone: phone || loose.phone,
    email: email || loose.email,
    campaign: campaign || loose.offre || mapped.campaign,
    treatment:
      mapped.treatment &&
      !isPlaceholderValue(mapped.treatment) &&
      !String(mapped.treatment).startsWith("OFFRE")
        ? mapped.treatment
        : loose.offre || mapped.treatment,
  };
}

function nameFromEmailLocal(email) {
  const local = String(email || "")
    .split("@")[0]
    .replace(/[0-9]+/g, " ")
    .trim();
  if (!local) {
    return "";
  }
  const separated = local.split(/[._+\-]+/).filter(Boolean);
  if (separated.length >= 2) {
    return separated.map(titleCaseNameWord).join(" ");
  }
  return splitConcatenatedName(separated[0] || local);
}

function splitConcatenatedName(value) {
  const chunks = [
    ["exclusive", "Exclusive"],
    ["beaute", "Beauté"],
    ["reseau", "Réseau"],
    ["beauty", "Beauty"],
    ["institut", "Institut"],
  ];
  const found = [];
  let rest = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  while (rest.length) {
    const match = chunks
      .filter(([token]) => rest.startsWith(token))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (!match) {
      break;
    }
    found.push(match[1]);
    rest = rest.slice(match[0].length);
  }
  return found.length >= 2 && !rest ? found.join(" ") : "";
}

function titleCaseNameWord(value) {
  const word = String(value || "").trim();
  if (!word) {
    return "";
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function isJunkIncoming(value) {
  const needle = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    !needle ||
    /lead meta|meta lead|webhook|a preciser|facebook|systeme/.test(needle)
  );
}

function inferTreatmentFromBlob(text) {
  return careLabelForFamily(inferCareFamily(text));
}

function cleanIncomingTreatment(value, fields) {
  if (!isJunkIncoming(value)) {
    return inferTreatmentFromBlob(value) || String(value).trim();
  }
  return inferTreatmentFromBlob(Object.values(fields || {}).join(" ")) || "";
}

async function importPostedLead(supabase, centerId, mapped, options = {}) {
  const sourceName = options.sourceName || "Facebook";
  const [sourceId, campaignId, serviceId] = await Promise.all([
    ensureLeadSource(supabase, centerId, sourceName),
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
    ? `Lead importé depuis ${mapped.pageName}.`
    : `Lead importé depuis ${mapped.formName || sourceName}.`;

  const { data: crmLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      center_id: centerId,
      client_id: clientId,
      source_id: sourceId,
      campaign_id: campaignId,
      service_id: serviceId,
      status: "Nouveau",
      next_action: mapped.pageName
        ? `Lead ${sourceName} — ${mapped.pageName}`
        : "À contacter",
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
  return findCenterBySlug(supabase, slug);
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
      last_name: lead.lastName || "",
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

  if (typeof raw === "string") {
    const text = skipPlaceholder(raw.trim());
    if (!text) {
      return result;
    }
    if (prefix) {
      result[normalizeFieldName(prefix)] = text;
    }
    if (
      (text.startsWith("{") && text.endsWith("}")) ||
      (text.startsWith("[") && text.endsWith("]"))
    ) {
      try {
        Object.assign(result, flattenFields(JSON.parse(text), prefix));
      } catch {
        // keep the raw string
      }
    }
    return result;
  }

  if (typeof raw === "number" || typeof raw === "boolean") {
    if (prefix) {
      result[normalizeFieldName(prefix)] = String(raw).trim();
    }
    return result;
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isFieldPair(item)) {
        const name = fieldPairName(item);
        const value = fieldPairValue(item);
        Object.assign(result, flattenFields(value, name));
        if (prefix) {
          Object.assign(result, flattenFields(value, `${prefix}.${name}`));
        }
        continue;
      }

      Object.assign(result, flattenFields(item, prefix));
    }
    return result;
  }

  if (typeof raw === "object") {
    if (isFieldPair(raw)) {
      const name = fieldPairName(raw);
      const value = fieldPairValue(raw);
      Object.assign(result, flattenFields(value, name));
      if (prefix) {
        Object.assign(result, flattenFields(value, `${prefix}.${name}`));
      }
      return result;
    }

    for (const [key, value] of Object.entries(raw)) {
      Object.assign(result, flattenFields(value, prefix ? `${prefix}.${key}` : key));
      if (value != null && (typeof value === "string" || typeof value === "number")) {
        const text = skipPlaceholder(value);
        if (!text) {
          continue;
        }
        const short = normalizeFieldName(key);
        if (!prefix) {
          result[short] = text;
        } else if (shouldPromoteNestedField(prefix, short) && !result[short]) {
          result[short] = text;
        }
      }
    }
  }

  return result;
}

function resolveIncomingSource(payload, query, fallback = "Facebook") {
  const raw = firstValue(
    query?.source,
    query?.origin,
    payload?.source,
    payload?.origin,
    payload?.via,
  );
  const needle = String(raw || fallback || "facebook")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/systeme/.test(needle)) {
    return "Systeme.io";
  }
  if (/make/.test(needle)) {
    return "Make";
  }
  if (/savemyleads|save.?my.?leads/.test(needle)) {
    return "SaveMyLeads";
  }
  if (/facebook|meta/.test(needle)) {
    return "Facebook";
  }
  const label = String(raw || fallback || "Facebook").trim();
  return label || "Facebook";
}

function buildLeadNote(lead) {
  return [
    "Lead reçu via webhook Bookea.",
    lead.pageName ? `Page : ${lead.pageName}.` : null,
    lead.formName ? `Formulaire : ${lead.formName}.` : null,
    lead.phone ? `Téléphone : ${lead.phone}.` : null,
    lead.email ? `Email : ${lead.email}.` : null,
    lead.treatment ? `Demande : ${lead.treatment}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function isAffiliateField(key) {
  return /affiliate/.test(String(key || "").toLowerCase());
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function affiliateEmailsFrom(fields) {
  return new Set(
    Object.entries(fields || {})
      .filter(([key, value]) => isAffiliateField(key) && /email/.test(key) && value)
      .map(([, value]) => normalizeEmail(value)),
  );
}

function pickLeadEmail(fields) {
  const blocked = affiliateEmailsFrom(fields);
  const candidates = [
    pickLeadValue(fields, ["member_email"]),
    pickLeadValue(fields, ["contact_email"]),
    pickLeadValue(fields, ["email", "email_address", "mail"]),
  ];

  for (const candidate of candidates) {
    const email = String(candidate || "").trim();
    if (email && !blocked.has(normalizeEmail(email))) {
      return email;
    }
  }

  return "";
}

function pick(fields, names) {
  return pickLeadValue(fields, names);
}

function pickLeadValue(fields, names) {
  const keys = Object.keys(fields || {}).filter((key) => !isAffiliateField(key));
  const preferred = keys.filter((key) => /(?:^|_)(member|contact)(?:_|$)/.test(key));
  const blockedNames = affiliateNamesFrom(fields);

  for (const name of names) {
    for (const group of [preferred, keys]) {
      if (fields[name] && group.includes(name)) {
        const value = skipPlaceholder(fields[name]);
        if (value && !blockedNames.has(normalizeNameValue(value))) {
          return value;
        }
      }
      const matches = group.filter(
        (key) =>
          key === name || key.endsWith(`_${name}`) || key.endsWith(`.${name}`),
      );
      for (const match of matches) {
        const value = skipPlaceholder(fields[match]);
        if (value && !blockedNames.has(normalizeNameValue(value))) {
          return value;
        }
      }
    }
  }

  return "";
}

function pickedField(fields, key, names) {
  const value = pickLeadValue(fields, names);
  return value ? { [key]: value } : {};
}

function normalizeNameValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function affiliateNamesFrom(fields) {
  return new Set(
    Object.entries(fields || {})
      .filter(([key, value]) => isAffiliateField(key) && /name/.test(key) && value)
      .map(([, value]) => normalizeNameValue(value)),
  );
}

function pickUseful(fields, names) {
  const keys = Object.keys(fields || {});
  for (const name of names) {
    const direct = fields[name];
    if (direct && !isJunkIncoming(direct) && !isPlaceholderValue(direct)) {
      return String(direct).trim();
    }
    const match = keys.find(
      (key) => key === name || key.endsWith(`_${name}`) || key.endsWith(`.${name}`),
    );
    if (
      match &&
      fields[match] &&
      !isJunkIncoming(fields[match]) &&
      !isPlaceholderValue(fields[match])
    ) {
      return String(fields[match]).trim();
    }
  }

  return "";
}

function pickOffer(fields) {
  const preferred = pickUseful(fields, [
    "offre",
    "offer_title",
    "payload_offer_title",
    "offer_name",
    "titre_offre",
    "offer",
    "ad_offer",
  ]);
  if (preferred) {
    return preferred;
  }

  const keys = Object.keys(fields || {});
  const match = keys.find((key) =>
    /(^|_)(offre|offer_title|payload_offer_title|titre_offre|offer_name)(_|$)/.test(
      key,
    ),
  );
  if (match && fields[match] && !isJunkIncoming(fields[match])) {
    return String(fields[match]).trim();
  }

  return "";
}

function queryFields(query) {
  if (!query || typeof query !== "object") {
    return {};
  }

  const result = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "center" || key === "center_slug") {
      continue;
    }
    const text = Array.isArray(value) ? value[0] : value;
    if (isPlaceholderValue(text)) {
      continue;
    }
    result[key] = text;
  }
  return result;
}

function shouldPromoteNestedField(prefix, short) {
  if (short !== "name") {
    return true;
  }
  const last = String(prefix || "")
    .split(/[._]/)
    .filter(Boolean)
    .pop();
  return /^\d+$/.test(last || "");
}

function isFieldPair(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  const name = fieldPairName(item);
  return Boolean(name) && fieldPairValue(item) != null;
}

function fieldPairName(item) {
  const name = item.name ?? item.key ?? item.label ?? item.question ?? item.field;
  return name == null ? "" : String(name).trim();
}

function fieldPairValue(item) {
  if ("value" in item) return item.value;
  if ("values" in item) return item.values;
  if ("answer" in item) return item.answer;
  if ("title" in item) return item.title;
  return null;
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

module.exports.mapIncomingLead = mapIncomingLead;
module.exports.resolveIncomingSource = resolveIncomingSource;
module.exports.extractLooseContact = extractLooseContact;
module.exports.payloadFromBody = payloadFromBody;
module.exports.unwrapLeadPayload = unwrapLeadPayload;
