const test = require("node:test");
const assert = require("node:assert/strict");

const {
  appendRenewalNotices,
  dueRenewalNotices,
  expiredAdminAlert,
  nextRenewalPeriod,
  periodConversationCount,
  renewalStage,
} = require("./_renewal");

const conversation = (at) => ({
  id: at,
  messages: [{ id: "m", author: "lead", text: "Bonjour", at }],
  updatedAt: at,
});

test("rappel 3 jours avant, le jour même, puis expiré", () => {
  const renewsAt = "2026-11-10T11:51:00.000Z";
  assert.equal(renewalStage(renewsAt, new Date("2026-11-06T09:00:00Z")), null);
  assert.equal(renewalStage(renewsAt, new Date("2026-11-07T09:00:00Z")), "due_soon");
  assert.equal(renewalStage(renewsAt, new Date("2026-11-10T20:00:00Z")), "due_today");
  assert.equal(renewalStage(renewsAt, new Date("2026-11-11T08:00:00Z")), "expired");
});

test("le quota Seya repart à zéro à chaque période mensuelle", () => {
  const quota = {
    conversationLimit: 100,
    packLeads: 100,
    subscribedAt: "2026-10-10T10:51:00.000Z",
    renewsAt: "2026-11-10T10:51:00.000Z",
  };
  const conversations = [
    conversation("2026-10-01T09:00:00.000Z"),
    conversation("2026-10-12T09:00:00.000Z"),
    conversation("2026-11-12T09:00:00.000Z"),
  ];
  assert.equal(
    periodConversationCount(conversations, quota, new Date("2026-10-20T09:00:00Z")),
    2,
  );

  const renewed = {
    ...quota,
    renewsAt: nextRenewalPeriod(quota.renewsAt, new Date("2026-11-08T09:00:00Z"))
      .renewsAt,
  };
  assert.equal(renewed.renewsAt.slice(0, 10), "2026-12-10");
  assert.equal(
    periodConversationCount(conversations, renewed, new Date("2026-11-09T09:00:00Z")),
    2,
  );
  assert.equal(
    periodConversationCount(conversations, renewed, new Date("2026-11-15T09:00:00Z")),
    1,
  );
});

test("un renouvellement en retard repart du jour du renouvellement", () => {
  const period = nextRenewalPeriod(
    "2026-11-10T10:51:00.000Z",
    new Date("2026-11-15T09:00:00.000Z"),
  );
  assert.equal(period.renewsAt.slice(0, 10), "2026-12-15");
});

test("sans date de renouvellement, on compte tout comme avant", () => {
  const conversations = [conversation("2026-01-01T09:00:00.000Z")];
  assert.equal(periodConversationCount(conversations, { conversationLimit: 5 }), 1);
});

test("chaque rappel ne part qu’une fois par échéance", () => {
  const settings = {
    seyaQuota: {
      conversationLimit: 100,
      packLeads: 100,
      renewsAt: "2026-11-10T10:51:00.000Z",
    },
    bookeaPlan: {
      id: "crm-plus",
      price: 49,
      subscribedAt: "2026-10-20T10:00:00.000Z",
      renewsAt: "2026-11-20T10:00:00.000Z",
    },
    offerHistory: [
      { kind: "seya_pack", quantity: 100, amountEuros: 69.97, subscribedAt: "2026-10-10T10:51:00.000Z" },
    ],
  };
  const now = new Date("2026-11-08T08:00:00Z");
  const due = dueRenewalNotices(settings, now);
  assert.deepEqual(due.map((item) => item.key), ["seya:2026-11-10:due_soon"]);
  assert.equal(due[0].price, 69.97);

  const after = {
    ...settings,
    renewalNotices: appendRenewalNotices([], due.map((item) => item.key)),
  };
  assert.deepEqual(dueRenewalNotices(after, new Date("2026-11-09T08:00:00Z")), []);
  assert.deepEqual(
    dueRenewalNotices(after, new Date("2026-11-10T08:00:00Z")).map((item) => item.key),
    ["seya:2026-11-10:due_today"],
  );
});

test("une échéance dépassée crée une alerte admin « à couper » non facturable", () => {
  const [notice] = dueRenewalNotices(
    {
      seyaQuota: { packLeads: 100, renewsAt: "2026-11-10T10:51:00.000Z" },
    },
    new Date("2026-11-11T08:00:00Z"),
  );
  const alert = expiredAdminAlert({ centerName: "JFG Clinic Clermont-ferrand", offer: notice });
  assert.equal(alert.kind, "pack_expired");
  assert.equal(alert.offer, "seya");
  assert.match(alert.title, /n’a pas renouvelé son pack WhatsApp Seya 100 conversations/);
  assert.match(alert.message, /Coupez Seya/);
});
