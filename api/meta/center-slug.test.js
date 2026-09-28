const test = require("node:test");
const assert = require("node:assert/strict");
const { centerSlugCandidates } = require("./center-slug");

test("l’ancien slug Clermont pointe vers le slug actuel", () => {
  const list = centerSlugCandidates("jfg-clinique-clermont");
  assert.ok(list.includes("jfg-clinique-clermont"));
  assert.ok(list.includes("jfg-clinic-clermont"));
});
