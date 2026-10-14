export const IMPORT_ORIGIN_EVENT = "import_origin";

export type ImportOriginEvent = {
  event_type?: string | null;
  to_value?: string | null;
  note?: string | null;
  created_at?: string | null;
};

export type LeadImportOrigin = {
  imported: boolean;
  candidate: string;
};

function normalized(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Seul le marqueur « import_origin » classe un prospect. Les anciens imports sans marqueur restent dans CRM Leads et sont seulement signalés.
export function leadImportOrigin(
  sourceName: string | null | undefined,
  events: ImportOriginEvent[],
): LeadImportOrigin {
  const marks = events
    .filter((event) => event.event_type === IMPORT_ORIGIN_EVENT)
    .sort(
      (left, right) =>
        Date.parse(String(right.created_at || "")) - Date.parse(String(left.created_at || "")),
    );
  if (marks.length) {
    return { imported: marks[0].to_value === "import", candidate: "" };
  }

  if (normalized(sourceName) === "import") {
    return { imported: false, candidate: "Source « import »" };
  }
  if (events.some((event) => /formulaire : anciens? prospects?/.test(normalized(event.note)))) {
    return { imported: false, candidate: "Formulaire « Anciens prospects Meta »" };
  }
  return { imported: false, candidate: "" };
}

export function importOriginNote(imported: boolean) {
  return imported
    ? "Origine : import de fichier (classé dans CRM Imports)."
    : "Origine : campagne (remis dans CRM Leads).";
}
