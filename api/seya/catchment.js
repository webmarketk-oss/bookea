/**
 * Rayon de chalandise (~35 km) autour du centre du fil — tous centres.
 * On compare la géographie (coords), pas seulement le nom de ville.
 */

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

const CATCHMENT_RADIUS_KM = 35;

/** Coords approx. (lat, lon) — communes fréquentes autour des centres Bookea. */
const PLACE_COORDS = {
  // Clermont & agglo
  "clermont ferrand": [45.7772, 3.087],
  clermont: [45.7772, 3.087],
  cournon: [45.742, 3.196],
  "cournon d auvergne": [45.742, 3.196],
  chamalieres: [45.774, 3.06],
  aubiere: [45.751, 3.111],
  gerzat: [45.826, 3.145],
  riom: [45.894, 3.113],
  beaumont: [45.752, 3.083],
  cebazat: [45.832, 3.1],
  issoire: [45.544, 3.249],
  // Gaillard / Genevois
  gaillard: [46.185, 6.208],
  annemasse: [46.193, 6.236],
  "ville la grand": [46.203, 6.248],
  etrembieres: [46.178, 6.226],
  ambilly: [46.193, 6.222],
  thonex: [46.2, 6.216],
  geneve: [46.204, 6.143],
  // Vichy / Allier
  vichy: [46.128, 3.426],
  cusset: [46.135, 3.457],
  bellerive: [46.117, 3.404],
  "bellerive sur allier": [46.117, 3.404],
  // Lyon / Annecy / autres
  lyon: [45.764, 4.836],
  villeurbanne: [45.767, 4.88],
  venissieux: [45.698, 4.887],
  annecy: [45.899, 6.129],
  seynod: [45.889, 6.098],
  "cran gevrier": [45.908, 6.11],
  nice: [43.71, 7.262],
  cannes: [43.553, 7.017],
  marseille: [43.296, 5.37],
  "aix en provence": [43.529, 5.447],
  toulouse: [43.604, 1.444],
  bordeaux: [44.838, -0.579],
  nantes: [47.218, -1.554],
  rennes: [48.117, -1.678],
  lille: [50.629, 3.057],
  strasbourg: [48.573, 7.752],
  montpellier: [43.611, 3.877],
  grenoble: [45.188, 5.724],
  "saint etienne": [45.439, 4.387],
  "le puy": [45.043, 3.885],
  "le puy en velay": [45.043, 3.885],
  thiers: [45.857, 3.547],
  ambert: [45.55, 3.742],
};

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLon * sinLon;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function coordsForPlace(name) {
  const key = normalize(name);
  if (!key) {
    return null;
  }
  if (PLACE_COORDS[key]) {
    return PLACE_COORDS[key];
  }
  // Préfixe / inclusion souple (« Clermont-Ferrand centre », « Cournon d Auvergne »).
  for (const [place, coords] of Object.entries(PLACE_COORDS)) {
    if (key === place || key.startsWith(`${place} `) || place.startsWith(`${key} `)) {
      return coords;
    }
  }
  return null;
}

function displayCityLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return raw
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-")
    .replace(/D'Auvergne/i, "d’Auvergne");
}

function samePlace(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) {
    return false;
  }
  return (
    left === right ||
    left.startsWith(right) ||
    right.startsWith(left) ||
    left.includes(right) ||
    right.includes(left)
  );
}

/**
 * Extrait une zone citée : secteur X, j’habite X, centre sur X, dispo sur X…
 * @returns {{ label: string, kind: 'secteur'|'habite'|'site'|'sur' } | null}
 */
