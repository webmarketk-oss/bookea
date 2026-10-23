import assert from "node:assert/strict";
import test from "node:test";

import {
  authorFromStatusNote,
  COMMERCIAL_EVENT,
  latestAssignedPractitioner,
  practitionerNamesMatch,
  statusChangeNote,
  visibleStatusChangeText,
} from "./lead-practitioner.ts";

test("Julie reste reconnue même si le profil s’appelle Julie Martin", () => {
  assert.equal(practitionerNamesMatch("Julie", "Julie Martin"), true);
  assert.equal(practitionerNamesMatch("Marie L.", "Marie"), true);
  assert.equal(practitionerNamesMatch("Julie", "Julien"), false);
  assert.equal(practitionerNamesMatch("Sandra", "Julie"), false);
});

test("le changement de statut garde le nom de la praticienne", () => {
  const julie = statusChangeNote("Julie", "Nouveau", "Apl en abs");
  const sandra = statusChangeNote("Sandra", "Apl en abs", "À relancer");

  assert.equal(authorFromStatusNote(julie), "Julie");
  assert.equal(authorFromStatusNote(sandra), "Sandra");
  assert.equal(visibleStatusChangeText(julie), "Statut changé : Nouveau → Apl en abs.");
  assert.notEqual(authorFromStatusNote(julie), authorFromStatusNote(sandra));
});

test("la dernière praticienne choisie reste celle affichée", () => {
  assert.equal(
    latestAssignedPractitioner([
      {
        event_type: COMMERCIAL_EVENT,
        to_value: "Julie",
        created_at: "2026-10-23T07:00:00.000Z",
      },
      {
        event_type: COMMERCIAL_EVENT,
        to_value: "Sandra",
        created_at: "2026-10-23T10:00:00.000Z",
      },
      {
        event_type: "status",
        to_value: "Apl en abs",
        created_at: "2026-10-23T07:05:00.000Z",
      },
    ]),
    "Sandra",
  );
});
