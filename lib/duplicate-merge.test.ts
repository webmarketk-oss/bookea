const test = require("node:test");
const assert = require("node:assert/strict");
const { duplicateMergeTarget } = require("./duplicate-merge.ts");

test("le doublon relie l’ancienne fiche à la plus récente, jamais l’inverse", () => {
  const { kept, linked } = duplicateMergeTarget([
    { id: "new", createdDate: "2026-11-25", status: "Nouveau" },
    { id: "old", createdDate: "2026-08-02", status: "À relancer" },
  ]);
  assert.equal(kept.id, "new");
  assert.deepEqual(linked.map((lead) => lead.id), ["old"]);
});
