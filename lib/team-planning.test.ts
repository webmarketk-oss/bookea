import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickTeamPlanning } from "./team-planning-choice.ts";

function snapshot(names: string[], updatedAt: number) {
  const practitioners = names.map((name) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
  }));
  return {
    practitioners,
    schedules: practitioners.map((item) => ({ practitionerId: item.id })),
    updatedAt,
  };
}

describe("planning équipe", () => {
  it("garde une praticienne saisie sur cet appareil tant que le serveur a l’ancienne liste", () => {
    const chosen = pickTeamPlanning(
      snapshot(["Manon", "Karen", "Léa"], 200),
      snapshot(["Manon", "Karen"], 100),
      (practitioner) => ({ practitionerId: practitioner.id }),
      () => snapshot([], 0),
    );

    assert.equal(chosen.source, "local");
    assert.deepEqual(
      chosen.practitioners.map((item) => item.name),
      ["Manon", "Karen", "Léa"],
    );
  });

  it("prend le serveur quand il est plus récent", () => {
    const chosen = pickTeamPlanning(
      snapshot(["Manon"], 100),
      snapshot(["Manon", "Karen"], 300),
      (practitioner) => ({ practitionerId: practitioner.id }),
      () => snapshot([], 0),
    );

    assert.equal(chosen.source, "remote");
    assert.deepEqual(
      chosen.practitioners.map((item) => item.name),
      ["Manon", "Karen"],
    );
  });

  it("garde le serveur déjà enregistré quand aucune date locale n’est plus récente", () => {
    const chosen = pickTeamPlanning(
      snapshot(["Ancienne"], 0),
      snapshot(["Manon", "Karen"], 0),
      (practitioner) => ({ practitionerId: practitioner.id }),
      () => snapshot([], 0),
    );

    assert.equal(chosen.source, "remote");
    assert.deepEqual(
      chosen.practitioners.map((item) => item.name),
      ["Manon", "Karen"],
    );
  });
});
