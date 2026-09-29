import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyClientBalanceDueIndex,
  getPaymentTone,
  invoicePaymentAmounts,
  type PaymentTone,
} from "./payment-tone.ts";

test("un devis laser compte pour le rouge orange vert", () => {
  const amounts = invoicePaymentAmounts({
    type: "devis",
    status: "sent",
    total_ttc: 900,
    paid_amount: 0,
    balance_due: 900,
  });

  assert.deepEqual(amounts, { paid: 0, due: 900 });
});

test("un acompte partiel reste orange même si le clientId ne match pas", () => {
  const index = emptyClientBalanceDueIndex();
  index.tonesByPhone.set("612345678", "partial");
  index.tonesByClientId.set("cryo-id", "paid");

  const tone = getPaymentTone(index, {
    clientId: "unknown-laser-id",
    personName: "Marie Laser",
    phone: "06 12 34 56 78",
  });

  assert.equal(tone, "partial" satisfies PaymentTone);
});

test("un avoir ne colore pas le RDV", () => {
  assert.equal(
    invoicePaymentAmounts({
      type: "avoir",
      status: "paid",
      total_ttc: 100,
      paid_amount: 100,
      balance_due: 0,
    }),
    null,
  );
});
