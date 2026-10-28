/**
 * Plan de synchronisation (sans effet de bord) : que faire de chaque rendez-vous partenaire.
 *
 * Mode « read »   : on garde l'horaire et le statut pour consultation, sans toucher à l'agenda.
 * Mode « import » : en plus, chaque rendez-vous bloque un créneau dans l'agenda (cabine liée),
 *                   déplacé ou annulé quand le partenaire le modifie ou l'annule.
 * Un rendez-vous partenaire correspond toujours à une seule ligne (clé : son identifiant).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function instant(value) {
  const at = Date.parse(String(value || ""));
  return Number.isFinite(at) ? at : null;
}

function sameInstant(left, right) {
  return instant(left) === instant(right);
}

/** Rendez-vous venu de Bookea et renvoyé par le partenaire : à ne pas réimporter. */
function isBookeaEcho(item, bookeaIds) {
  const ref = String(item?.sourceRef || "").trim();
  if (!ref) {
    return false;
  }
  if (/^bookea:/i.test(ref)) {
    return true;
  }
  return UUID.test(ref) && bookeaIds.has(ref.toLowerCase());
}

function latestPerExternalId(items) {
  const byId = new Map();
  for (const item of items) {
    const id = String(item?.externalId || "").trim();
    if (!id) {
      continue;
    }
    const current = byId.get(id);
    if (!current || (instant(item.updatedAt) ?? 0) >= (instant(current.updatedAt) ?? 0)) {
      byId.set(id, { ...item, externalId: id });
    }
  }
  return [...byId.values()];
}

/**
 * @param {object} input
 * @param {"read"|"import"} input.mode
 * @param {Array} input.items        rendez-vous partenaire au format commun
 * @param {Map}   input.existing     external_id → ligne external_appointments
 * @param {Map}   input.mappings     external_calendar_id → { room_id, practitioner_id }
 * @param {Set}   input.bookeaIds    identifiants Bookea (minuscules) renvoyés par le partenaire
 * @param {{from:string,to:string}} [input.fullWindow] période entièrement relue : un rendez-vous
 *        connu dans cette période mais absent de la réponse est considéré comme supprimé.
 */
function planExternalSync({ mode, items, existing, mappings, bookeaIds = new Set(), fullWindow }) {
  const actions = [];
  const seen = new Set();
  const requireMapping = mode === "import" || mappings.size > 0;

  for (const item of latestPerExternalId(items || [])) {
    seen.add(item.externalId);
    const start = instant(item.start);
    const end = instant(item.end);
    if (start == null || end == null || end <= start) {
      actions.push({ kind: "skip", reason: "invalid", externalId: item.externalId });
      continue;
    }
    if (isBookeaEcho(item, bookeaIds)) {
      actions.push({ kind: "skip", reason: "from_bookea", externalId: item.externalId });
      continue;
    }
    const mapping = mappings.get(String(item.calendarId || "")) || null;
    if (requireMapping && !mapping) {
      actions.push({ kind: "skip", reason: "unmapped_calendar", externalId: item.externalId });
      continue;
    }
    const cancelled = item.status === "cancelled";
    const row = existing.get(item.externalId);
    if (!row) {
      actions.push(
        cancelled
          ? { kind: "skip", reason: "cancelled_unknown", externalId: item.externalId }
          : { kind: "create", item, mapping },
      );
      continue;
    }
    if (cancelled) {
      actions.push(
        row.status === "cancelled"
          ? { kind: "unchanged", externalId: item.externalId }
          : { kind: "cancel", reason: "cancelled_by_partner", item, existing: row },
      );
      continue;
    }
    const unchanged =
      row.status !== "cancelled" &&
      sameInstant(row.starts_at, item.start) &&
      sameInstant(row.ends_at, item.end) &&
      String(row.external_calendar_id || "") === String(item.calendarId || "");
    actions.push(
      unchanged
        ? { kind: "unchanged", externalId: item.externalId }
        : { kind: "update", item, mapping, existing: row },
    );
  }

  if (fullWindow) {
    const from = instant(`${fullWindow.from}T00:00:00Z`);
    const to = instant(`${fullWindow.to}T23:59:59Z`);
    for (const [externalId, row] of existing) {
      const start = instant(row.starts_at);
      if (
        !seen.has(externalId) &&
        row.status !== "cancelled" &&
        start != null &&
        start >= from &&
        start <= to
      ) {
        actions.push({ kind: "cancel", reason: "missing_from_partner", item: null, existing: row });
      }
    }
  }

  return actions;
}

module.exports = { isBookeaEcho, planExternalSync };
