import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  amountDue,
  confirmDeposit,
  createLedger,
  movementLabel,
  normalizeProgram,
  pendingPoints,
  progressText,
  redeemReward,
  refundDeposit,
  requestReward,
  syncAppointment,
  transferDeposit,
} from "./loyalty.js";

const centerId = "center-1";
const clientId = "client-1";
const appointmentId = "appt-1";

function program(overrides: Record<string, unknown> = {}) {
  return normalizeProgram({
    enabled: true,
    visitPoints: 20,
    depositBonus: 5,
    noShowPenalty: 15,
    noShowEnabled: false,
    ...overrides,
  });
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    centerId,
    clientId,
    appointmentId,
    program: program(),
    previousStatus: "Confirmé",
    status: "Terminé",
    ...overrides,
  };
}

describe("programme de fidélité", () => {
  it("crédite 20 points seulement quand le salon marque le rendez-vous honoré", () => {
    const state = { events: [], deposits: [], requests: [] };
    const ignored = syncAppointment(state, base({ previousStatus: "Confirmé", status: "Confirmé" }));
    assert.equal(ignored.applied.length, 0);
    assert.equal(ignored.balance, 0);

    const honored = syncAppointment(state, base());
    assert.deepEqual(
      honored.applied.map((event) => event.points),
      [20],
    );
    assert.equal(movementLabel(honored.applied[0]), "Rendez-vous honoré +20");
    assert.equal(honored.balance, 20);
    assert.equal(honored.pending, 0);

    const again = syncAppointment(state, base({ previousStatus: "Terminé", status: "Terminé" }));
    assert.equal(again.applied.length, 0);
    assert.equal(again.balance, 20);
  });

  it("laisse le bonus d’acompte en attente puis le crédite avec la visite", () => {
    const state = { events: [], deposits: [], requests: [] };
    const confirmed = confirmDeposit(state, {
      centerId,
      appointmentId,
      sessionId: "cs_1",
      paymentIntentId: "pi_1",
      amountCents: 2500,
    });
    assert.equal(confirmed.created, true);
    const duplicate = confirmDeposit(state, {
      centerId,
      appointmentId,
      sessionId: "cs_1",
      amountCents: 2500,
    });
    assert.equal(duplicate.created, false);
    assert.equal(state.deposits.length, 1);

    const waiting = syncAppointment(state, base({ status: "Confirmé", previousStatus: "À confirmer" }));
    assert.equal(waiting.applied.length, 0);
    assert.equal(waiting.balance, 0);
    assert.equal(waiting.pending, 5);

    const honored = syncAppointment(state, base());
    assert.deepEqual(
      honored.applied.map((event) => movementLabel(event)),
      ["Rendez-vous honoré +20", "Bonus acompte en ligne +5"],
    );
    assert.equal(honored.balance, 25);
    assert.equal(honored.pending, 0);
    assert.equal(honored.applied[0].scale.visitPoints, 20);
  });

  it("ne crédite pas le bonus si l’acompte est intégralement remboursé avant validation", () => {
    const state = { events: [], deposits: [], requests: [] };
    confirmDeposit(state, {
      centerId,
      appointmentId,
      sessionId: "cs_refund",
      paymentIntentId: "pi_refund",
      amountCents: 2500,
    });
    refundDeposit(state, { paymentIntentId: "pi_refund", refundedCents: 2500 });
    const honored = syncAppointment(state, base());
    assert.deepEqual(
      honored.applied.map((event) => event.kind),
      ["visit"],
    );
    assert.equal(honored.balance, 20);
    assert.equal(
      pendingPoints({
        program: program(),
        status: "Confirmé",
        deposits: state.deposits,
        events: [],
        appointmentId,
      }),
      0,
    );
  });

  it("ne donne ni ne retire de points lors d’un report, et le bonus suit l’acompte transféré", () => {
    const state = { events: [], deposits: [], requests: [] };
    confirmDeposit(state, {
      centerId,
      appointmentId,
      bookingId: "book-1",
      sessionId: "cs_move",
      amountCents: 2000,
    });
    const rescheduled = syncAppointment(
      state,
      base({ previousStatus: "Confirmé", status: "Confirmé" }),
    );
    assert.equal(rescheduled.applied.length, 0);
    assert.equal(rescheduled.pending, 5);

    const moved = transferDeposit(state, {
      bookingId: "book-1",
      toAppointmentId: "appt-final",
    });
    assert.equal(moved.moved, true);
    assert.equal(
      pendingPoints({
        program: program(),
        status: "Confirmé",
        deposits: state.deposits,
        events: state.events,
        appointmentId,
      }),
      0,
    );
    assert.equal(
      pendingPoints({
        program: program(),
        status: "Confirmé",
        deposits: state.deposits,
        events: state.events,
        appointmentId: "appt-final",
      }),
      5,
    );

    const honored = syncAppointment(
      state,
      base({ appointmentId: "appt-final", previousStatus: "Confirmé", status: "Terminé" }),
    );
    assert.equal(honored.balance, 25);
  });

  it("retire au plus le solde disponible sur un no-show, ici 8 points", () => {
    const state = { events: [], deposits: [], requests: [] };
    state.events.push({
      id: "seed",
      centerId,
      clientId,
      appointmentId: "older",
      key: "visit:older:1",
      kind: "visit",
      points: 8,
      reason: "Rendez-vous honoré",
      scale: { visitPoints: 8 },
      at: "2026-01-01T00:00:00.000Z",
    });
    const result = syncAppointment(
      state,
      base({
        previousStatus: "Confirmé",
        status: "No show",
        program: program({ noShowEnabled: true }),
      }),
    );
    const penalty = result.applied.find((event) => event.kind === "no_show");
    assert.equal(penalty?.points, -8);
    assert.equal(movementLabel(penalty), "Rendez-vous non honoré −8");
    assert.equal(result.balance, 0);
  });

  it("restaure exactement le retrait puis crédite la visite une seule fois", () => {
    const state = { events: [], deposits: [], requests: [] };
    state.events.push({
      id: "seed",
      centerId,
      clientId,
      appointmentId: "older",
      key: "visit:older:1",
      kind: "visit",
      points: 8,
      reason: "Rendez-vous honoré",
      scale: { visitPoints: 8 },
      at: "2026-01-01T00:00:00.000Z",
    });
    confirmDeposit(state, {
      centerId,
      appointmentId,
      sessionId: "cs_fix",
      amountCents: 1000,
    });
    syncAppointment(
      state,
      base({
        previousStatus: "Confirmé",
        status: "No show",
        program: program({ noShowEnabled: true }),
      }),
    );
    assert.equal(state.events.some((event) => event.kind === "no_show" && event.points === -8), true);

    const corrected = syncAppointment(
      state,
      base({
        previousStatus: "No show",
        status: "Terminé",
        program: program({ noShowEnabled: true, visitPoints: 30 }),
      }),
    );
    assert.deepEqual(
      corrected.applied.map((event) => [event.kind, event.points]),
      [
        ["no_show_restore", 8],
        ["visit", 30],
        ["deposit", 5],
      ],
    );
    assert.equal(corrected.balance, 8 + 30 + 5);

    const replay = syncAppointment(
      state,
      base({
        previousStatus: "Terminé",
        status: "Terminé",
        program: program({ visitPoints: 30 }),
      }),
    );
    assert.equal(replay.applied.length, 0);
  });

  it("annule les gains puis signale une récompense déjà utilisée", () => {
    const state = { events: [], deposits: [], requests: [] };
    syncAppointment(state, base({ program: program({ visitPoints: 100 }) }));
    const requested = requestReward(state, {
      ...base(),
      rewardId: "r100",
      servicePrice: 40,
      status: "Confirmé",
    });
    assert.equal(requested.ok, true);
    const used = redeemReward(state, {
      requestId: requested.request.id,
      program: program(),
      status: "Confirmé",
      servicePrice: 40,
      depositPaid: 0,
    });
    assert.equal(used.ok, true);
    assert.equal(used.balance, 0);
    assert.equal(movementLabel(used.applied[0]), "Récompense utilisée −100");

    const reversed = syncAppointment(
      state,
      base({
        previousStatus: "Terminé",
        status: "No show",
        program: program({ visitPoints: 100, noShowEnabled: true }),
      }),
    );
    assert.equal(reversed.manualReview.length > 0, true);
    assert.equal(
      reversed.applied.some((event) => event.kind === "manual_review"),
      true,
    );
    assert.equal(reversed.balance, 0);
    assert.equal(state.requests[0].status, "used");
  });

  it("clôture la demande sans débiter si le rendez-vous est annulé avant usage", () => {
    const state = { events: [], deposits: [], requests: [] };
    state.events.push({
      id: "seed",
      centerId,
      clientId,
      appointmentId: "older",
      key: "visit:older:1",
      kind: "visit",
      points: 100,
      reason: "Rendez-vous honoré",
      scale: {},
      at: "2026-01-01T00:00:00.000Z",
    });
    requestReward(state, {
      centerId,
      clientId,
      appointmentId,
      program: program(),
      rewardId: "r100",
      servicePrice: 40,
      status: "Confirmé",
    });
    const cancelled = syncAppointment(
      state,
      base({ previousStatus: "Confirmé", status: "Annulation" }),
    );
    assert.equal(cancelled.applied.length, 0);
    assert.equal(cancelled.closed, 1);
    assert.equal(state.requests[0].status, "closed");
    assert.equal(cancelled.balance, 100);
  });

  it("revérifie le solde à l’encaissement et calcule le reste à régler sans rembourser l’acompte", () => {
    const priced = amountDue({ servicePrice: 50, discountEur: 5, depositPaid: 20 });
    assert.equal(priced.discounted, 45);
    assert.equal(priced.due, 25);
    assert.equal(priced.refund, 0);
    const covered = amountDue({ servicePrice: 20, discountEur: 12, depositPaid: 20 });
    assert.equal(covered.due, 0);
    assert.equal(covered.refund, 0);

    const state = { events: [], deposits: [], requests: [] };
    state.events.push({
      id: "seed",
      centerId,
      clientId,
      appointmentId: "older",
      key: "visit:older:1",
      kind: "visit",
      points: 100,
      reason: "Rendez-vous honoré",
      scale: {},
      at: "2026-01-01T00:00:00.000Z",
    });
    const requested = requestReward(state, {
      centerId,
      clientId,
      appointmentId,
      program: program(),
      rewardId: "r100",
      servicePrice: 40,
      status: "Confirmé",
    });
    state.events.push({
      id: "spend-elsewhere",
      centerId,
      clientId,
      appointmentId: "other",
      key: "reward:other",
      kind: "reward",
      points: -100,
      reason: "Récompense utilisée",
      scale: {},
      at: "2026-02-01T00:00:00.000Z",
    });
    const refused = redeemReward(state, {
      requestId: requested.request.id,
      program: program(),
      status: "Confirmé",
      servicePrice: 40,
      depositPaid: 20,
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.error, "insufficient_points");
    assert.equal(state.requests[0].status, "requested");
  });

  it("ne laisse passer qu’une des deux utilisations simultanées", async () => {
    const ledger = createLedger();
    ledger.state.events.push({
      id: "seed",
      centerId,
      clientId,
      appointmentId: "older",
      key: "visit:older:1",
      kind: "visit",
      points: 100,
      reason: "Rendez-vous honoré",
      scale: {},
      at: "2026-01-01T00:00:00.000Z",
    });
    const requested = await ledger.run((state) =>
      requestReward(state, {
        centerId,
        clientId,
        appointmentId,
        program: program(),
        rewardId: "r100",
        servicePrice: 40,
        status: "Confirmé",
      }),
    );
    const [first, second] = await Promise.all([
      ledger.run((state) =>
        redeemReward(state, {
          requestId: requested.request.id,
          program: program(),
          status: "Confirmé",
          servicePrice: 40,
          depositPaid: 0,
        }),
      ),
      ledger.run((state) =>
        redeemReward(state, {
          requestId: requested.request.id,
          program: program(),
          status: "Confirmé",
          servicePrice: 40,
          depositPaid: 0,
        }),
      ),
    ]);
    const results = [first, second];
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => result.error === "already_used").length, 1);
    assert.equal(
      ledger.state.events.filter((event) => event.kind === "reward").length,
      1,
    );
    assert.equal(
      ledger.state.events
        .filter((event) => event.clientId === clientId)
        .reduce((sum, event) => sum + event.points, 0),
      0,
    );
  });

  it("ne crédite pas deux fois deux confirmations simultanées", async () => {
    const ledger = createLedger();
    const [first, second] = await Promise.all([
      ledger.run((state) => syncAppointment(state, base())),
      ledger.run((state) => syncAppointment(state, base())),
    ]);
    assert.equal(first.applied.length + second.applied.length, 1);
    assert.equal(
      ledger.state.events.filter((event) => event.kind === "visit").length,
      1,
    );
    assert.equal(first.balance === 20 || second.balance === 20, true);
  });

  it("ne recalcule pas un mouvement quand le barème change et n’active rien sur l’historique", () => {
    const state = { events: [], deposits: [], requests: [] };
    const earned = syncAppointment(state, base());
    assert.equal(earned.applied[0].scale.visitPoints, 20);
    const changed = program({ visitPoints: 40, noShowEnabled: true });
    const replay = syncAppointment(
      state,
      base({ previousStatus: "Terminé", status: "Terminé", program: changed }),
    );
    assert.equal(replay.applied.length, 0);
    assert.equal(state.events[0].points, 20);
    assert.equal(state.events[0].scale.visitPoints, 20);
    assert.equal(progressText(75, changed.rewards), "75 / 100 points · Plus que 25 points pour obtenir 5 €");
  });

  it("laisse le retrait no-show désactivé par défaut", () => {
    const state = { events: [], deposits: [], requests: [] };
    state.events.push({
      id: "seed",
      centerId,
      clientId,
      appointmentId: "older",
      key: "visit:older:1",
      kind: "visit",
      points: 20,
      reason: "Rendez-vous honoré",
      scale: {},
      at: "2026-01-01T00:00:00.000Z",
    });
    const result = syncAppointment(
      state,
      base({ previousStatus: "Confirmé", status: "Pas venu pas prévenu" }),
    );
    assert.equal(result.applied.length, 0);
    assert.equal(result.balance, 20);
    assert.equal(program().noShowEnabled, false);
  });
});
