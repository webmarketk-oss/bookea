import assert from "node:assert/strict";
import test from "node:test";

import {
  addOneMonth,
  appendOfferHistory,
  createBookeaPlan,
  createOfferHistoryItem,
  formatOfferDate,
  mergeOfferHistory,
  normalizeBookeaPlan,
  seyaOfferFromQuota,
  withCurrentOffersInHistory,
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

test("l’historique garde toutes les souscriptions, les plus récentes en haut", () => {
  const first = createOfferHistoryItem({
    id: "wa-1",
    kind: "seya_pack",
    label: "WhatsApp 100 leads",
    amountEuros: 79,
    quantity: 100,
    subscribedAt: "2026-09-01T10:00:00.000Z",
    renewsAt: "2026-10-01T10:00:00.000Z",
  });
  const second = createOfferHistoryItem({
    id: "sms-1",
    kind: "sms_pack",
    label: "30 SMS",
    amountEuros: 1.35,
    quantity: 30,
    subscribedAt: "2026-10-03T10:00:00.000Z",
    renewsAt: null,
  });

  const history = appendOfferHistory(appendOfferHistory([], first), second);
  assert.equal(history[0]?.id, "sms-1");
  assert.equal(history[1]?.id, "wa-1");
  assert.equal(history.length, 2);

  const merged = mergeOfferHistory(history, [
    {
      id: "sms-1",
      kind: "sms_pack",
      title: "JFG a rechargé 30 SMS",
      message: "JFG a rechargé 30 SMS",
      amountEuros: 1.35,
      quantity: 30,
      createdAt: "2026-10-03T10:00:00.000Z",
    },
  ]);
  assert.equal(merged.length, 2);
});

test("l’offre actuelle entre dans l’historique sans doublon", () => {
  const alerts = [
    {
      id: "alert-wa",
      kind: "seya_pack",
      title: "JFG a souscrit 100 conversations Seya",
      message: "JFG a souscrit 100 conversations Seya — 79 €",
      amountEuros: 79,
      quantity: 100,
      createdAt: "2026-10-01T09:00:00.000Z",
    },
  ];
  const history = withCurrentOffersInHistory(mergeOfferHistory([], alerts), {
    whatsapp: {
      leads: 100,
      price: 79,
      subscribedAt: "2026-10-01T09:00:00.000Z",
      renewsAt: "2026-11-01T09:00:00.000Z",
    },
    bookea: null,
  });

  assert.equal(history.length, 1);
  assert.equal(history[0]?.label, "WhatsApp 100 leads");
  assert.match(formatOfferDate(history[0]?.renewsAt), /novembre 2026/i);
});
