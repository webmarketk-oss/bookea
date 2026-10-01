const assert = require("node:assert/strict");
const test = require("node:test");
const { campaignSendAt } = require("./brevo");

test("une campagne SMS 10h à Paris en octobre part à 08h UTC", () => {
  assert.equal(campaignSendAt("2026-10-05", "10:00"), "2026-10-05T08:00:00.000Z");
});

test("une campagne SMS 10h à Paris en janvier part à 09h UTC", () => {
  assert.equal(campaignSendAt("2026-01-15", "10:00"), "2026-01-15T09:00:00.000Z");
});

test("une date ou une heure invalide ne planifie rien", () => {
  assert.equal(campaignSendAt("", "10:00"), "");
  assert.equal(campaignSendAt("2026-10-05", ""), "");
  assert.equal(campaignSendAt("05/10/2026", "10:00"), "");
});
