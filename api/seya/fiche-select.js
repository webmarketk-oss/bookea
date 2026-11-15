/** Colonnes de la fiche Seya, sans settings.seya.conversations. */

const SEYA_FICHE_KEYS = [
  "whatsappAgentEnabled",
  "autoMessageOnNewLead",
  "seyaMission",
  "qualifyOnSignup",
  "askForAppointment",
  "bookAppointment",
  "handoffToHuman",
  "relanceEnabled",
  "relanceDays",
  "relances",
  "brief",
  "centerProfile",
  "treatmentBriefs",
  "offerMaps",
];

const SEYA_FICHE_SELECT = SEYA_FICHE_KEYS.map(
  (key) => `${key}:settings->seya->${key}`,
).join(",");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ficheFromRow(row) {
  const source = asRecord(row);
  const seya = {};
  let present = false;
  for (const key of SEYA_FICHE_KEYS) {
    if (source[key] !== undefined && source[key] !== null) {
      seya[key] = source[key];
      present = true;
    }
  }
  return present ? seya : null;
}

async function loadSeyaFicheColumns(supabase, centerId) {
  if (!centerId || typeof supabase?.from !== "function") {
    return null;
  }
  const { data, error } = await supabase
    .from("centers")
    .select(SEYA_FICHE_SELECT)
    .eq("id", String(centerId))
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return ficheFromRow(data);
}

module.exports = {
  SEYA_FICHE_KEYS,
  SEYA_FICHE_SELECT,
  ficheFromRow,
  loadSeyaFicheColumns,
};
