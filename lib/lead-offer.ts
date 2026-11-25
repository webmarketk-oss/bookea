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

/** Systeme.io sans soin reconnu est le tunnel minceur. Un soin déjà nommé reste tel quel. */
export function systemeIoCareLabel(source?: string | null, treatment?: string | null) {
  const label = String(treatment || "").trim();
  if (!/systeme/i.test(String(source || ""))) {
    return label;
  }
  const parts = label
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part && !/^soin a preciser$|^a preciser$/.test(normalized(part)));
  return parts.length ? parts.join(" · ") : "Soin minceur";
}

/** Sépare la note saisie du bloc landing (offre, zones, contact) recopié dans le commentaire. */
export function splitLeadComment(text: string) {
  const raw = String(text || "").trim();
  const zonesAt = raw.search(/\s+zones\s*:/i);
  if (zonesAt < 0) {
    return { note: raw, offer: "", zones: "", contact: "" };
  }
  const head = raw.slice(0, zonesAt).trim();
  const tail = raw.slice(zonesAt).replace(/^\s+zones\s*:/i, "").trim();
  const contactMatch = tail.match(/^(.*?)(?:\s*\|\s*Contact(?:\s+\S+)?\s*:\s*(.+))\s*$/i);
  const zones = (contactMatch ? contactMatch[1] : tail).replace(/[—-]\s*$/g, "").trim();
  const contact = String(contactMatch?.[2] || "").trim();
  const marked = head.match(/^(.*?)(?:\s+Zone\s*:\s*)([\s\S]*)$/i);
  if (marked) {
    return { note: marked[1].trim(), offer: marked[2].trim(), zones, contact };
  }
  const prefixed = head.match(/^Zone\s*:\s*([\s\S]*)$/i);
  if (prefixed) {
    return { note: "", offer: prefixed[1].replace(/[—-]\s*$/g, "").trim(), zones, contact };
  }
  return { note: head.replace(/[—-]\s*$/g, "").trim(), offer: "", zones, contact };
}

/** Le champ commentaire affiche la note, pas l’offre déjà visible à côté. */
export function staffCommentText(text: string) {
  return splitLeadComment(text).note;
}

/**
 * L’offre reste dans sa colonne. Les zones et le contact ne sont gardés
 * que sur le commentaire le plus ancien qui les contient.
 * L’entrée est dans l’ordre d’affichage, du plus récent au plus ancien.
 */
export function commentsWithoutRepeatedOffer(comments: Array<{ text: string }>) {
  const parsed = comments.map((item) => splitLeadComment(item.text));
  let detailsAt = -1;
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    if (parsed[index].zones || parsed[index].contact) {
      detailsAt = index;
      break;
    }
  }
  return parsed.map((item, index) => {
    const parts = [item.note];
    if (index === detailsAt) {
      if (item.zones) {
        parts.push(`Zones : ${item.zones}`);
      }
      if (item.contact) {
        parts.push(`Contact message : ${item.contact}`);
      }
    }
    return parts.filter(Boolean).join(" | ").trim();
  });
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

/** Enlève le détail technique du webhook (champs, tunnel, email déjà affiché sur la fiche). */
export function visibleReceptionNote(text: string) {
  return String(text || "")
    .replace(/\s*Tunnel \/ page reçus :[\s\S]*?(?=Champs reçus :|$)/g, " ")
    .replace(/\s*Champs reçus :[\s\S]*$/g, "")
    .replace(/\s*(?:Email|Téléphone|Page|Formulaire) : [^.]+\./g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
