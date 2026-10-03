import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeProductCategories,
  mergeServiceCategories,
} from "./center-categories.ts";

test("enlever une catégorie de prestation la retire vraiment", () => {
  assert.deepEqual(
    mergeServiceCategories(["Laser", "Minceur"], [
      { category: "Laser" },
      { category: "Bilan" },
    ]),
    ["Laser", "Minceur"],
  );
});

test("une liste de catégories vide reste vide", () => {
  assert.deepEqual(
    mergeServiceCategories([], [{ category: "Laser" }]),
    [],
  );
  assert.deepEqual(
    mergeProductCategories([], [{ category: "Visage" }]),
    [],
  );
});
