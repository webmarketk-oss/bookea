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

module.exports = {
  careLabelForFamily,
  inferCareFamily,
  isGenericWelcomeTemplate,
  pickApprovedTemplate,
  templateFitsFamily,
  welcomeTemplateNames,
};
