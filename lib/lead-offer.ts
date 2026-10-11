import type { Lead } from "../types/lead";

function normalized(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function leadOfferLabel(lead: Pick<Lead, "campaign" | "treatment">) {
  const offer = String(lead.campaign || "").trim();
  const needle = normalized(offer);
  if (
    !needle ||
    needle === normalized(lead.treatment) ||
    /^(meta lead ads|soin a preciser|facebook|instagram|systeme\.?io|savemyleads|make|landing|bookea)$/.test(
      needle,
    )
  ) {
    return "";
  }
  return offer;
}

export function leadSourceFromStored(name?: string | null) {
  return /save\s*my\s*leads/i.test(String(name || "")) ? "Facebook" : "";
}

export function leadImportToolFromEvents(
  sourceName: string | null | undefined,
  notes: Array<string | null | undefined>,
) {
  for (const note of notes) {
    const match = String(note || "").match(/\bImport : ([^.]+)\./);
    if (match) {
      return match[1].trim();
    }
  }
  return leadSourceFromStored(sourceName) ? "SaveMyLeads" : "";
}
