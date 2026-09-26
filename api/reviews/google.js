module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const url = String(payload.url || "").trim();
  const source = String(payload.source || "Google").trim() || "Google";

  if (!url) {
    return res.status(400).json({
      ok: false,
      error: "missing_url",
      message: "Colle le lien de la fiche Google du centre.",
    });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      error: "no_google_key",
      message:
        "Google bloque l’import depuis un lien share.google. Ajoute les avis à la main, ou un CSV Nom;5;Commentaire. Pour un import auto, il faut une clé Places dans Vercel (GOOGLE_PLACES_API_KEY).",
    });
  }

  try {
    const placeId = await resolvePlaceId(url, apiKey);
    if (!placeId) {
      return res.status(200).json({
        ok: false,
        error: "place_not_found",
        message:
          "Impossible de lire cette fiche. Ouvre Google Maps, clique Partager → copier le lien de la fiche (maps.app.goo.gl ou maps/place/…), pas seulement share.google.",
      });
    }

    const reviews = await fetchPlaceReviews(placeId, apiKey, source);
    if (reviews.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "no_reviews",
        message: "Google n’a renvoyé aucun avis public pour cette fiche (souvent seulement les 5 derniers).",
      });
    }

    return res.status(200).json({ ok: true, reviews });
  } catch (error) {
    console.error("[reviews/google]", error);
    return res.status(200).json({
      ok: false,
      error: "import_failed",
      message: "L’import Google a échoué. Réessaie avec le lien Maps de la fiche, ou ajoute les avis à la main.",
    });
  }
};

async function resolvePlaceId(url, apiKey) {
  const direct = extractPlaceId(url);
  if (direct) {
    return direct;
  }

  const resolved = await resolveRedirect(url);
  const fromResolved = extractPlaceId(resolved);
  if (fromResolved) {
    return fromResolved;
  }

  const query = extractPlaceQuery(resolved || url);
  if (!query) {
    return "";
  }

  const findUrl = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  findUrl.searchParams.set("input", query);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id,name");
  findUrl.searchParams.set("key", apiKey);
  const found = await fetch(findUrl).then((response) => response.json());
  return found?.candidates?.[0]?.place_id || "";
}

async function fetchPlaceReviews(placeId, apiKey, source) {
  const details = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  details.searchParams.set("place_id", placeId);
  details.searchParams.set("fields", "reviews,name");
  details.searchParams.set("language", "fr");
  details.searchParams.set("reviews_sort", "newest");
  details.searchParams.set("key", apiKey);
  const data = await fetch(details).then((response) => response.json());
  const list = Array.isArray(data?.result?.reviews) ? data.result.reviews : [];

  return list.map((review, index) => ({
    id: Date.now() + index,
    author: String(review.author_name || "Cliente").trim(),
    rating: Math.min(5, Math.max(1, Number(review.rating) || 5)),
    source,
    date: review.time
      ? new Date(Number(review.time) * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    comment: String(review.text || "Avis Google.").trim(),
    imported: true,
  }));
}

function extractPlaceId(value) {
  const text = String(value || "");
  const chij = text.match(/ChIJ[A-Za-z0-9_-]+/);
  if (chij) {
    return chij[0];
  }
  const queryId = text.match(/[?&](?:place_id|placeid)=([^&]+)/i);
  return queryId ? decodeURIComponent(queryId[1]) : "";
}

function extractPlaceQuery(value) {
  const text = String(value || "");
  const place = text.match(/\/maps\/place\/([^/@]+)/i);
  if (place) {
    return decodeURIComponent(place[1].replace(/\+/g, " "));
  }
  if (/share\.google|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) {
    return "";
  }
  return text.replace(/^https?:\/\//, "").slice(0, 120);
}

async function resolveRedirect(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 BookeaReviews" },
    });
    return response.url || url;
  } catch {
    return url;
  }
}
