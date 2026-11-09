import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSallanchesCenter,
  leadStatuses,
  leadStatusesForCenter,
  normalizeLeadStatus,
} from "./lead-statuses.ts";

describe("statut Pour Gaillard", () => {
  it("n’apparaît que pour Sallanches", () => {
    assert.equal(leadStatuses.includes("Pour Gaillard"), false);
    assert.equal(leadStatusesForCenter("JFG Clinic Bruz").includes("Pour Gaillard"), false);
    assert.equal(
      leadStatusesForCenter("JFG Clinic Sallanches").includes("Pour Gaillard"),
      true,
    );
    assert.equal(isSallanchesCenter("JFG Clinic Salanches"), true);
  });

  it("reste Pour Gaillard à l’enregistrement, même écrit en minuscules", () => {
    assert.equal(normalizeLeadStatus("pour gaillard"), "Pour Gaillard");
    assert.equal(normalizeLeadStatus("Pour Gaillard"), "Pour Gaillard");
  });
});
