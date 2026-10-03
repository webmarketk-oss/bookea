import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssignedCabinNames } from "./assigned-cabins.ts";

test("les prestations reprennent le nom réel des cabines, pas Cabine 1", () => {
  assert.equal(
    resolveAssignedCabinNames("Cabine 1", ["Laser", "Hydra", "Cryo"]),
    "Laser",
  );
  assert.equal(
    resolveAssignedCabinNames("cabine-2, Cabine 3", ["Laser", "Hydra", "Cryo"]),
    "Hydra, Cryo",
  );
  assert.equal(resolveAssignedCabinNames("Hydra", ["Laser", "Hydra", "Cryo"]), "Hydra");
  assert.equal(resolveAssignedCabinNames("Toutes", ["Laser", "Hydra"]), "Toutes");
});
