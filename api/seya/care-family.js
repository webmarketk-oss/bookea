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
  if (
    /epilation|laser|definitive|aisselle|maillot|bikini|pilosit/.test(needle)
  ) {
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

function understandThread(conversation, extraText) {
  const lines = (Array.isArray(conversation?.messages) ? conversation.messages : [])
    .map((item) => ({
      author: item.author,
      text: String(item.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((item) => item.text);
  const latest = String(extraText || "").replace(/\s+/g, " ").trim();
  if (latest) {
    const last = lines[lines.length - 1];
    if (!(last?.author === "lead" && last.text === latest)) {
      lines.push({ author: "lead", text: latest });
    }
  }

  const leadTexts = lines
    .filter((item) => item.author === "lead")
    .map((item) => item.text);
  let family = "";
  let need = "";
  for (const text of [...leadTexts].reverse()) {
    const spoken = inferCareFamily(text);
    if (!spoken) {
      continue;
    }
    family = spoken;
    need = careLabelForFamily(spoken);
    break;
  }
  if (!family) {
    family = inferCareFamily(
      `${conversation?.qualification?.need || ""} ${conversation?.treatment || ""} ${conversation?.campaign || ""} ${conversation?.offerLabel || ""}`,
    );
    need = family ? careLabelForFamily(family) : "";
  }

  const lastLead = leadTexts[leadTexts.length - 1] || latest;
  const asked = [];
  const needle = normalizeCare(lastLead);
  if (/prix|tarif|coute|cout|combien|gratuit|offert/.test(needle) && !/combien de (temps|seance)/.test(needle)) {
    asked.push("prix");
  }
  if (/dure|combien de temps|minutes/.test(needle)) {
    asked.push("duree");
  }
  if (/technique|cest quoi comme|c est quoi le soin/.test(needle)) {
    asked.push("technique");
  }

  const staffTexts = lines
    .filter((item) => item.author === "centre")
    .map((item) => item.text);

  const summary = [
    family ? `Soin actuel, d’après tout le fil : ${need || family}.` : "Soin actuel encore flou.",
    asked.length ? `Elle demande maintenant : ${asked.join(", ")}.` : "",
    staffTexts.length
      ? `Messages de l’équipe (prioritaires sur l’agenda automatique) : ${staffTexts
          .slice(-6)
          .map((text) => text.slice(0, 160))
          .join(" · ")}`
      : "",
    leadTexts.length
      ? `Fil prospect : ${leadTexts
          .slice(-12)
          .map((text, index) => `${index + 1}) ${text.slice(0, 140)}`)
          .join(" · ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { family, need, asked, summary };
}

function activeCareFamily(conversation, extraText) {
  return (
    understandThread(conversation, extraText).family ||
    inferCareFamily(
      `${conversation?.treatment || ""} ${conversation?.campaign || ""} ${conversation?.offerLabel || ""}`,
    )
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
  if (/^offre\b/i.test(text)) {
    return `notre ${text}`;
  }
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
  if (/^offre\b/i.test(text)) {
    return `notre ${text}`;
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

function offeredTreatmentNames(seya) {
  const briefs = Array.isArray(seya?.treatmentBriefs) ? seya.treatmentBriefs : [];
  const maps = Array.isArray(seya?.offerMaps) ? seya.offerMaps : [];
  return [
    ...briefs.map((item) => item?.name),
    ...maps.map((item) => `${item?.match || ""} ${item?.label || ""}`),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function serviceIsOffered(asked, seya) {
  const needle = normalizeCare(asked);
  if (!needle) {
    return false;
  }
  if (/yoga|pilates|massage|coiffure|ongle|manucure|pedicure/.test(needle)) {
    return offeredTreatmentNames(seya).some((name) =>
      /yoga|pilates|massage|coiffure|ongle/.test(normalizeCare(name)),
    );
  }
  if (
    offeredTreatmentNames(seya).some((name) => {
      const current = normalizeCare(name);
      return current.includes(needle) || needle.includes(current);
    })
  ) {
    return true;
  }
  const family = inferCareFamily(asked);
  return Boolean(
    family &&
      offeredTreatmentNames(seya).some((name) => inferCareFamily(name) === family),
  );
}

function phraseAskedService(asked) {
  const value = String(asked || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) {
    return "cette prestation";
  }
  if (/^(le |la |l'|les |un |une )/i.test(value)) {
    return value;
  }
  return `le ${value}`;
}

function serviceOfferReply(text, seya) {
  const { askedServiceName, isServiceAsk } = require("./conversation");
  if (!isServiceAsk(text)) {
    return "";
  }
  const asked = askedServiceName(text) || "cette prestation";
  if (serviceIsOffered(asked, seya)) {
    return "Oui, nous proposons ça. Je peux regarder un créneau si vous le souhaitez.";
  }
  return `Non, nous ne faisons pas ${phraseAskedService(asked)}.`;
}

function phraseConfiguredOffer(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  const lowered = text.charAt(0).toLowerCase() + text.slice(1);
  if (/^(un|une|le|la|les|des|l['’]|votre|notre)\b/i.test(lowered)) {
    return lowered;
  }
  if (/^offre\b/i.test(lowered)) {
    return `notre ${lowered}`;
  }
  return lowered;
}

module.exports = {
  activeCareFamily,
  understandThread,
  careLabelForFamily,
  findOfferMap,
  humanizeOfferTitle,
  inferCareFamily,
  isGenericWelcomeTemplate,
  naturalOfferPhrase,
  phraseConfiguredOffer,
  phraseAskedService,
  serviceIsOffered,
  serviceOfferReply,
  phraseFromCareTitle,
  pickApprovedTemplate,
  templateFitsFamily,
  welcomeTemplateNames,
};
