import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAdminAlert,
  createAdminAlert,
  markAdminAlertInvoiced,
  markAdminAlertRead,
  normalizeAdminAlerts,
} from "./admin-alerts.ts";

test("une alerte SMS reste à facturer et peut être marquée lue", () => {
  const alert = createAdminAlert({
    id: "alert-1",
    kind: "sms_pack",
    title: "JFG a rechargé 30 SMS",
    message: "JFG a rechargé 30 SMS — 1,35 € — à recharger côté opérateur",
    amountEuros: 1.35,
    quantity: 30,
    createdAt: "2026-10-03T10:00:00.000Z",
  });

  const next = appendAdminAlert([], alert);
  assert.equal(next[0]?.billingStatus, "to_invoice");
  assert.equal(next[0]?.readAt, null);

  const read = markAdminAlertRead(next, "alert-1", "2026-10-03T11:00:00.000Z");
  assert.equal(read[0]?.readAt, "2026-10-03T11:00:00.000Z");
});

test("les alertes invalides sont ignorées", () => {
  assert.deepEqual(
    normalizeAdminAlerts([{ kind: "sms_pack", title: "x" }, null]),
    [],
  );
});

test("une souscription facturée reste liée à la facture envoyée", () => {
  const alert = createAdminAlert({
    id: "alert-2",
    kind: "seya_pack",
    title: "JFG a souscrit 200 conversations",
    message: "JFG a souscrit 200 conversations Seya — 129,95 €",
    amountEuros: 129.95,
    quantity: 200,
  });
  const billed = markAdminAlertInvoiced([alert], "alert-2", {
    invoiceId: "inv-9",
    emailedAt: "2026-10-09T18:00:00.000Z",
    emailedTo: "contact@jfg.fr",
  });
  assert.equal(billed[0]?.billingStatus, "invoiced");
  assert.equal(billed[0]?.invoiceId, "inv-9");
  assert.equal(billed[0]?.emailedTo, "contact@jfg.fr");
  assert.equal(billed[0]?.readAt, "2026-10-09T18:00:00.000Z");
});
