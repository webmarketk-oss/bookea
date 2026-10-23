export const COMMERCIAL_EVENT = "commercial";

export function practitionerLabel(name?: string | null) {
  const value = String(name || "").trim();
  return value || "Équipe";
}

export function normalizePractitionerName(name?: string | null) {
  return practitionerLabel(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function practitionerNamesMatch(left?: string | null, right?: string | null) {
  const a = normalizePractitionerName(left);
  const b = normalizePractitionerName(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const firstA = a.split(" ")[0] || "";
  const firstB = b.split(" ")[0] || "";
  if (!firstA || !firstB || firstA !== firstB) {
    return false;
  }
  return a.startsWith(b) || b.startsWith(a);
}

export function statusChangeNote(author: string, fromStatus: string, toStatus: string) {
  return `${practitionerLabel(author)} · Statut changé : ${fromStatus} → ${toStatus}.`;
}

export function authorFromStatusNote(note?: string | null) {
  const text = String(note || "").trim();
  const match = text.match(/^(.+?) · Statut changé :/);
  return match?.[1]?.trim() || "";
}

export function visibleStatusChangeText(note?: string | null) {
  const text = String(note || "").trim();
  const stripped = text.replace(/^.+? · (Statut changé :)/, "$1").trim();
  return stripped || text;
}

export function latestAssignedPractitioner(
  events:
    | Array<{
        event_type?: string | null;
        to_value?: string | null;
        created_at?: string | null;
      }>
    | null
    | undefined,
) {
  const items = Array.isArray(events) ? [...events] : [];
  items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const latest = items.find((event) => event.event_type === COMMERCIAL_EVENT);
  const name = String(latest?.to_value || "").trim();
  return name || "";
}
