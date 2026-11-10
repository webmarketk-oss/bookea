import assert from "node:assert/strict";
import test from "node:test";
import { matchesPersonSearch, matchesPhoneSearch } from "./person-search.ts";

test("la recherche prospect trouve le nom inversé", () => {
  assert.equal(matchesPersonSearch("Dupont Marie", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("marie dupont", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("Léa Martin", "Lea", "Martin"), true);
  assert.equal(matchesPersonSearch("martin lea", "Léa", "Martin"), true);
});

test("la recherche téléphone accepte 06 et +336", () => {
  assert.equal(matchesPhoneSearch("06682313155", "+336682313155"), true);
  assert.equal(matchesPhoneSearch("+336682313155", "06 68 23 13 15 5"), true);
  assert.equal(matchesPhoneSearch("06", "+336682313155"), true);
  assert.equal(matchesPhoneSearch("+336", "06682313155"), true);
  assert.equal(matchesPhoneSearch("00336682313155", "+336682313155"), true);
  assert.equal(matchesPhoneSearch("0612345678", "+336682313155"), false);
  assert.equal(matchesPhoneSearch("marie", "+336682313155"), false);
});

test("la recherche prospect garde les correspondances simples", () => {
  assert.equal(matchesPersonSearch("marie", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("dupont", "Marie", "Dupont"), true);
  assert.equal(matchesPersonSearch("sophie", "Marie", "Dupont"), false);
});
