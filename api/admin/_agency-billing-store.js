const {
  normalizeServerBilling,
  stampServerRevision,
} = require("../billing/_agency-invoice");

const BUCKET = "bookea-admin-private";
const MAX_BYTES = 8 * 1024 * 1024;

async function ensureBucket(supabase) {
  const existing = await supabase.storage.getBucket(BUCKET);
  if (existing.data) {
    return;
  }
  const created = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message || "")) {
    throw created.error;
  }
}

function billingPath(company) {
  return `agency-billing/${company}.json`;
}

function isMissingObject(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  return status === 404 || /not.?found|does not exist/i.test(String(error?.message || ""));
}

async function readBilling(supabase, company) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(billingPath(company));
  if (error) {
    if (isMissingObject(error)) {
      return null;
    }
    throw error;
  }
  const text = await data.text();
  return text ? JSON.parse(text) : null;
}

async function writeBilling(supabase, company, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.length > MAX_BYTES) {
    throw new Error("Données de facturation trop volumineuses.");
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(billingPath(company), body, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) {
    throw error;
  }
}

async function updateServerBilling(supabase, company, change) {
  await ensureBucket(supabase);
  const current = normalizeServerBilling(
    company,
    await readBilling(supabase, company),
  );
  const result = change(current);
  if (!result?.state) {
    return { state: current, ...result };
  }
  const revision = (Number(current.revision) || 0) + 1;
  const invoiceIds = new Set(result.invoiceIds || []);
  const clientIds = new Set(result.clientIds || []);
  const state = {
    ...result.state,
    invoices: stampServerRevision(result.state.invoices, invoiceIds, revision),
    clients: stampServerRevision(result.state.clients, clientIds, revision),
    revision,
    updatedAt: new Date().toISOString(),
  };
  await writeBilling(supabase, company, state);
  return { ...result, state };
}

module.exports = {
  BUCKET,
  ensureBucket,
  isMissingObject,
  readBilling,
  updateServerBilling,
  writeBilling,
};
