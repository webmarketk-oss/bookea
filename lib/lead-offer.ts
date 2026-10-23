import type { Lead } from "../types/lead";

function normalized(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const OFFER_EVENT = "offer";

export function joinOfferLabels(
  ...labels: Array<string | null | undefined>
) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const label of labels) {
    const raw = String(label || "").trim();
    const key = normalized(raw);
    if (!raw || !key || seen.has(key)) {
      continue;
    }
    if (/^(meta lead ads|soin a preciser)$/.test(key)) {
      continue;
    }
    seen.add(key);
    values.push(raw);
  }
  return values.join(" · ");
}

export function sameLeadOffer(
  left?: string | null,
  right?: string | null,
) {
  const a = normalized(left);
  const b = normalized(right);
  return Boolean(a && b && a === b);
}

export function incomingHasNewOffer(
  incoming: { campaign?: string | null; treatment?: string | null },
  existing?: { campaign?: string | null; treatment?: string | null } | null,
) {
  const next = String(incoming.campaign || incoming.treatment || "").trim();
  if (!normalized(next)) {
    return false;
  }
  if (!existing) {
    return true;
  }
  return !(
    sameLeadOffer(incoming.treatment, existing.treatment) ||
    sameLeadOffer(incoming.campaign, existing.campaign) ||
    sameLeadOffer(next, existing.treatment) ||
    sameLeadOffer(next, existing.campaign)
  );
}

export function offersFromEvents(
  events:
    | Array<{
        event_type?: string | null;
        to_value?: string | null;
        from_value?: string | null;
      }>
    | null
    | undefined,
) {
  const treatments: string[] = [];
  const campaigns: string[] = [];
  for (const event of events || []) {
    if (event.event_type !== OFFER_EVENT) {
      continue;
    }
    if (event.to_value) {
      treatments.push(event.to_value);
    }
    if (event.from_value) {
      campaigns.push(event.from_value);
    }
  }
  return {
    treatment: joinOfferLabels(...treatments),
    campaign: joinOfferLabels(...campaigns),
  };
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
