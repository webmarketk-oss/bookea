import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { leadAxis } from "./lead-axis.ts";

describe("axe d’un lead", () => {
  it("prend le soin, pas le nom de la campagne", () => {
    assert.equal(
      leadAxis({ treatment: "Soin minceur", campaign: "MINCEUR29 -30%" }),
      "minceur",
    );
    assert.equal(
      leadAxis({ treatment: "Épilation définitive", campaign: "LASER 1+1" }),
      "epilation",
    );
    assert.equal(leadAxis({ treatment: "Soin visage", campaign: "DIAG39" }), "visage");
    assert.equal(
      leadAxis({ treatment: "Suivi diététique", campaign: "Offre mars" }),
      "diet",
    );
  });

  it("retombe sur l’offre si le soin n’est pas un axe", () => {
    assert.equal(leadAxis({ treatment: "", campaign: "Bilan laser offert" }), "epilation");
    assert.equal(leadAxis({ treatment: "Soin à préciser", campaign: "Cryolipolyse" }), "minceur");
  });

  it("laisse Autre quand rien ne correspond", () => {
    assert.equal(leadAxis({ treatment: "Massage", campaign: "Promo locale" }), "autre");
  });
});
