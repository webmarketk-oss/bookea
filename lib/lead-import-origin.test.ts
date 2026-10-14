import assert from "node:assert/strict";
import test from "node:test";

import { IMPORT_ORIGIN_EVENT, leadImportOrigin } from "./lead-import-origin.ts";

test("marqueur d’import enregistré : le prospect va dans CRM Imports", () => {
  const origin = leadImportOrigin("Facebook", [
    { event_type: "system", note: "Lead reçu via webhook Bookea. Source : Facebook." },
    { event_type: IMPORT_ORIGIN_EVENT, to_value: "import", created_at: "2026-10-14T10:00:00Z" },
  ]);
  assert.deepEqual(origin, { imported: true, candidate: "" });
});

test("le dernier marqueur l’emporte : un prospect remis dans CRM Leads y reste", () => {
  const origin = leadImportOrigin("import", [
    { event_type: IMPORT_ORIGIN_EVENT, to_value: "import", created_at: "2026-10-14T10:00:00Z" },
    { event_type: IMPORT_ORIGIN_EVENT, to_value: "campaign", created_at: "2026-10-14T11:00:00Z" },
  ]);
  assert.deepEqual(origin, { imported: false, candidate: "" });
});

test("ancien import sans marqueur : signalé, pas classé", () => {
  assert.deepEqual(leadImportOrigin("import", []), {
    imported: false,
    candidate: "Source « import »",
  });
  assert.deepEqual(
    leadImportOrigin("Facebook", [
      {
        event_type: "system",
        note: "Lead reçu via webhook Bookea. Source : Facebook. Formulaire : Anciens prospects Meta.",
      },
    ]),
    { imported: false, candidate: "Formulaire « Anciens prospects Meta »" },
  );
});

test("prospect de campagne : ni importé ni signalé", () => {
  assert.deepEqual(
    leadImportOrigin("Facebook", [
      { event_type: "system", note: "Lead reçu via webhook Bookea. Source : Facebook. Formulaire : Laser 1+1." },
    ]),
    { imported: false, candidate: "" },
  );
  assert.deepEqual(leadImportOrigin("Systeme.io", []), { imported: false, candidate: "" });
});
