/** Barème, mouvements et récompenses. Le solde est la somme du journal. */

const DEFAULT_REWARDS = [
  { id: "r100", points: 100, discountEur: 5, minServiceEur: 30 },
  { id: "r200", points: 200, discountEur: 12, minServiceEur: 60 },
];

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function defaultProgram() {
  return {
    enabled: false,
    visitPoints: 20,
    depositBonus: 5,
    noShowPenalty: 15,
    noShowEnabled: false,
    rewards: DEFAULT_REWARDS.map((reward) => ({ ...reward })),
  };
}

function normalizeReward(raw, index) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const points = clampInt(raw.points, 0, 1, 100000);
  const discountEur = roundMoney(raw.discountEur);
  const minServiceEur = roundMoney(raw.minServiceEur);
  if (points <= 0 || discountEur <= 0 || minServiceEur < 0) {
    return null;
  }
  const id = String(raw.id || `r${points}-${index}`).trim().slice(0, 40);
  return { id, points, discountEur, minServiceEur };
}

function normalizeProgram(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rewards = Array.isArray(source.rewards)
    ? source.rewards
        .map((reward, index) => normalizeReward(reward, index))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return {
    enabled: source.enabled === true,
    visitPoints: clampInt(source.visitPoints, 20, 0, 500),
    depositBonus: clampInt(source.depositBonus, 5, 0, 200),
    noShowPenalty: clampInt(source.noShowPenalty, 15, 0, 200),
    noShowEnabled: source.noShowEnabled === true,
    rewards: rewards.length ? rewards : defaultProgram().rewards,
  };
}

function canonicalStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["termine", "done", "vendu", "devis vendu", "sold", "present"].includes(value)) {
    return "honored";
  }
  if (["no show", "no-show", "no_show", "pas venu pas prevenu"].includes(value)) {
    return "no_show";
  }
  if (["annulation", "cancelled", "canceled", "annule"].includes(value)) {
    return "cancelled";
  }
  return "open";
}

function scaleOf(program) {
  return {
    visitPoints: program.visitPoints,
    depositBonus: program.depositBonus,
    noShowPenalty: program.noShowPenalty,
    noShowEnabled: program.noShowEnabled,
  };
}

function emptyState() {
  return { events: [], deposits: [], requests: [] };
}

