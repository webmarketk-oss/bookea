function favoriteId(center) {
  const id = String(center?.id || center?.centerId || "").trim();
  if (id) {
    return id.slice(0, 80);
  }
  const name = String(center?.name || "")
    .trim()
    .toLowerCase();
  return name ? `name:${name}`.slice(0, 80) : "";
}

function parseFavorites(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const next = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const id = String(item.id || "").trim().slice(0, 80);
    const name = String(item.name || "").trim().slice(0, 120);
    const city = String(item.city || "").trim().slice(0, 80);
    if (!id || !name || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push({ id, name, city });
    if (next.length >= 30) {
      break;
    }
  }
  return next;
}

function toggleFavorite(list, favorite) {
  const current = parseFavorites(list);
  const id = String(favorite?.id || "").trim().slice(0, 80);
  const name = String(favorite?.name || "").trim().slice(0, 120);
  if (!id || !name) {
    return current;
  }
  if (current.some((item) => item.id === id)) {
    return current.filter((item) => item.id !== id);
  }
  return [...current, { id, name, city: String(favorite.city || "").trim().slice(0, 80) }].slice(0, 30);
}

function isLiveOffer(offer, now = Date.now()) {
  if (!offer || offer.visible === false || !String(offer.title || "").trim()) {
    return false;
  }
  if (!offer.timerEnabled || !offer.endsAt) {
    return true;
  }
  const stamp = Date.parse(`${offer.endsAt}T${offer.endsAtTime || "23:59"}`);
  return !Number.isFinite(stamp) || stamp >= now;
}

function publicOffers(settings) {
  const root = settings && typeof settings === "object" ? settings : {};
  const pub = root.public && typeof root.public === "object" ? root.public : {};
  return Array.isArray(pub.offers) ? pub.offers : [];
}

function unreadOfferNotices(favorites, centers, seen, now = Date.now()) {
  const seenSet = new Set((Array.isArray(seen) ? seen : []).map((item) => String(item)));
  const byId = new Map((centers || []).map((row) => [String(row.id), row]));
  const notices = [];
  for (const favorite of parseFavorites(favorites)) {
    if (favorite.id.startsWith("name:")) {
      continue;
    }
    const row = byId.get(favorite.id);
    if (!row) {
      continue;
    }
    for (const offer of publicOffers(row.settings)) {
      if (!isLiveOffer(offer, now)) {
        continue;
      }
      const id = `${favorite.id}:${String(offer.id ?? offer.title)}`;
      if (seenSet.has(id)) {
        continue;
      }
      notices.push({
        id,
        centerId: favorite.id,
        centerName: String(row.name || favorite.name),
        title: String(offer.title).trim(),
        price: Number(offer.price) || 0,
      });
    }
  }
  return notices;
}

module.exports = {
  favoriteId,
  parseFavorites,
  toggleFavorite,
  unreadOfferNotices,
};
