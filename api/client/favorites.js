const { createServiceClient } = require("../appointments/service");
const { requireUser } = require("./account");
const {
  parseFavorites,
  toggleFavorite,
  unreadOfferNotices,
} = require("./favorites-lib");

function seenOffers(user) {
  const value = user?.user_metadata?.bookea_seen_offers;
  return Array.isArray(value) ? value.map((item) => String(item)).slice(0, 200) : [];
}

async function centersFor(supabase, favorites) {
  const ids = favorites
    .map((item) => item.id)
    .filter((id) => !id.startsWith("name:"));
  if (ids.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,settings")
    .in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
  return data || [];
}

async function snapshot(supabase, user) {
  const favorites = parseFavorites(user?.user_metadata?.bookea_favorites);
  const centers = await centersFor(supabase, favorites);
  return {
    favorites,
    notices: unreadOfferNotices(favorites, centers, seenOffers(user)),
  };
}

async function writeMeta(supabase, user, favorites, seen) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      bookea_favorites: favorites,
      bookea_seen_offers: seen.slice(-200),
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  return data.user || user;
}

module.exports = async function handler(req, res) {
  try {
    const supabase = createServiceClient();
    const user = await requireUser(supabase, req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (req.method === "GET") {
      return res.status(200).json(await snapshot(supabase, user));
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "");
    let favorites = parseFavorites(user.user_metadata?.bookea_favorites);
    let seen = seenOffers(user);

    if (action === "add" || action === "remove") {
      const favorite = body.favorite && typeof body.favorite === "object" ? body.favorite : {};
      const id = String(favorite.id || "").trim().slice(0, 80);
      const name = String(favorite.name || "").trim().slice(0, 120);
      if (!id || (action === "add" && !name)) {
        return res.status(400).json({ error: "favorite_required" });
      }
      favorites =
        action === "remove"
          ? favorites.filter((item) => item.id !== id)
          : favorites.some((item) => item.id === id)
            ? favorites
            : toggleFavorite(favorites, {
                id,
                name,
                city: favorite.city,
              });
    } else if (action === "read") {
      const current = await snapshot(supabase, user);
      seen = [...seen, ...current.notices.map((item) => item.id)];
    } else {
      return res.status(400).json({ error: "unknown_action" });
    }

    const nextUser = await writeMeta(supabase, user, favorites, seen);
    return res.status(200).json(await snapshot(supabase, nextUser));
  } catch (error) {
    console.error("[client/favorites]", error);
    return res.status(500).json({ error: "favorites_failed" });
  }
};
