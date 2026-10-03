export const defaultServiceCategories = [
  "Bilan",
  "Soin visage",
  "Soins minceur",
  "Soin du visage",
  "Minceur",
  "Laser",
  "Silhouette",
  "Beauté des ongles",
  "Beauté du regard",
  "Bien-être",
  "Spa",
];

export const defaultProductCategories = [
  "Produits visage",
  "Produits corps",
  "Soin après séance",
  "Visage",
  "Compléments",
  "Hygiène",
];

function uniqueCategoryNames(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter(
      (value) => value.length > 0 && value.toLowerCase() !== "catégorie",
    )
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function mergeNamedCategories(
  stored?: string[] | null,
  items?: Array<{ category?: string }> | null,
  fallback: string[] = [],
) {
  if (Array.isArray(stored)) {
    return uniqueCategoryNames(stored);
  }

  return uniqueCategoryNames([
    ...fallback,
    ...(items ?? []).map((item) => item.category ?? ""),
  ]);
}

export function mergeServiceCategories(
  stored?: string[] | null,
  services?: Array<{ category?: string }> | null,
) {
  return mergeNamedCategories(stored, services, defaultServiceCategories);
}

export function mergeProductCategories(
  stored?: string[] | null,
  products?: Array<{ category?: string }> | null,
) {
  return mergeNamedCategories(stored, products, defaultProductCategories);
}
