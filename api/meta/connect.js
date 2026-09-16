const GRAPH_VERSION = "v26.0";
const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "leads_retrieval",
];

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const appId = process.env.META_APP_ID;
  const centerSlug = firstQueryValue(req.query.center_slug);
  const pageId = firstQueryValue(req.query.page_id);

  if (!appId) {
    return sendHtml(
      res,
      "Configuration Meta manquante",
      "Ajoutez META_APP_ID dans les variables d'environnement Vercel avant de connecter une page.",
    );
  }

  if (!centerSlug || !pageId) {
    return sendHtml(
      res,
      "Centre ou page manquant",
      "Ouvrez cette URL depuis le bouton Facebook du centre Bookea, avec center_slug et page_id.",
    );
  }

  const redirectUri = `${getPublicBaseUrl(req)}/api/meta/callback`;
  const state = Buffer.from(JSON.stringify({ centerSlug, pageId })).toString("base64url");
  const scopes = process.env.META_OAUTH_SCOPES || DEFAULT_SCOPES.join(",");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);

  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scopes);

  return res.redirect(302, url.toString());
};

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getPublicBaseUrl(req) {
  return (
    process.env.NEXT_PUBLIC_BOOKEA_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_BOOKEA_ADMIN_URL ||
    `https://${req.headers.host}`
  ).replace(/\/+$/, "");
}

function sendHtml(res, title, message) {
  return res.status(400).send(`<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
  <body style="font-family: system-ui; padding: 32px;">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
