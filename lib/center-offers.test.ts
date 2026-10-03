import assert from "node:assert/strict";
import test from "node:test";

import {
  addOneMonth,
  createBookeaPlan,
  formatOfferDate,
  normalizeBookeaPlan,
  seyaOfferFromQuota,
} from "./center-offers.ts";

test("le renouvellement WhatsApp et Bookea avance d’un mois", () => {
  const next = addOneMonth(new Date("2026-10-03T10:00:00.000Z"));
  assert.equal(next.toISOString().slice(0, 10), "2026-11-03");
});

test("une souscription Seya affiche le pack et la date de renouvellement", () => {
  const offer = seyaOfferFromQuota({
    conversationLimit: 200,
    packLeads: 200,
    subscribedAt: "2026-10-03T10:00:00.000Z",
    renewsAt: "2026-11-03T10:00:00.000Z",
    updatedAt: "2026-10-03T10:00:00.000Z",
  });

  assert.equal(offer?.leads, 200);
  assert.equal(offer?.price, 159);
  assert.match(formatOfferDate(offer?.renewsAt), /novembre 2026/i);
});

test("sans pack Seya, il n’y a pas d’offre WhatsApp", () => {
  assert.equal(
    seyaOfferFromQuota({
      conversationLimit: null,
      packLeads: null,
      subscribedAt: null,
      renewsAt: null,
      updatedAt: null,
    }),
    null,
  );
});

test("Bookea CRM + SMS est mensuel", () => {
  const plan = createBookeaPlan(new Date("2026-10-03T10:00:00.000Z"));
  assert.equal(plan.id, "crm-plus");
  assert.equal(plan.price, 49);
  assert.equal(plan.renewsAt.slice(0, 10), "2026-11-03");
  assert.equal(normalizeBookeaPlan({ id: "crm-plus" }), null);
});
