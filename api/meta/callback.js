/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { findCenterBySlug } = require("./center-slug");
const {
  GRAPH_VERSION,
  exchangeLongLivedToken,
  fetchManagedPages,
  getMetaPublicBaseUrl,
  matchManagedPage,
} = require("./oauth-lib");

module.exports = async function handler(req, res) {
  if (req.method === "POST") {
    return attachSelectedPage(req, res);
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method not allowed");
  }

  try {
    const code = firstQueryValue(req.query.code);
    const state = parseState(firstQueryValue(req.query.state));

    if (!code || !state?.centerSlug) {
      return sendHtml(
        res,
        400,
        "Connexion Meta incomplete",
        "Le code Meta ou le centre est manquant. Recommence depuis Admin centres → Connecter Facebook.",
      );
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return sendHtml(
        res,
        400,
        "Configuration Meta manquante",
        "Ajoutez META_APP_ID et META_APP_SECRET dans Vercel, puis recommencez la connexion.",
      );
    }

    const redirectUri = `${getMetaPublicBaseUrl()}/api/meta/callback`;
    const shortToken = await exchangeCodeForToken({
      appId,
      appSecret,
      code,
      redirectUri,
    });
    const userToken = await exchangeLongLivedToken({
      appId,
      appSecret,
      userToken: shortToken,
    });
    const pages = await fetchManagedPages(userToken);

    if (!pages.length) {
      return sendHtml(
        res,
        404,
        "Aucune page Facebook",
        "Ce compte Meta n’administre aucune page. Connecte-toi avec le compte admin de la page du centre.",
      );
    }

    const wanted = state.pageId ? matchManagedPage(pages, state.pageId) : null;
    if (wanted) {
      return finishConnection(res, {
        centerSlug: state.centerSlug,
        page: wanted,
      });
    }

    if (!state.pageId && pages.length === 1) {
      return finishConnection(res, {
        centerSlug: state.centerSlug,
        page: pages[0],
      });
    }

    writeOauthCookie(res, { centerSlug: state.centerSlug, userToken });
    return sendPagePicker(res, {
      centerSlug: state.centerSlug,
      pages,
      missingPageId: state.pageId || "",
    });
  } catch (error) {
    console.error("[meta/callback]", error);
    return sendHtml(
      res,
      500,
      "Connexion Meta impossible",
      error instanceof Error ? error.message : "Une erreur est survenue pendant la connexion Meta.",
    );
  }
};

async function attachSelectedPage(req, res) {
  try {
    const form = await readForm(req);
    const session = readOauthCookie(req);
    const centerSlug = firstValue(form.center_slug, session?.centerSlug);
    const pageId = firstValue(form.page_id);
    const userToken = session?.userToken;

    if (!centerSlug || !pageId || !userToken) {
      return sendHtml(
        res,
        400,
        "Session Meta expiree",
        "Recommence depuis Admin centres → Connecter Facebook.",
      );
    }

    const pages = await fetchManagedPages(userToken);
    const page = matchManagedPage(pages, pageId);
    if (!page) {
      return sendHtml(
        res,
        404,
        "Page Facebook introuvable",
        "Cette page n’est plus dans le compte Meta connecté. Recommence la connexion.",
      );
    }

    clearOauthCookie(res);
    return finishConnection(res, { centerSlug, page });
  } catch (error) {
    console.error("[meta/callback] attach", error);
    return sendHtml(
      res,
      500,
      "Connexion Meta impossible",
      error instanceof Error ? error.message : "Une erreur est survenue pendant la connexion Meta.",
    );
  }
}

async function finishConnection(res, { centerSlug, page }) {
  const supabase = createServiceClient();
  const centerId = await resolveCenterId(supabase, centerSlug);

  await savePageConnection(supabase, {
    centerId,
    pageId: page.id,
    pageName: page.name || "Page Facebook",
    pageAccessToken: page.access_token,
  });

  let warning = "";
  try {
    await subscribePageToLeadgen(page.id, page.access_token);
  } catch (error) {
    warning =
      error instanceof Error
        ? ` La page est liée, mais le webhook leadgen n’a pas pu s’activer : ${error.message}`
        : " La page est liée, mais le webhook leadgen n’a pas pu s’activer.";
  }

  return sendHtml(
    res,
    200,
    "Page Facebook connectee",
    `${page.name || "La page"} est maintenant reliée au centre ${centerSlug}. Les leads de cette page arriveront dans le CRM Bookea.${warning}`,
  );
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function firstValue(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function parseState(value) {
  if (!value) return null;

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Configuration Supabase manquante.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function exchangeCodeForToken({ appId, appSecret, code, redirectUri }) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);

  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(data?.error?.message || "Meta n'a pas renvoye de token utilisateur.");
  }

  return data.access_token;
}