function extractAreaMention(text, centerCity = "") {
  const raw = String(text || "").trim();
  const value = normalize(raw);
  if (!value) {
    return null;
  }
  const center = normalize(centerCity);
  const end = String.raw`(?:\s|$|[?!.,;:])`;
  const patterns = [
    ["site", new RegExp(`(?:centre|institut|clinique|salon) (?:sur|a|de|dans) ([a-z][a-z' -]{1,40}?)${end}`)],
    ["secteur", new RegExp(`secteur ([a-z][a-z' -]{1,40}?)${end}`)],
    [
      "habite",
      new RegExp(
        `(?:j[' ]habite|je (?:suis|vis|reside)|on est|nous sommes) (?:a|sur|vers|pres de|du cote de) ([a-z][a-z' -]{1,40}?)${end}`,
      ),
    ],
    [
      "sur",
      new RegExp(
        `(?:dispo|disponible|venir|rdv|rendez-vous|bilan|seance).{0,30}\\b(?:sur|a|vers) ([a-z][a-z' -]{1,40}?)${end}`,
      ),
    ],
  ];
  for (const [kind, pattern] of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const city = match[1]
      .replace(
        /\s+(c'est|est|pour|si|et|ou|mais|possible|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b.*$/,
        "",
      )
      .replace(/[,;:]+$/g, "")
      .trim();
    if (!city || city.length < 2 || samePlace(city, center)) {
      continue;
    }
    // Évite de prendre un mot agenda pour une ville.
    if (
      /^(demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|matin|soir|dispo|creneau|heure|place)$/.test(
        city,
      )
    ) {
      continue;
    }
    return { label: displayCityLabel(city), kind };
  }
  return null;
}

function distanceBetweenPlacesKm(centerPlace, otherPlace) {
  const a = coordsForPlace(centerPlace);
  const b = coordsForPlace(otherPlace);
  if (!a || !b) {
    return null;
  }
  return Math.round(haversineKm(a, b));
}

/**
 * @returns {{ label: string, km: number|null, within: boolean } | null}
 */
function resolveCatchment(centerCity, centerAddress, mentionedLabel) {
  const label = String(mentionedLabel || "").trim();
  if (!label || samePlace(label, centerCity)) {
    return null;
  }
  const centerKey = cityFromAddress(centerAddress) || centerCity;
  const km = distanceBetweenPlacesKm(centerKey, label);
  if (km == null) {
    // Coords inconnues : on accueille (bénéfice du doute), sans inventer un km.
    return { label, km: null, within: true };
  }
  return { label, km, within: km <= CATCHMENT_RADIUS_KM };
}

function cityFromAddress(address) {
  const value = String(address || "").trim();
  const afterPostal = value.match(/\b\d{5}\s*,?\s*([^,\d][^,]*)$/);
  if (afterPostal) {
    return afterPostal[1].trim();
  }
  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return parts.length > 1 && !/\d/.test(last) ? last : "";
}

/** Demande explicite de faire le RDV dans un autre établissement. */
function asksOtherSite(text, centerCity = "") {
  const area = extractAreaMention(text, centerCity);
  if (!area) {
    return false;
  }
  const value = normalize(text);
  return (
    area.kind === "site" ||
    /faire (la |le |l')?(seance|bilan|rdv|rendez-vous|decouverte).{0,40}(la bas|chez vous sur|sur |a )|possible (de |d')?(faire|venir|prendre).{0,50}(la bas|sur |a )|rendez-vous (sur|a) |bilan (sur|a) |seance (sur|a) /.test(
      value,
    )
  );
}

/** Zone dans le rayon (ou inconnue mais présentée comme secteur/dispo) → accueillir ici. */
function asksNearbyCatchment(text, centerCity = "", centerAddress = "") {
  if (asksOtherSite(text, centerCity)) {
    return null;
  }
  const area = extractAreaMention(text, centerCity);
  if (!area) {
    return null;
  }
  const resolved = resolveCatchment(centerCity, centerAddress, area.label);
  if (!resolved?.within) {
    return null;
  }
  return { label: resolved.label, km: resolved.km, needle: normalize(resolved.label) };
}

function otherSiteCityMention(text, centerCity = "") {
  return extractAreaMention(text, centerCity)?.label || "";
}

function nearbyCatchmentReply(centerCity, town, centerAddress = "") {
  const city = String(centerCity || "notre centre").trim() || "notre centre";
  const address = String(centerAddress || "").trim();
  const area = town?.label || "votre secteur";
  const place = address ? `${city}, au ${address.replace(/^au\s+/i, "")}` : city;
  const kmBit =
    typeof town?.km === "number" ? ` (environ ${town.km} km)` : "";
  return `${area} est à proximité${kmBit} : notre centre est à ${place}. Je peux vous trouver un créneau ici — quel jour vous arrange ?`;
}

function otherSiteReply(centerCity, otherCity, centerAddress = "") {
  const city = String(centerCity || "notre centre").trim() || "notre centre";
  const address = String(centerAddress || "").trim();
  const place = address
    ? `le centre de ${city}, au ${address.replace(/^au\s+/i, "")}`
    : `le centre de ${city}`;
  const other = String(otherCity || "cet autre endroit").trim();
  const resolved = resolveCatchment(city, centerAddress, other);
  const nearBit =
    resolved?.within
      ? ` ${other} est tout près${typeof resolved.km === "number" ? ` (environ ${resolved.km} km)` : ""} : vous pouvez venir à ${city} sans problème.`
      : "";
  return `Ce fil concerne ${place}. L’établissement de ${other} est un autre centre, avec des offres différentes.${nearBit} Souhaitez-vous un créneau à ${city} ?`;
}

function farAreaReply(centerCity, areaLabel, centerAddress = "") {
  const city = String(centerCity || "notre centre").trim() || "notre centre";
  const address = String(centerAddress || "").trim();
  const place = address ? `${city}, au ${address.replace(/^au\s+/i, "")}` : city;
  const area = String(areaLabel || "votre secteur").trim();
  return `Notre centre est à ${place}. ${area} est un peu plus loin pour nous. Si vous pouvez vous déplacer jusqu’à ${city}, dites-moi un jour qui vous arrange 😊`;
}

module.exports = {
  CATCHMENT_RADIUS_KM,
  PLACE_COORDS,
  asksNearbyCatchment,
  asksOtherSite,
  cityFromAddress,
  coordsForPlace,
  distanceBetweenPlacesKm,
  extractAreaMention,
  farAreaReply,
  haversineKm,
  nearbyCatchmentReply,
  otherSiteCityMention,
  otherSiteReply,
  resolveCatchment,
  samePlace,
};
