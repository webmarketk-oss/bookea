/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

const GRAPH_VERSION = "v26.0";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  try {
    const code = firstQueryValue(req.query.code);
    const state = parseState(firstQueryValue(req.query.state));

    if (!code || !state?.centerSlug || !state?.pageId) {
      return sendHtml(res, 400, "Connexion Meta incomplete", "Le code Meta, le centre ou la page est manquant.");
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

    const redirectUri = `${getPublicBaseUrl(req)}/api/meta/callback`;
    const userToken = await exchangeCodeForToken({ appId, appSecret, code, redirectUri });
    const pages = await fetchManagedPages(userToken);
    const page = pages.find((item) => item.id === state.pageId);

    if (!page?.access_token) {
      return sendHtml(
        res,
        404,
        "Page Facebook introuvable",
        `Le compte Meta connecte ne donne pas acces a la page ${state.pageId}. Verifiez que vous etes admin de cette page, puis recommencez.`,
      );
    }

    const supabase = createServiceClient();
    const centerId = await resolveCenterId(supabase, state.centerSlug);

    await savePageConnection(supabase, {
      centerId,
      pageId: page.id,
      pageName: page.name || "Page Facebook",
      pageAccessToken: page.access_token,
    });

    await subscribePageToLeadgen(page.id, page.access_token);

    return sendHtml(
      res,
      200,
      "Page Facebook connectee",
      `${page.name || "La page"} est maintenant reliee au centre ${state.centerSlug}. Les leads de cette page pourront arriver dans le CRM Bookea de ce centre.`,
    );
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

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseState(value) {
  if (!value) return null;

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getPublicBaseUrl(req) {
  return (
    process.env.NEXT_PUBLIC_BOOKEA_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_BOOKEA_ADMIN_URL ||
    `https://${req.headers.host}`
  ).replace(/\/+$/, "");
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

async function fetchManagedPages(userToken) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);

  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", userToken);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Impossible de lire les pages Facebook.");
  }

  return Array.isArray(data.data) ? data.data : [];
}

async function resolveCenterId(supabase, centerSlug) {
  const { data, error } = await supabase
    .from("centers")
    .select("id")
    .eq("slug", centerSlug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error(`Centre introuvable pour le slug ${centerSlug}.`);
  }

  return data.id;
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
