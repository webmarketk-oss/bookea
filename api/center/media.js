const { createClient } = require("@supabase/supabase-js");

const BUCKET = "center-media";
const MAX_BYTES = 3 * 1024 * 1024;

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

function extensionFor(contentType, filename) {
  const fromName = String(filename || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 5) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  if (contentType.includes("gif")) {
    return "gif";
  }
  return "jpg";
}

function sanitizeSegment(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80);
}

function pathFromPublicUrl(url) {
  const text = String(url || "");
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = text.indexOf(marker);
  if (index < 0) {
    return "";
  }
  return decodeURIComponent(text.slice(index + marker.length).split("?")[0]);
}

async function ensureBucket(supabase) {
  const existing = await supabase.storage.getBucket(BUCKET);
  if (existing.data) {
    return;
  }
  const created = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message || "")) {
    throw created.error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const payload = parsePayload(req.body);
  const centerId = sanitizeSegment(payload.centerId);
  if (!centerId) {
    return res.status(400).json({ ok: false, error: "missing_center" });
  }

  try {
    const supabase = createServiceClient();
    await ensureBucket(supabase);

    if (req.method === "DELETE") {
      const path = pathFromPublicUrl(payload.url);
      if (!path || !path.startsWith(`${centerId}/`)) {
        return res.status(200).json({ ok: true, skipped: true });
      }
      await supabase.storage.from(BUCKET).remove([path]);
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, DELETE, OPTIONS");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const kind = sanitizeSegment(payload.kind) || "photo";
    const contentType = String(payload.contentType || "image/jpeg").split(";")[0];
    const raw = String(payload.data || "").replace(/\s/g, "");
    if (!raw) {
      return res.status(400).json({ ok: false, error: "missing_file" });
    }

    const buffer = Buffer.from(raw, "base64");
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return res.status(400).json({ ok: false, error: "invalid_file" });
    }

    const ext = extensionFor(contentType, payload.filename);
    const path = `${centerId}/${kind}-${Date.now()}.${ext}`;
    const uploaded = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: true,
    });

    if (uploaded.error) {
      return res.status(200).json({
        ok: false,
        error: uploaded.error.message,
      });
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return res.status(200).json({ ok: true, url: publicUrl, path });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      error: error instanceof Error ? error.message : "upload_failed",
    });
  }
};
