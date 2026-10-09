const { inferCareFamily } = require("./care-family");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function catalogServices(seya) {
  if (Array.isArray(seya?.catalogServices) && seya.catalogServices.length) {
    return seya.catalogServices;
  }
  const publicSettings =
    seya?.public && typeof seya.public === "object" ? seya.public : {};
  return Array.isArray(publicSettings.services) ? publicSettings.services : [];
}

function pickCatalogService(seya, family) {
  if (!family) {
    return null;
  }
  return (
    catalogServices(seya).find(
      (item) =>
        inferCareFamily(`${item?.name || ""} ${item?.category || ""}`) === family,
    ) || null
  );
}

function matchByFamily(items, family, textOf) {
  if (!family || !Array.isArray(items) || !items.length) {
    return null;
  }
  return (
    items.find((item) => inferCareFamily(textOf(item) || "") === family) || null
  );
}

function namesList(value) {
  return String(value || "")
    .split(/[,/;]+/)
    .map((item) => normalize(item))
    .filter((item) => item.length > 1);
}

function pickByListedName(items, listed, textOf) {
  const needles = namesList(listed);
  if (!needles.length || !Array.isArray(items)) {
    return null;
  }
  return (
    items.find((item) => {
      const current = normalize(textOf(item));
      return needles.some(
        (needle) => current === needle || current.includes(needle) || needle.includes(current),
      );
    }) || null
  );
}

function pickBookingResources({
  rooms,
  practitioners,
  services,
  seya,
  family,
} = {}) {
  const catalog = pickCatalogService(seya, family);
  const practitionerName = (item) =>
    `${item?.first_name || ""} ${item?.last_name || item?.name || ""}`.trim();
  const service =
    matchByFamily(services, family, (item) => item?.name) ||
    pickByListedName(services, catalog?.name, (item) => item?.name) ||
    null;
  const room =
    pickByListedName(rooms, catalog?.cabins, (item) => item?.name) ||
    matchByFamily(rooms, family, (item) => item?.name) ||
    rooms?.[0] ||
    null;
  const practitioner =
    pickByListedName(practitioners, catalog?.practitioners, practitionerName) ||
    matchByFamily(practitioners, family, practitionerName) ||
    practitioners?.[0] ||
    null;
  const catalogDuration = Number(catalog?.duration);
  return {
    catalog,
    service,
    room,
    practitioner,
    durationMinutes:
      Number.isFinite(catalogDuration) && catalogDuration > 0
        ? catalogDuration
        : 0,
    cabinId: room?.id || "",
  };
}

module.exports = {
  catalogServices,
  pickBookingResources,
  pickCatalogService,
};
