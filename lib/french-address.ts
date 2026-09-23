export type FrenchPlace = {
  city: string;
  id: string;
  kind: "address" | "city";
  label: string;
  postcode: string;
  street: string;
};

export async function searchFrenchPlaces(
  query: string,
  kind: "address" | "city" = "address",
): Promise<FrenchPlace[]> {
  const q = query.trim();

  if (q.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q,
    limit: "7",
    autocomplete: "1",
  });

  if (kind === "city") {
    params.set("type", "municipality");
  }

  const response = await fetch(
    `https://api-adresse.data.gouv.fr/search/?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("address_search_failed");
  }

  const payload = (await response.json()) as {
    features?: Array<{
      properties?: {
        city?: string;
        housenumber?: string;
        id?: string;
        label?: string;
        name?: string;
        postcode?: string;
        street?: string;
        type?: string;
      };
    }>;
  };

  const places = (payload.features ?? [])
    .map((feature) => toFrenchPlace(feature.properties))
    .filter((place): place is FrenchPlace => Boolean(place));

  return places.filter(
    (place, index, list) =>
      list.findIndex((item) => item.id === place.id || item.label === place.label) ===
      index,
  );
}

function toFrenchPlace(
  properties?: {
    city?: string;
    housenumber?: string;
    id?: string;
    label?: string;
    name?: string;
    postcode?: string;
    street?: string;
    type?: string;
  },
): FrenchPlace | null {
  if (!properties) {
    return null;
  }

  const city = String(properties.city || "").trim();
  const postcode = String(properties.postcode || "").trim();
  const street = [
    properties.housenumber,
    properties.street || properties.name,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  const label = String(properties.label || street || city).trim();

  if (!city && !street) {
    return null;
  }

  return {
    id: String(properties.id || label),
    kind: properties.type === "municipality" ? "city" : "address",
    label,
    street: street || label,
    postcode,
    city,
  };
}
