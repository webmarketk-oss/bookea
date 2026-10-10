const { createClient } = require("@supabase/supabase-js");
const { parsePayload } = require("../appointments/service");
const { mergeIncomingBilling } = require("../billing/_agency-invoice");
const { reconcileCardPayments } = require("../billing/_invoice-payment");
const {
  BUCKET,
  ensureBucket,
  isMissingObject,
  readBilling,
  writeBilling,
} = require("./_agency-billing-store");

const COMPANIES = new Set(["webk", "bookea"]);

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

async function requireBookeaAdmin(supabase, req) {
  const token = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return false;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return false;
  }
  const { data: admin } = await supabase
    .from("bookea_admins")
    .select("profile_id")
    .eq("profile_id", data.user.id)
    .maybeSingle();
  return Boolean(admin?.profile_id);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function mergeById(primary, secondary) {
  const byId = new Map();
  for (const item of [
    ...(Array.isArray(secondary) ? secondary : []),
    ...(Array.isArray(primary) ? primary : []),
  ]) {
    const id = String(asRecord(item).id || "").trim();
    if (id) {
      byId.set(id, item);
    }
  }
  return [...byId.values()];
}

function mergeTableBilling(company, state, tablePayload) {
  const table = { ...asRecord(tablePayload) };
  delete table.mailbox;
  if (!state) {
    return Object.keys(table).length > 0 ? { ...table, company } : null;
  }
  return {
    ...state,
    invoices: mergeById(state.invoices, table.invoices),
    clients: mergeById(state.clients, table.clients),
  };
}

function tableMigrationPath(company) {
  return `agency-billing/${company}.from-table`;
}

async function readTableBilling(supabase, company) {
  const { data, error } = await supabase
    .from("admin_agency_billing")
    .select("payload")
    .eq("company", company)
    .maybeSingle();
  if (error) {
    console.error("[admin/agency-billing] table", error.message);
    return null;
  }
  return data?.payload ?? null;
}

async function adoptTableBilling(supabase, company, state) {
  const marker = await supabase.storage
    .from(BUCKET)
    .download(tableMigrationPath(company));
  if (marker.data) {
    return state;
  }
  if (marker.error && !isMissingObject(marker.error)) {
    throw marker.error;
  }

  const merged = mergeTableBilling(
    company,
    state,
    await readTableBilling(supabase, company),
  );
  if (merged && merged !== state) {
    await writeBilling(supabase, company, merged);
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(tableMigrationPath(company), Buffer.from(new Date().toISOString()), {
      contentType: "text/plain",
      upsert: true,
    });
  if (error) {
    throw error;
  }
  return merged;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const supabase = createServiceClient();
    if (!(await requireBookeaAdmin(supabase, req))) {
      return res.status(403).json({
        ok: false,
        error: "Accès réservé à l’équipe Bookea.",
      });
    }

    const payload = req.method === "PUT" ? parsePayload(req.body) : {};
    const company = String(req.query?.company || payload.company || "").trim();
    if (!COMPANIES.has(company)) {
      return res.status(400).json({ ok: false, error: "Société inconnue." });
    }

    await ensureBucket(supabase);

    if (req.method === "GET") {
      let state = await adoptTableBilling(
        supabase,
        company,
        await readBilling(supabase, company),
      );
      if (company === "bookea" && state) {
        state = (await reconcileCardPayments(supabase).catch((error) => {
          console.error("[admin/agency-billing] stripe", error);
          return null;
        })) || state;
      }
      return res.status(200).json({ ok: true, state });
    }

    const incoming = payload.state;
    if (!incoming || typeof incoming !== "object" || incoming.company !== company) {
      return res.status(400).json({ ok: false, error: "Facturation invalide." });
    }
    const state = mergeIncomingBilling(
      await readBilling(supabase, company),
      incoming,
    );
    await writeBilling(supabase, company, state);
    return res.status(200).json({
      ok: true,
      updatedAt: state.updatedAt || null,
      revision: state.revision,
      state,
    });
  } catch (error) {
    console.error("[admin/agency-billing]", error);
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "La facturation n’a pas pu être enregistrée.",
    });
  }
}

module.exports = handler;
module.exports.mergeTableBilling = mergeTableBilling;