async function resolveCenterId(supabase, centerSlug) {
  const center = await findCenterBySlug(supabase, centerSlug, "id");
  if (!center?.id) {
    throw new Error(`Centre introuvable pour le slug ${centerSlug}.`);
  }
  return center.id;
}

async function savePageConnection(supabase, page) {
  const { error: connectionError } = await supabase
    .from("facebook_page_connections")
    .upsert(
      {
        center_id: page.centerId,
        page_id: page.pageId,
        page_name: page.pageName,
        page_access_token: page.pageAccessToken,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "page_id" },
    );

  if (connectionError) {
    throw new Error(connectionError.message);
  }

  const { error: mappingError } = await supabase
    .from("facebook_lead_forms")
    .upsert(
      {
        center_id: page.centerId,
        page_id: page.pageId,
        form_id: `PAGE:${page.pageId}`,
        form_name: page.pageName,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "form_id" },
    );

  if (mappingError) {
    throw new Error(mappingError.message);
  }
}

async function subscribePageToLeadgen(pageId, pageAccessToken) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/subscribed_apps`);

  url.searchParams.set("subscribed_fields", "leadgen");
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Impossible d'abonner la page au champ leadgen.");
  }
}

async function readForm(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return Object.fromEntries(new URLSearchParams(req.body).entries());
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Object.fromEntries(
    new URLSearchParams(Buffer.concat(chunks).toString("utf8")).entries(),
  );
}

function writeOauthCookie(res, payload) {
  res.setHeader(
    "Set-Cookie",
    `bookea_meta_oauth=${encodeURIComponent(JSON.stringify(payload))}; HttpOnly; Secure; SameSite=Lax; Max-Age=900; Path=/api/meta/callback`,
  );
}

function clearOauthCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "bookea_meta_oauth=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/api/meta/callback",
  );
}

function readOauthCookie(req) {
  const header = String(req.headers?.cookie || "");
  const match = header.match(/(?:^|;\s*)bookea_meta_oauth=([^;]+)/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function sendPagePicker(res, { centerSlug, pages, missingPageId }) {
  const options = pages
    .map(
      (page) => `
        <button type="submit" name="page_id" value="${escapeHtml(page.id)}"
          style="display:block;width:100%;text-align:left;margin:0 0 10px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:16px;background:white;font:inherit;cursor:pointer;">
          <strong>${escapeHtml(page.name || page.id)}</strong>
          <span style="display:block;color:#64748b;font-size:13px;margin-top:4px;">${escapeHtml(page.username || page.id)}</span>
        </button>`,
    )
    .join("");

  const intro = missingPageId
    ? `La référence « ${escapeHtml(missingPageId)} » n’est pas dans ce compte Meta. Choisis la bonne page pour ${escapeHtml(centerSlug)}.`
    : `Choisis la page Facebook à relier au centre ${escapeHtml(centerSlug)}.`;

  res.status(200).send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Choisir la page Facebook</title>
  </head>
  <body style="font-family: system-ui; background: #f4f7fb; color: #0f172a; padding: 32px;">
    <main style="max-width: 720px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 28px;">
      <h1 style="margin: 0 0 12px; font-size: 32px;">Choisir la page Facebook</h1>
      <p style="font-size: 18px; line-height: 1.5;">${intro}</p>
      <form method="POST" action="/api/meta/callback" style="margin-top: 20px;">
        <input type="hidden" name="center_slug" value="${escapeHtml(centerSlug)}">
        ${options}
      </form>
    </main>
  </body>
</html>`);
}

function sendHtml(res, status, title, message) {
  return res.status(status).send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: system-ui; background: #f4f7fb; color: #0f172a; padding: 32px;">
    <main style="max-width: 720px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 28px;">
      <h1 style="margin: 0 0 12px; font-size: 32px;">${escapeHtml(title)}</h1>
      <p style="font-size: 18px; line-height: 1.5;">${escapeHtml(message)}</p>
      <a href="/dashboard/admin-centres" style="display: inline-block; margin-top: 18px; color: white; background: #2563eb; padding: 12px 18px; border-radius: 14px; text-decoration: none; font-weight: 800;">Retour admin centres</a>
    </main>
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
