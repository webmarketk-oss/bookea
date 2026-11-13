import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPlaceholderTeam,
  pickTeamPlanning,
  shouldWriteRemoteTeam,
} from "./team-planning-choice.ts";

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

  it("ne laisse pas l’équipe d’exemple cacher les commerciaux du centre", () => {
    const demo = snapshot(
      ["Samantha", "Marie L.", "Camille", "Inès", "Aurélie"],
      500,
    );
    demo.practitioners[0].id = "samantha";
    demo.practitioners[1].id = "marie";
    demo.practitioners[2].id = "camille";
    demo.practitioners[3].id = "ines";
    demo.practitioners[4].id = "aurelie";
    const center = snapshot(["Léa", "Inès C."], 100);

    assert.equal(isPlaceholderTeam(demo.practitioners), true);

    const fromServer = pickTeamPlanning(
      demo,
      center,
      (practitioner) => ({ practitionerId: practitioner.id }),
      () => snapshot([], 0),
    );
    assert.equal(fromServer.source, "remote");
    assert.deepEqual(
      fromServer.practitioners.map((item) => item.name),
      ["Léa", "Inès C."],
    );

    const fromThisBrowser = pickTeamPlanning(
      center,
      { ...demo, updatedAt: 900 },
      (practitioner) => ({ practitionerId: practitioner.id }),
      () => demo,
    );
    assert.equal(fromThisBrowser.source, "local");
    assert.deepEqual(
      fromThisBrowser.practitioners.map((item) => item.name),
      ["Léa", "Inès C."],
    );
  });

  it("n’envoie pas l’équipe d’exemple ni une copie plus vieille sur le centre", () => {
    const demo = snapshot(
      ["Samantha", "Marie L.", "Camille", "Inès", "Aurélie"],
      900,
    );
    demo.practitioners[0].id = "samantha";
    demo.practitioners[1].id = "marie";
    demo.practitioners[2].id = "camille";
    demo.practitioners[3].id = "ines";
    demo.practitioners[4].id = "aurelie";
    const center = snapshot(["Léa", "Chloé"], 200);

    assert.equal(shouldWriteRemoteTeam(demo, center), false);
    assert.equal(shouldWriteRemoteTeam(snapshot(["Manon"], 100), center), false);
    assert.equal(shouldWriteRemoteTeam(snapshot(["Léa", "Chloé", "Inès"], 400), center), true);
    assert.equal(shouldWriteRemoteTeam(center, demo), true);
  });
});
