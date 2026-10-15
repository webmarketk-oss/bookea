/**
 * Remise en forme des champs tarifaires laser de Gaillard uniquement.
 * Ne touche jamais aux autres centres ni aux autres prestations.
 */

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isGaillardCenter(centerName, centerSlug) {
  return /\bgaillard\b/.test(normalize(`${centerName || ""} ${centerSlug || ""}`));
}

function isEpilationBrief(brief) {
  const name = normalize(brief?.name || brief?.title || "");
  return /epilation|laser|definitive|depil/.test(name);
}

function looksLikeLegacyFromPrice(value) {
  return /a partir de\s*300|à partir de\s*300|300\s*€/.test(String(value || ""));
}

function repairOpeningPlaceholders(opening) {
  return String(opening || "")
    .replace(/notre offre\s+\{centre\}/gi, "notre offre {offre}")
    .replace(/votre demande pour\s+\{centre\}/gi, "votre demande pour {offre}")
    .replace(/pour (?:notre |l['’])?offre\s+\{centre\}/gi, "pour notre offre {offre}");
}

function extractPackageFromSources(brief) {
  const blob = [brief?.brief, brief?.price, brief?.pricing?.package]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!blob) {
    return "";
  }
  // Garder une grille déjà écrite (montants / zones), sans inventer de chiffres.
  if (/séance|seance|aisselle|maillot|jambe|forfait|remise|grille|zone/i.test(blob)) {
    return blob
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !looksLikeLegacyFromPrice(line))
      .join("\n")
      .trim();
  }
  return "";
}

function defaultGaillardLaserPackage(existingPackage, brief) {
  const fromSources = extractPackageFromSources({
    ...brief,
    pricing: { ...(brief?.pricing || {}), package: existingPackage },
  });
  if (fromSources && !looksLikeLegacyFromPrice(fromSources)) {
    return fromSources;
  }
  // Description structurelle sans montants inventés : la grille chiffrée reste celle du centre.
  return [
    "Programme de 8 séances (6 séances + 2 séances d’entretien), selon la grille par zone du centre.",
    "Les tarifs sont communiqués au forfait, pas à la séance.",
    "Remises multizones et aisselles offertes selon les conditions renseignées dans la fiche du centre.",
  ].join(" ");
}

function needsGaillardLaserRepair(brief) {
  if (!isEpilationBrief(brief)) {
    return false;
  }
  const pricing = brief?.pricing && typeof brief.pricing === "object" ? brief.pricing : {};
  const opening = String(brief?.opening || "");
  return (
    looksLikeLegacyFromPrice(pricing.package) ||
    looksLikeLegacyFromPrice(brief?.price) ||
    !String(pricing.bilan || "").trim() ||
    !String(pricing.discovery || "").trim() ||
    /offre\s+\{centre\}/i.test(opening) ||
    /demande pour\s+\{centre\}/i.test(opening)
  );
}

function repairGaillardLaserBrief(brief) {
  if (!isEpilationBrief(brief)) {
    return { brief, changed: false };
  }
  if (!needsGaillardLaserRepair(brief)) {
    return { brief, changed: false };
  }

  const previous = brief?.pricing && typeof brief.pricing === "object" ? brief.pricing : {};
  const packageText = defaultGaillardLaserPackage(previous.package, brief);
  const next = {
    ...brief,
    opening: repairOpeningPlaceholders(brief.opening),
    pricing: {
      ...previous,
      bilan: String(previous.bilan || "").trim() || "offert et sans engagement",
      discovery:
        String(previous.discovery || "").trim() ||
        "test laser offert et sans engagement",
      session: "",
      package: packageText,
      sessionPolicy: previous.sessionPolicy || "after_bilan",
    },
  };

  // Ne pas laisser l’ancien « à partir de 300 € » dans le champ libre legacy.
  if (looksLikeLegacyFromPrice(next.price)) {
    next.price = "";
  }

  return { brief: next, changed: true };
}

function repairGaillardLaserSettings(settings, centerName, centerSlug) {
  if (!isGaillardCenter(centerName, centerSlug)) {
    return { settings, changed: false };
  }
  const briefs = Array.isArray(settings?.treatmentBriefs)
    ? settings.treatmentBriefs
    : [];
  let changed = false;
  const treatmentBriefs = briefs.map((item) => {
    const repaired = repairGaillardLaserBrief(item);
    if (repaired.changed) {
      changed = true;
    }
    return repaired.brief;
  });
  if (!changed) {
    return { settings, changed: false };
  }
  return {
    settings: { ...settings, treatmentBriefs },
    changed: true,
  };
}

module.exports = {
  defaultGaillardLaserPackage,
  extractPackageFromSources,
  isEpilationBrief,
  isGaillardCenter,
  looksLikeLegacyFromPrice,
  needsGaillardLaserRepair,
  repairGaillardLaserBrief,
  repairGaillardLaserSettings,
  repairOpeningPlaceholders,
};
