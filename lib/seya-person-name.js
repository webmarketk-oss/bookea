function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCenterResidueName(value) {
  const needle = normalizeName(value);
  if (!needle) {
    return true;
  }
  return /jfg|clermont|ferrand|clinique|bookea|webk|web\.k|facebook|meta|prospect|lead ads|centre|^nom$|^tel$|^mail$|^offre$/.test(
    needle,
  );
}

function looksLikeFullPersonName(value) {
  const parts = String(value || "")
    .trim()
    .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  return parts.length >= 2 && !isCenterResidueName(value);
}

function splitPersonName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function sanitizePersonName(firstName, lastName) {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  return {
    firstName: isCenterResidueName(first) ? "" : first,
    lastName: isCenterResidueName(last) ? "" : last,
  };
}

function displayPersonName(firstName, lastName) {
  const cleaned = sanitizePersonName(firstName, lastName);
  return [cleaned.firstName, cleaned.lastName].filter(Boolean).join(" ");
}

function resolvePersonName(fields, pickExact) {
  const first = pickExact(fields, ["first_name", "prenom", "firstname"]);
  const last = pickExact(fields, ["last_name", "lastname"]);
  const nom = pickExact(fields, ["nom"]);
  const full = pickExact(fields, [
    "full_name",
    "fullname",
    "nom_complet",
    "prenom_nom",
  ]);

  const cleanedFirst = isCenterResidueName(first) ? "" : first;
  const cleanedLast = isCenterResidueName(last) ? "" : last;
  const cleanedNom = isCenterResidueName(nom) ? "" : nom;
  const cleanedFull = isCenterResidueName(full) ? "" : full;

  if (cleanedFirst && cleanedLast) {
    return { firstName: cleanedFirst, lastName: cleanedLast };
  }
  if (cleanedFirst && cleanedNom && !looksLikeFullPersonName(cleanedNom)) {
    return { firstName: cleanedFirst, lastName: cleanedNom };
  }
  if (looksLikeFullPersonName(cleanedNom)) {
    return splitPersonName(cleanedNom);
  }
  if (cleanedFull) {
    const parts = splitPersonName(cleanedFull);
    return {
      firstName: cleanedFirst || parts.firstName,
      lastName: isCenterResidueName(parts.lastName) ? "" : parts.lastName,
    };
  }
  return {
    firstName: cleanedFirst || cleanedNom || "",
    lastName: cleanedLast,
  };
}

module.exports = {
  displayPersonName,
  isCenterResidueName,
  resolvePersonName,
  sanitizePersonName,
  splitPersonName,
};
