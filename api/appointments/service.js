const { createClient } = require("@supabase/supabase-js");

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

const hits = new Map();

function rateLimit(key, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
  list.push(now);
  hits.set(key, list);

  if (hits.size > 2000) {
    for (const [entryKey, stamps] of hits) {
      if (stamps.every((stamp) => now - stamp >= windowMs)) {
        hits.delete(entryKey);
      }
    }
  }

  return list.length <= max;
}

function relationObject(value) {
  return Array.isArray(value) ? value[0] : value;
}

module.exports = {
  createServiceClient,
  firstValue,
  parsePayload,
  rateLimit,
  relationObject,
};
