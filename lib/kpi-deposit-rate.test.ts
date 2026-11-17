import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isDepositFunnelStatus,
  validatedDepositRate,
} from "./kpi-deposit-rate.ts";

describe("% acompte validé", () => {
  it("1 acompte reçu / 10 RDV dont 9 en attente = 10 %", () => {
    const leads = [
      { status: "Acompte reçu" },
      ...Array.from({ length: 9 }, () => ({ status: "Acompte en attente" })),
    ];

    assert.equal(validatedDepositRate(leads), 10);
  });

  it("ignore devis, vendu, no-show, annulation et tout statut après acompte reçu", () => {
    const leads = [
      { status: "Acompte reçu" },
      { status: "Acompte en attente" },
      { status: "Devis" },
      { status: "Vendu" },
      { status: "Client converti" },
      { status: "No show" },
      { status: "Annulation" },
      { status: "Nouveau" },
    ];

    assert.equal(validatedDepositRate(leads), 50);
    assert.equal(isDepositFunnelStatus("Devis"), false);
    assert.equal(isDepositFunnelStatus("Vendu"), false);
    assert.equal(isDepositFunnelStatus("No show"), false);
    assert.equal(isDepositFunnelStatus("Annulation"), false);
  });

  it("traite Acompte validé comme Acompte reçu", () => {
    const leads = [
      { status: "Acompte validé" },
      { status: "Acompte envoyé" },
    ];

    assert.equal(validatedDepositRate(leads), 50);
  });

  it("reçu / (reçu + en attente + envoyé), sans les RDV ni les devis", () => {
    const leads = [
      { status: "Acompte reçu" },
      { status: "Acompte en attente" },
      { status: "Acompte envoyé" },
      { status: "Acompte envoyé" },
      { status: "RDV pris" },
      { status: "Devis" },
    ];

    assert.equal(validatedDepositRate(leads), 25);
    assert.equal(isDepositFunnelStatus("RDV pris"), false);
    assert.equal(isDepositFunnelStatus("Acompte envoyé"), true);
  });
});
