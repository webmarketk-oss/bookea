const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.BREVO_API_KEY;

const {
  sendCallbackHandoff,
  teamHandoffRetryDue,
  withTeamHandoffResult,
} = require("./center-notify");
const { shouldSkipRelance } = require("./relance");

const NOW = new Date("2026-10-14T10:00:00Z");

function handedOff() {
  return {
    id: "c1",
    status: "À recontacter",
    qualification: { need: "minceur" },
    bookingState: { pendingQuestion: "callback" },
    teamNotes: { family: "minceur", need: "ventre", tried: "non", handedOffAt: NOW.toISOString() },
    messages: [{ author: "lead", text: "non", at: NOW.toISOString() }],
  };
}

test("Transmission envoyée : statut « À recontacter »", () => {
  const next = withTeamHandoffResult(handedOff(), { sent: true }, NOW);
  assert.equal(next.status, "À recontacter");
  assert.equal(next.teamHandoff.status, "sent");
  assert.equal(next.teamHandoff.attempts, 1);
});

test("Transmission en échec : pas « À recontacter », erreur visible", () => {
  const next = withTeamHandoffResult(
    handedOff(),
    { sent: false, reason: "send_failed", results: [{ error: "Brevo 500" }] },
    NOW,
  );
  assert.equal(next.status, "Qualifié");
  assert.equal(next.teamHandoff.status, "failed");
  assert.match(next.teamHandoff.error, /L’envoi du mail a échoué \(Brevo 500\)/);
  assert.equal(next.teamHandoff.lastAttemptAt, NOW.toISOString());
});

test("Centre sans email : échec signalé, nouvelle tentative possible", async () => {
  const next = await sendCallbackHandoff({
    center: { id: "x", name: "Centre test", email: "" },
    seya: {},
    conversation: handedOff(),
    now: NOW,
  });
  assert.notEqual(next.status, "À recontacter");
  assert.equal(next.teamHandoff.status, "failed");
  assert.ok(next.teamHandoff.error);
});

test("Nouvelle tentative toutes les 10 minutes, puis « À recontacter » une fois envoyé", () => {
  const failed = withTeamHandoffResult(handedOff(), { sent: false, reason: "no_email" }, NOW);
  assert.equal(teamHandoffRetryDue(failed, new Date(NOW.getTime() + 5 * 60 * 1000)), false);
  assert.equal(teamHandoffRetryDue(failed, new Date(NOW.getTime() + 10 * 60 * 1000)), true);
  const retried = withTeamHandoffResult(failed, { sent: true }, new Date(NOW.getTime() + 10 * 60 * 1000));
  assert.equal(retried.status, "À recontacter");
  assert.equal(retried.teamHandoff.attempts, 2);
  assert.equal(teamHandoffRetryDue(retried, new Date(NOW.getTime() + 60 * 60 * 1000)), false);
});

test("Transmission en échec : pas de relance du prospect", () => {
  const failed = withTeamHandoffResult(handedOff(), { sent: false, reason: "no_email" }, NOW);
  assert.equal(shouldSkipRelance(failed), true);
});