function createLedger() {
  const state = emptyState();
  let chain = Promise.resolve();
  return {
    state,
    run(fn) {
      const job = chain.then(() => fn(state));
      chain = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
  };
}

function balanceOf(state, centerId, clientId) {
  return state.events
    .filter((event) => event.centerId === centerId && event.clientId === clientId)
    .reduce((sum, event) => sum + event.points, 0);
}

function nets(events, appointmentId) {
  const rows = events.filter((event) => event.appointmentId === appointmentId);
  const sum = (kinds) =>
    rows
      .filter((event) => kinds.includes(event.kind))
      .reduce((total, event) => total + event.points, 0);
  return {
    visit: sum(["visit", "visit_reversal"]),
    deposit: sum(["deposit", "deposit_reversal"]),
    noShow: sum(["no_show", "no_show_restore"]),
  };
}

function countKind(events, appointmentId, kind) {
  return events.filter(
    (event) => event.appointmentId === appointmentId && event.kind === kind,
  ).length;
}

function eligibleDeposit(deposits, appointmentId) {
  return (deposits || []).some(
    (row) => row.appointmentId === appointmentId && depositEligible(row),
  );
}

function depositEligible(row) {
  if (!row || row.confirmed !== true) {
    return false;
  }
  const amount = Number(row.amountCents) || 0;
  const refunded = Number(row.refundedCents) || 0;
  return amount > 0 && refunded < amount;
}

function movement(partial) {
  return {
    centerId: partial.centerId,
    clientId: partial.clientId,
    appointmentId: partial.appointmentId,
    key: partial.key,
    kind: partial.kind,
    points: partial.points,
    reason: partial.reason,
    clamp: partial.clamp === true,
    scale: partial.scale || {},
  };
}

function planStatusChange(input) {
  const program = normalizeProgram(input.program);
  const previous = canonicalStatus(input.previousStatus);
  const next = canonicalStatus(input.status);
  const appointmentId = input.appointmentId;
  const events = input.events || [];
  const current = nets(events, appointmentId);

  if (previous === next) {
    return { movements: [], closeReward: false, manualReview: "" };
  }

  if (next === "cancelled") {
    return { movements: [], closeReward: true, manualReview: "" };
  }

  if (next === "open") {
    return { movements: [], closeReward: false, manualReview: "" };
  }

  const movements = [];
  let manualReview = "";
  const scale = scaleOf(program);

  if (next === "honored") {
    if (current.noShow < 0) {
      movements.push(
        movement({
          ...input,
          key: `noshow-restore:${appointmentId}:${countKind(events, appointmentId, "no_show_restore") + 1}`,
          kind: "no_show_restore",
          points: -current.noShow,
          reason: "Correction : points restitués",
          scale,
        }),
      );
    }
    if (program.enabled && current.visit <= 0) {
      movements.push(
        movement({
          ...input,
          key: `visit:${appointmentId}:${countKind(events, appointmentId, "visit") + 1}`,
          kind: "visit",
          points: program.visitPoints,
          reason: "Rendez-vous honoré",
          scale,
        }),
      );
    }
    if (
      program.enabled &&
      program.depositBonus > 0 &&
      current.deposit <= 0 &&
      eligibleDeposit(input.deposits, appointmentId)
    ) {
      movements.push(
        movement({
          ...input,
          key: `deposit:${appointmentId}:${countKind(events, appointmentId, "deposit") + 1}`,
          kind: "deposit",
          points: program.depositBonus,
          reason: "Bonus acompte en ligne",
          scale,
        }),
      );
    }
    return { movements: movements.filter((row) => row.points !== 0), closeReward: false, manualReview };
  }

  if (next === "no_show") {
    const gain = Math.max(0, current.visit) + Math.max(0, current.deposit);
    let remaining = Math.min(gain, Math.max(0, balanceOf({ events }, input.centerId, input.clientId)));
    const visitTake = Math.min(Math.max(0, current.visit), remaining);
    remaining -= visitTake;
    const depositTake = Math.min(Math.max(0, current.deposit), remaining);
    if (visitTake > 0) {
      movements.push(
        movement({
          ...input,
          key: `visit-reversal:${appointmentId}:${countKind(events, appointmentId, "visit_reversal") + 1}`,
          kind: "visit_reversal",
          points: -visitTake,
          reason: "Correction : gain retiré",
          scale,
        }),
      );
    }
    if (depositTake > 0) {
      movements.push(
        movement({
          ...input,
          key: `deposit-reversal:${appointmentId}:${countKind(events, appointmentId, "deposit_reversal") + 1}`,
          kind: "deposit_reversal",
          points: -depositTake,
          reason: "Correction : bonus retiré",
          scale,
        }),
      );
    }
    const rewardUsed = events.some(
      (event) =>
        event.centerId === input.centerId &&
        event.clientId === input.clientId &&
        event.kind === "reward",
    );
    if (visitTake + depositTake < gain && rewardUsed) {
      manualReview =
        "Une récompense a déjà été utilisée avec ces points. À traiter manuellement.";
      movements.push(
        movement({
          ...input,
          key: `manual:${appointmentId}:${countKind(events, appointmentId, "manual_review") + 1}`,
          kind: "manual_review",
          points: 0,
          reason: manualReview,
          scale,
        }),
      );
    }
    if (program.enabled && program.noShowEnabled && program.noShowPenalty > 0 && current.noShow === 0) {
      movements.push(
        movement({
          ...input,
          key: `noshow:${appointmentId}:${countKind(events, appointmentId, "no_show") + 1}`,
          kind: "no_show",
          points: -program.noShowPenalty,
          reason: "Rendez-vous non honoré",
          clamp: true,
          scale,
        }),
      );
    }
    return { movements, closeReward: true, manualReview };
  }

  return { movements: [], closeReward: false, manualReview: "" };
}

function applyMovements(state, movements) {
  const applied = [];
  for (const planned of movements) {
    if (
      state.events.some(
        (event) => event.centerId === planned.centerId && event.key === planned.key,
      )
    ) {
      continue;
    }
    let points = planned.points;
    if (planned.clamp && points < 0) {
      const balance = balanceOf(state, planned.centerId, planned.clientId);
      if (balance + points < 0) {
        points = -balance;
      }
    }
    if (points === 0 && planned.kind !== "manual_review") {
      continue;
    }
    const event = {
      id: `evt-${state.events.length + 1}`,
      centerId: planned.centerId,
      clientId: planned.clientId,
      appointmentId: planned.appointmentId,
      key: planned.key,
      kind: planned.kind,
      points,
      reason: planned.reason,
      scale: planned.scale || {},
      at: planned.at || new Date().toISOString(),
    };
    state.events.push(event);
    applied.push(event);
  }
  return applied;
}

function closeRequestedReward(state, appointmentId) {
  let closed = 0;
  for (const request of state.requests) {
    if (request.appointmentId === appointmentId && request.status === "requested") {
      request.status = "closed";
      closed += 1;
    }
  }
  return closed;
}

function syncAppointment(state, input) {
  const plan = planStatusChange({
    ...input,
    events: state.events,
    deposits: state.deposits,
  });
  const applied = applyMovements(state, plan.movements);
  const closed = plan.closeReward ? closeRequestedReward(state, input.appointmentId) : 0;
  return {
    applied,
    closed,
    manualReview: plan.manualReview,
    balance: balanceOf(state, input.centerId, input.clientId),
    pending: pendingPoints({
      program: input.program,
      status: input.status,
      deposits: state.deposits,
      events: state.events,
      appointmentId: input.appointmentId,
      centerId: input.centerId,
    }),
  };
}

function pendingPoints(input) {
  const program = normalizeProgram(input.program);
  if (!program.enabled || canonicalStatus(input.status) !== "open") {
    return 0;
  }
  if (!eligibleDeposit(input.deposits, input.appointmentId)) {
    return 0;
  }
  if (nets(input.events || [], input.appointmentId).deposit > 0) {
    return 0;
  }
  return program.depositBonus;
}

function confirmDeposit(state, input) {
  const sessionId = String(input.sessionId || "").trim();
  if (!sessionId) {
    return { ok: false, error: "missing_session" };
  }
  const existing = state.deposits.find((row) => row.sessionId === sessionId);
  if (existing) {
    return { ok: true, created: false, deposit: existing };
  }
  const deposit = {
    id: input.id || `dep-${state.deposits.length + 1}`,
    centerId: input.centerId,
    clientId: input.clientId || "",
    appointmentId: input.appointmentId || "",
    bookingId: String(input.bookingId || ""),
    sessionId,
    paymentIntentId: String(input.paymentIntentId || ""),
    amountCents: Math.max(0, Math.round(Number(input.amountCents) || 0)),
    refundedCents: 0,
    confirmed: true,
  };
  state.deposits.push(deposit);
  return { ok: true, created: true, deposit };
}

function planDepositRefund(input) {
  const events = input.events || [];
  const appointmentId = input.appointmentId;
  const current = nets(events, appointmentId);
  if (current.deposit <= 0) {
    return { movements: [], manualReview: false };
  }
  const available = Math.max(0, balanceOf({ events }, input.centerId, input.clientId));
  const take = Math.min(current.deposit, available);
  const rewardUsed = events.some(
    (event) =>
      event.appointmentId === appointmentId && event.kind === "reward",
  );
  if (take <= 0) {
    return { movements: [], manualReview: rewardUsed };
  }
  return {
    movements: [
      movement({
        centerId: input.centerId,
        clientId: input.clientId,
        appointmentId,
        key: `deposit-reversal:${appointmentId}:${countKind(events, appointmentId, "deposit_reversal") + 1}`,
        kind: "deposit_reversal",
        points: -take,
        reason: "Correction : bonus retiré",
        clamp: true,
        scale: input.scale || {},
      }),
    ],
    manualReview: take < current.deposit && rewardUsed,
  };
}

function refundDeposit(state, input) {
  const paymentIntentId = String(input.paymentIntentId || "");
  const deposit =
    state.deposits.find((row) => row.paymentIntentId === paymentIntentId) ||
    state.deposits.find((row) => row.sessionId === input.sessionId);
  if (!deposit) {
    return { ok: false, error: "deposit_not_found" };
  }
  const refunded = Math.max(0, Math.round(Number(input.refundedCents) || 0));
  deposit.refundedCents = Math.min(deposit.amountCents, Math.max(deposit.refundedCents, refunded));
  return { ok: true, deposit };
}

function transferDeposit(state, input) {
  const deposit = state.deposits.find(
    (row) =>
      row.id === input.depositId ||
      (input.bookingId && row.bookingId === input.bookingId),
  );
  if (!deposit) {
    return { ok: false, error: "deposit_not_found" };
  }
  if (!input.toAppointmentId || deposit.appointmentId === input.toAppointmentId) {
    return { ok: true, moved: false, deposit };
  }
  deposit.appointmentId = input.toAppointmentId;
  return { ok: true, moved: true, deposit };
}

function progressText(balance, rewards) {
  const next = [...(rewards || [])]
    .filter((reward) => reward.points > balance)
    .sort((a, b) => a.points - b.points)[0];
  if (!next) {
    return rewards?.length
      ? "Toutes les récompenses sont atteintes"
      : "Aucune récompense configurée";
  }
  const left = next.points - balance;
  return `${balance} / ${next.points} points · Plus que ${left} points pour obtenir ${next.discountEur} €`;
}

function noShowRuleText(program) {
  const normalized = normalizeProgram(program);
  if (!normalized.enabled || !normalized.noShowEnabled || normalized.noShowPenalty <= 0) {
    return "";
  }
  return `Un rendez-vous non honoré retire ${normalized.noShowPenalty} points. Le solde ne descend pas sous zéro.`;
}

function formatPoints(points) {
  if (points > 0) {
    return `+${points}`;
  }
  if (points < 0) {
    return `−${Math.abs(points)}`;
  }
  return "0";
}

function movementLabel(event) {
  const titles = {
    visit: "Rendez-vous honoré",
    deposit: "Bonus acompte en ligne",
    no_show: "Rendez-vous non honoré",
    no_show_restore: "Correction : points restitués",
    visit_reversal: "Correction : gain retiré",
    deposit_reversal: "Correction : bonus retiré",
    reward: "Récompense utilisée",
    manual_review: "À traiter manuellement",
  };
  const title = titles[event.kind] || event.reason || "Mouvement";
  if (event.kind === "manual_review") {
    return title;
  }
  return `${title} ${formatPoints(event.points)}`;
}

function amountDue(input) {
  const price = Math.max(0, roundMoney(input.servicePrice));
  const discount = Math.max(0, roundMoney(input.discountEur));
  const deposit = Math.max(0, roundMoney(input.depositPaid));
  const discounted = Math.max(0, roundMoney(price - discount));
  return {
    discounted,
    due: Math.max(0, roundMoney(discounted - deposit)),
    refund: 0,
  };
}

function findReward(program, rewardId) {
  return normalizeProgram(program).rewards.find((reward) => reward.id === rewardId) || null;
}

function requestReward(state, input) {
  const program = normalizeProgram(input.program);
  if (!program.enabled) {
    return { ok: false, error: "program_disabled" };
  }
  if (canonicalStatus(input.status) !== "open") {
    return { ok: false, error: "appointment_not_eligible" };
  }
  const reward = findReward(program, input.rewardId);
  if (!reward) {
    return { ok: false, error: "unknown_reward" };
  }
  const balance = balanceOf(state, input.centerId, input.clientId);
  if (balance < reward.points) {
    return { ok: false, error: "insufficient_points" };
  }
  if (roundMoney(input.servicePrice) < reward.minServiceEur) {
    return { ok: false, error: "service_too_small" };
  }
  const existing = state.requests.find(
    (row) =>
      row.appointmentId === input.appointmentId &&
      (row.status === "requested" || row.status === "used"),
  );
  if (existing) {
    return { ok: false, error: "already_requested", request: existing };
  }
  const request = {
    id: input.id || `req-${state.requests.length + 1}`,
    centerId: input.centerId,
    clientId: input.clientId,
    appointmentId: input.appointmentId,
    rewardId: reward.id,
    points: reward.points,
    discountEur: reward.discountEur,
    minServiceEur: reward.minServiceEur,
    status: "requested",
  };
  state.requests.push(request);
  return { ok: true, request };
}

function redeemReward(state, input) {
  const request = state.requests.find((row) => row.id === input.requestId);
  if (!request) {
    return { ok: false, error: "request_not_found" };
  }
  if (request.status !== "requested") {
    return { ok: false, error: "already_used" };
  }
  if (canonicalStatus(input.status) === "cancelled" || canonicalStatus(input.status) === "no_show") {
    request.status = "closed";
    return { ok: false, error: "appointment_closed" };
  }
  const program = normalizeProgram(input.program);
  if (!program.enabled) {
    return { ok: false, error: "program_disabled" };
  }
  const balance = balanceOf(state, request.centerId, request.clientId);
  if (balance < request.points) {
    return { ok: false, error: "insufficient_points" };
  }
  const servicePrice = roundMoney(input.servicePrice);
  if (servicePrice < request.minServiceEur) {
    return { ok: false, error: "service_too_small" };
  }
  const usedOnAppointment = state.events.some(
    (event) => event.appointmentId === request.appointmentId && event.kind === "reward",
  );
  if (usedOnAppointment) {
    request.status = "used";
    return { ok: false, error: "already_used" };
  }
  request.status = "used";
  const applied = applyMovements(state, [
    movement({
      centerId: request.centerId,
      clientId: request.clientId,
      appointmentId: request.appointmentId,
      key: `reward:${request.id}`,
      kind: "reward",
      points: -request.points,
      reason: "Récompense utilisée",
      scale: {
        ...scaleOf(program),
        rewardId: request.rewardId,
        discountEur: request.discountEur,
        minServiceEur: request.minServiceEur,
      },
    }),
  ]);
  const due = amountDue({
    servicePrice,
    discountEur: request.discountEur,
    depositPaid: input.depositPaid,
  });
  return {
    ok: true,
    request,
    applied,
    ...due,
    balance: balanceOf(state, request.centerId, request.clientId),
  };
}

module.exports = {
  amountDue,
  applyMovements,
  balanceOf,
  canonicalStatus,
  closeRequestedReward,
  confirmDeposit,
  createLedger,
  defaultProgram,
  depositEligible,
  emptyState,
  formatPoints,
  movementLabel,
  noShowRuleText,
  normalizeProgram,
  pendingPoints,
  planDepositRefund,
  planStatusChange,
  progressText,
  redeemReward,
  refundDeposit,
  requestReward,
  syncAppointment,
  transferDeposit,
};
