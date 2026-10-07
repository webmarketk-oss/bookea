const {
  GRAPH_VERSION,
  OAUTH_SCOPES,
  extractPageRef,
  getMetaPublicBaseUrl,
} = require("./oauth-lib");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const appId = process.env.META_APP_ID;
  const centerSlug = firstQueryValue(req.query.center_slug);
  const pageRef = extractPageRef(firstQueryValue(req.query.page_id));

  if (!appId) {
    return sendHtml(
      res,
      "Configuration Meta manquante",
      "Ajoutez META_APP_ID dans les variables d'environnement Vercel avant de connecter une page.",
    );
  }

  if (!centerSlug) {
    return sendHtml(
      res,
      "Centre manquant",
      "Ouvrez cette URL depuis le bouton Connecter Facebook du centre Bookea.",
    );
  }

  const redirectUri = `${getMetaPublicBaseUrl()}/api/meta/callback`;
  const state = Buffer.from(
    JSON.stringify({ centerSlug, pageId: pageRef || "" }),
  ).toString("base64url");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);

  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  const configId = String(process.env.META_LOGIN_CONFIG_ID || "").trim();
  if (configId) {
    url.searchParams.set("config_id", configId);
  } else {
    url.searchParams.set(
      "scope",
      process.env.META_OAUTH_SCOPES || OAUTH_SCOPES.join(","),
    );
  }

  return res.redirect(302, url.toString());
};

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
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
