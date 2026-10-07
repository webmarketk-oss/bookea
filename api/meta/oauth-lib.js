const GRAPH_VERSION = "v26.0";
const META_PUBLIC_BASE = "https://www.bookeai.fr";
const OAUTH_SCOPES = ["pages_show_list", "leads_retrieval"];

function getMetaPublicBaseUrl() {
  return META_PUBLIC_BASE;
}

function extractPageRef(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const fromQuery = text.match(/[?&]id=(\d{8,})/i);
  if (fromQuery) {
    return fromQuery[1];
  }
  const fromPath = text.match(/facebook\.com\/(?:pages\/[^/]+\/)?(\d{8,})\b/i);
  if (fromPath) {
    return fromPath[1];
  }
  const vanity = text.match(
    /(?:facebook\.com|fb\.com)\/(?:pages\/)?([A-Za-z0-9.]+)\/?/i,
  );
  if (vanity && !/^(pages|profile\.php|groups|watch|share|reel)$/i.test(vanity[1])) {
    return vanity[1];
  }
  return text.replace(/^@/, "");
}

function normalizePageNeedle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.)?(facebook|fb)\.com\//, "")
    .replace(/\/+$/, "");
}

function matchManagedPage(pages, needle) {
  const wanted = extractPageRef(needle);
  if (!wanted) {
    return null;
  }
  const exact = (pages || []).find((page) => String(page?.id) === String(wanted));
  if (exact) {
    return exact;
  }
  const normalized = normalizePageNeedle(wanted);
  return (
    (pages || []).find((page) => {
      const username = normalizePageNeedle(page?.username);
      const name = normalizePageNeedle(page?.name);
      const link = normalizePageNeedle(page?.link);
      return (
        username === normalized ||
        name === normalized ||
        (link && (link === normalized || link.endsWith(`/${normalized}`)))
      );
    }) || null
  );
}

async function exchangeLongLivedToken({ appId, appSecret, userToken }) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", userToken);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    return userToken;
  }
  return data.access_token;
}

async function fetchManagedPages(userToken) {
  const pages = [];
  let next = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  next.searchParams.set("fields", "id,name,access_token,username,link");
  next.searchParams.set("limit", "100");
  next.searchParams.set("access_token", userToken);

  for (let i = 0; i < 10 && next; i += 1) {
    const response = await fetch(next);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || "Impossible de lire les pages Facebook.");
    }
    pages.push(...(Array.isArray(data.data) ? data.data : []));
    next = data.paging?.next ? new URL(data.paging.next) : null;
  }

  return pages.filter((page) => page?.id && page?.access_token);
}

module.exports = {
  GRAPH_VERSION,
  OAUTH_SCOPES,
  getMetaPublicBaseUrl,
  extractPageRef,
  matchManagedPage,
  exchangeLongLivedToken,
  fetchManagedPages,
};
