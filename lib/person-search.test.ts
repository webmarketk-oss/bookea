import assert from "node:assert/strict";
import test from "node:test";
import { matchesPersonSearch } from "./person-search.ts";

test("la recherche prospect trouve le nom inversé", () => {
  assert.equal(matchesPersonSearch("Dupont Marie", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("marie dupont", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("Léa Martin", "Lea", "Martin"), true);
  assert.equal(matchesPersonSearch("martin lea", "Léa", "Martin"), true);
});

test("la recherche prospect garde les correspondances simples", () => {
  assert.equal(matchesPersonSearch("marie", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("dupont", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("sophie", "Marie", "Dupont"), false);
});
