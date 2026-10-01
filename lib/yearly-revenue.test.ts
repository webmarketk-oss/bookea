import assert from "node:assert/strict";
import test from "node:test";
import { buildYearlyTtcSeries, invoiceTtcDelta } from "./yearly-revenue.ts";

test("une facture finale compte en TTC, un avoir retranche, un devis non", () => {
  assert.equal(
    invoiceTtcDelta({ type: "Facture finale", status: "Payée", total: 120 }),
    120,
  );
  assert.equal(
    invoiceTtcDelta({ type: "Avoir", status: "Payée", total: 20 }),
    -20,
  );
  assert.equal(
    invoiceTtcDelta({ type: "Devis", status: "Envoyée", total: 80 }),
    0,
  );
});

test("chaque année a sa courbe mensuelle TTC", () => {
  const series = buildYearlyTtcSeries([
    {
      date: "15/03/2025",
      type: "Facture finale",
      status: "Payée",
      total: 200,
    },
    {
      date: "02/03/2026",
      type: "Facture finale",
      status: "Payée",
      total: 350,
    },
    {
      date: "10/03/2026",
      type: "Avoir",
      status: "Payée",
      total: 50,
    },
  ]);

  const year2025 = series.find((row) => row.year === 2025);
  const year2026 = series.find((row) => row.year === 2026);
  assert.equal(year2025?.months[2], 200);
  assert.equal(year2026?.months[2], 300);
});
