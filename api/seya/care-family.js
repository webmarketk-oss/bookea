function normalizeCare(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferCareFamily(text) {
  const needle = normalizeCare(text);
  if (!needle) {
    return "";
  }
  if (/epilation|laser|definitive/.test(needle)) {
    return "epilation";
  }
  if (/visage|hydrafacial|peau|acne|glow/.test(needle)) {
    return "visage";
  }
  if (/minceur|mincir|maigrir|cryo|ventre|poids|graisse|cellulite/.test(needle)) {
    return "minceur";
  }
  if (/bilan|decouverte/.test(needle)) {
    return "minceur";
  }
  return "";
}

function activeCareFamily(conversation, extraText) {
  const need = inferCareFamily(conversation?.qualification?.need);
  if (need) {
    return need;
  }
  const spoken = inferCareFamily(extraText);
  if (spoken) {
    return spoken;
  }
  const leads = [...(conversation?.messages || [])]
    .reverse()
    .filter((item) => item.author === "lead");
  for (const item of leads.slice(0, 8)) {
    const family = inferCareFamily(item.text);
    if (family) {
      return family;
    }
  }
  return inferCareFamily(
    `${conversation?.treatment || ""} ${conversation?.campaign || ""} ${conversation?.offerLabel || ""}`,
  );
}

function humanizeOfferTitle(value) {
  let text = String(value || "")
    .replace(/\+/g, " et ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  const needle = normalizeCare(text);
  if (/^(le )?minceur$/.test(needle)) {
    return "un soin minceur";
  }
  if (/^(notre |le )?soin visage$/.test(needle)) {
    return "un soin visage";
  }
  if (/^l['’]?epilation( definitive)?$/.test(needle)) {
    return "une épilation définitive";
  }
  text = text.charAt(0).toLowerCase() + text.slice(1);
  text = text
    .replace(/^bilan\b/i, "un bilan")
    .replace(/\bet seance\b/gi, "et une séance")
    .replace(/\bet séance\b/gi, "et une séance");
  if (!/^(un|une|le|la|les|l['’]|votre|notre)\b/i.test(text)) {
    if (/minceur|cryo/.test(needle)) {
      return /bilan|soin/.test(needle) ? `un ${text}` : "un soin minceur";
    }
    if (/visage|hydra/.test(needle)) {
      return "un soin visage";
    }
    if (/epilation|laser/.test(needle)) {
      return "une épilation définitive";
    }
  }
  return text;
}

function phraseFromCareTitle(value) {
  let text = String(value || "")
    .replace(/\s+[-–—]\s+.+$/u, "")
    .replace(/\s*\([^)]*sans chirurgie[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  text = text.charAt(0).toLowerCase() + text.slice(1);
  if (/^(un|une|le|la|les|des|l['’]|votre|notre)\b/i.test(text)) {
    return text;
  }
  if (/^soins\b/i.test(text) || /^séances\b/i.test(text) || /^seances\b/i.test(text)) {
    return `des ${text}`;
  }
  if (/^épilation\b/i.test(text) || /^epilation\b/i.test(text) || /^séance\b/i.test(text) || /^seance\b/i.test(text)) {
    return `une ${text}`;
  }
  return `un ${text}`;
}

function naturalOfferPhrase(family, rawOffer) {
  const humanized = humanizeOfferTitle(rawOffer);
  if (humanized) {
    return humanized;
  }
  if (family === "minceur") {
    return "un soin minceur";
  }
  if (family === "visage") {
    return "un soin visage";
  }
  if (family === "epilation") {
    return "une épilation définitive";
  }
  return "";
}

function careLabelForFamily(family) {
  if (family === "minceur") {
    return "Soin minceur";
  }
  if (family === "visage") {
    return "Soin visage";
  }
  if (family === "epilation") {
    return "Épilation définitive";
  }
  return "";
}

function welcomeTemplateNames(family) {
  if (family === "minceur") {
    return ["seya_accueil_minceur"];
  }
  if (family === "epilation") {
    return ["seya_accueil_laser", "seya_accueil_epilation", "seya_accueil_epil"];
  }
  if (family === "visage") {
    return ["seya_accueil_visage", "seya_accueil_hydrafacial"];
  }
  return [];
}

function isGenericWelcomeTemplate(name) {
  return /^(seya_accueil|seya_accueil_|seya_accueil_dispo)$/i.test(
    String(name || "").trim(),
  );
}

function templateFitsFamily(name, family) {
  const needle = normalizeCare(name);
  if (!family) {
    return false;
  }
  if (family === "minceur") {
    return /minceur|cryo/.test(needle);
  }
  if (family === "epilation") {
    return /laser|epil/.test(needle);
  }
  if (family === "visage") {
    return /visage|hydra|peau/.test(needle);
  }
  return false;
}

function pickApprovedTemplate(templates, family) {
  const approved = (Array.isArray(templates) ? templates : []).filter(
    (item) => String(item?.status || "").toUpperCase() === "APPROVED",
  );
  const preferred = welcomeTemplateNames(family);
  for (const name of preferred) {
    const exact = approved.find((item) => item.name === name);
    if (exact) {
      return exact;
    }
  }
  const byFamily = approved.find((item) => templateFitsFamily(item.name, family));
  if (byFamily) {
    return byFamily;
  }
  return (
    approved.find((item) => isGenericWelcomeTemplate(item.name)) ||
    null
  );
}

function compactOfferKey(value) {
  return normalizeCare(value)
    .replace(/copy/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function findOfferMap(seya, ...parts) {
  const maps = Array.isArray(seya?.offerMaps) ? seya.offerMaps : [];
  const campaign = parts[0];
  const hay = parts.filter(Boolean).join(" ");
  const needle = normalizeCare(hay);
  const compactHay = compactOfferKey(hay);
  const campaignNeedle = normalizeCare(campaign);
  const compactCampaign = compactOfferKey(campaign);
  if (!needle) {
    return null;
  }

  let best = null;
  let bestScore = 0;
  for (const item of maps) {
    const match = String(item?.match || "").trim();
    const label = String(item?.label || "").trim();
    if (!match) {
      continue;
    }
    const nMatch = normalizeCare(match);
    const cMatch = compactOfferKey(match);
    if (nMatch.length < 2) {
      continue;
    }
    let score = 0;
    if (
      campaignNeedle &&
      (campaignNeedle === nMatch || compactCampaign === cMatch)
    ) {
      score = 5000 + nMatch.length;
    } else if (needle === nMatch || compactHay === cMatch) {
      score = 4000 + nMatch.length;
    } else if (needle.includes(nMatch) || nMatch.includes(needle)) {
      score = 2000 + nMatch.length;
    } else if (
      cMatch.length > 3 &&
      (compactHay.includes(cMatch) || cMatch.includes(compactHay))
    ) {
      score = 500 + cMatch.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { match, label };
    }
  }
  return best;
}

function phraseConfiguredOffer(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

module.exports = {
  activeCareFamily,
  careLabelForFamily,
  findOfferMap,
  humanizeOfferTitle,
  inferCareFamily,
  isGenericWelcomeTemplate,
  naturalOfferPhrase,
  phraseConfiguredOffer,
  phraseFromCareTitle,
  pickApprovedTemplate,
  templateFitsFamily,
  welcomeTemplateNames,
};
