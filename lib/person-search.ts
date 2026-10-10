function normalizeSearch(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchTokens(value: string) {
  return normalizeSearch(value).split(/\s+/).filter(Boolean);
}

export function matchesPersonSearch(
  query: string,
  firstName?: string | null,
  lastName?: string | null,
) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) {
    return true;
  }

  const first = normalizeSearch(firstName || "");
  const last = normalizeSearch(lastName || "");
  const forward = [first, last].filter(Boolean).join(" ");
  const reverse = [last, first].filter(Boolean).join(" ");

  if (forward.includes(normalizedQuery) || reverse.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = searchTokens(query);
  const nameTokens = searchTokens(`${firstName || ""} ${lastName || ""}`);

  return (
    queryTokens.length > 0 &&
    nameTokens.length > 0 &&
    queryTokens.every((token) =>
      nameTokens.some((name) => name.includes(token)),
    )
  );
}
