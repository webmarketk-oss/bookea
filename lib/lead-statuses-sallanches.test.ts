import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isGaillardCenter,
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

  it("Pour Sallanches n’apparaît que pour Gaillard", () => {
    assert.equal(leadStatuses.includes("Pour Sallanches"), false);
    assert.equal(
      leadStatusesForCenter("JFG Clinic Sallanches").includes("Pour Sallanches"),
      false,
    );
    assert.equal(
      leadStatusesForCenter("JFG Clinic Gaillard").includes("Pour Gaillard"),
      false,
    );
    assert.equal(
      leadStatusesForCenter("JFG Clinic Gaillard").includes("Pour Sallanches"),
      true,
    );
    assert.equal(isGaillardCenter("JFG Clinic Gaillard"), true);
    assert.equal(normalizeLeadStatus("pour sallanches"), "Pour Sallanches");
  });
});
