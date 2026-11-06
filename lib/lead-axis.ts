export const leadAxisOrder = [
  "minceur",
  "epilation",
  "diet",
  "visage",
  "autre",
] as const;

export type LeadAxis = (typeof leadAxisOrder)[number];

export const leadAxisLabels: Record<LeadAxis, string> = {
  minceur: "Minceur",
  epilation: "Épilation définitive",
  diet: "Diététique",
  visage: "Visage",
  autre: "Autre",
};

function normalizeAxisText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function axisFromText(value: string): LeadAxis | "" {
  const text = normalizeAxisText(value);
  if (!text || /a preciser|non precise|inconnu/.test(text)) {
    return "";
  }
  if (/diet|diete|dietetique|nutrition|reequilibr/.test(text)) {
    return "diet";
  }
  if (/laser|epil|depil|pilaire|definitive/.test(text)) {
    return "epilation";
  }
  if (/visage|hydrafacial|acne/.test(text)) {
    return "visage";
  }
  if (/minceur|cryo|cellulite|aminc/.test(text)) {
    return "minceur";
  }
  return "";
}

export function leadAxis(lead: {
  treatment?: string | null;
  campaign?: string | null;
}): LeadAxis {
  return axisFromText(lead.treatment || "") || axisFromText(lead.campaign || "") || "autre";
}
