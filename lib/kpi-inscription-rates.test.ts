import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countByInscriptionOutcome,
  inscriptionVisitRates,
} from "./kpi-inscription-rates.ts";

describe("taux à la date d’inscription", () => {
  it("compte un vendu et un présent dans la cohorte, sans regarder la date du statut", () => {
    const rates = inscriptionVisitRates([
      { outcomes: ["Vendu"], dealAmount: 1200 },
      { outcomes: ["Devis"], dealAmount: 0 },
      { outcomes: ["Annulation"], dealAmount: 0 },
      { outcomes: ["PVPP"], dealAmount: 0 },
      { outcomes: [], dealAmount: 0 },
    ]);

    assert.equal(rates.conversion, 50);
    assert.equal(rates.attendance, 50);
  });

  it("un devis puis une vente compte dans les deux taux", () => {
    const rates = inscriptionVisitRates([
      { outcomes: ["Devis", "Vendu"], dealAmount: 800 },
    ]);

    assert.equal(rates.conversion, 50);
    assert.equal(rates.attendance, 100);
  });

  it("une vente sous 100 € est ignorée, une vente à 100 € compte", () => {
    const rates = inscriptionVisitRates([
      { outcomes: ["Vendu"], dealAmount: 40 },
      { outcomes: ["Devis"], dealAmount: 0 },
      { outcomes: ["Vendu"], dealAmount: 100 },
    ]);

    assert.equal(rates.conversion, 50);
    assert.equal(rates.attendance, 100);
  });

  it("compte l’annulation et le no-show du prospect, même si le rendez-vous est plus tard", () => {
    const leads = [
      { outcomes: ["Annulation"] as const },
      { outcomes: ["PVPP"] as const },
      { outcomes: ["Vendu"] as const },
      { outcomes: [] as const },
    ];

    assert.equal(countByInscriptionOutcome([...leads], "Annulation"), 1);
    assert.equal(countByInscriptionOutcome([...leads], "PVPP"), 1);
    assert.equal(countByInscriptionOutcome([...leads], "Vendu"), 1);
  });
});
