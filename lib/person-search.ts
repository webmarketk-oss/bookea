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

function phoneDigitKeys(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 2) {
    return [];
  }
  const keys = new Set([digits]);
  if (digits.startsWith("0033") && digits.length > 4) {
    keys.add(digits.slice(2));
    keys.add(`0${digits.slice(4)}`);
  } else if (digits.startsWith("33") && digits.length > 2) {
    keys.add(`0${digits.slice(2)}`);
  } else if (digits.startsWith("0") && digits.length > 1) {
    keys.add(`33${digits.slice(1)}`);
  }
  return [...keys];
}

/** 06, +336 et 00336 désignent le même numéro, y compris en recherche partielle. */
export function matchesPhoneSearch(query: string, phone?: string | null) {
  const rawQuery = String(query || "").trim().toLowerCase();
  const rawPhone = String(phone || "").trim().toLowerCase();
  if (!rawQuery || !rawPhone) {
    return false;
  }
  if (rawPhone.includes(rawQuery)) {
    return true;
  }
  const queryKeys = phoneDigitKeys(rawQuery);
  if (queryKeys.length === 0) {
    return false;
  }
  const phoneKeys = phoneDigitKeys(rawPhone);
  return queryKeys.some((needle) =>
    phoneKeys.some((candidate) => candidate.includes(needle)),
  );
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
