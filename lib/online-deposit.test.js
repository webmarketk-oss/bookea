const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildHoldNotes,
  checkoutParams,
  directChargeHasNoFee,
  holdExpired,
  onlineQuote,
  paymentOutcome,
  readHold,
  slotTaken,
  verifyPaidSession,
} = require("./online-deposit");
const {
  confirmDeposit,
  emptyState,
  pendingPoints,
  planDepositRefund,
  refundDeposit,
} = require("./loyalty");

const now = new Date("2026-11-27T12:00:00.000Z");

test("deux établissements : chaque acompte est calculé pour son compte", () => {
  const laser = onlineQuote(
    {
      public: {
        services: [
          {
            name: "Laser",
            price: 100,
            depositEnabled: true,
            depositMode: "percent",
            depositPercent: 20,
          },
        ],
      },
    },
    "Laser",
    true,
  );
  const soin = onlineQuote(
    {
      stripe: { accountId: "acct_salon_b", chargesEnabled: true },
      public: {
        services: [
          {
            name: "Soin",
            price: 80,
            depositEnabled: true,
            depositAmount: 15,
          },
        ],
      },
    },
    "Soin",
    true,
  );
  assert.equal(laser.cents, 2000);
  assert.equal(laser.remainingCents, 8000);
  assert.equal(soin.cents, 1500);
  assert.equal(soin.remainingCents, 6500);
  const sessionA = {
    payment_status: "paid",
    currency: "eur",
    amount_total: 2000,
    metadata: { center_id: "center-a", booking_id: "bk-a" },
  };
  assert.equal(
    verifyPaidSession({
      session: sessionA,
      account: "acct_salon_b",
      connectedAccount: "acct_salon_a",
      expected: { cents: 2000, bookingId: "bk-a", centerId: "center-a" },
    }).ok,
    false,
  );
  assert.equal(
    verifyPaidSession({
      session: sessionA,
      account: "acct_salon_a",
      connectedAccount: "acct_salon_a",
      expected: { cents: 2000, bookingId: "bk-a", centerId: "center-a" },
    }).ok,
    true,
  );
});

test("le paiement direct ne prélève pas de commission", () => {
  const params = checkoutParams({
    cents: 1500,
    serviceName: "Soin",
    centerId: "center-b",
    bookingId: "bk-b",
    successUrl: "https://bookeai.fr/ok",
    cancelUrl: "https://bookeai.fr/cancel",
    expiresAt: 1,
  });
  assert.equal(directChargeHasNoFee(params), true);
  assert.equal(params.line_items[0].price_data.unit_amount, 1500);
  assert.equal(params.payment_intent_data.transfer_data, undefined);
});

test("une prestation invisible n’est pas proposée sur la fiche", () => {
  const { serviceHiddenFromPublic } = require("./online-deposit");
  const settings = {
    public: {
      services: [
        { name: "Pause", visible: false, price: 0 },
        { name: "Laser", visible: true, price: 90 },
      ],
    },
  };
  assert.equal(serviceHiddenFromPublic(settings, "Pause"), true);
  assert.equal(serviceHiddenFromPublic(settings, "Laser"), false);
  assert.equal(serviceHiddenFromPublic(settings, "Inconnu"), false);
});

test("un acompte sans compte actif n’ouvre pas le paiement en ligne", () => {
  const quote = onlineQuote(
    {
      public: {
        services: [{ name: "Soin", price: 80, depositEnabled: true, depositAmount: 15 }],
      },
    },
    "Soin",
    false,
  );
  assert.equal(quote.online, false);
  assert.equal(quote.cents, 1500);
});

test("paiement réussi, abandonné, webhook dupliqué, conflit de créneau", () => {
  const notes = buildHoldNotes({
    bookingId: "bk-1",
    depositCents: 2500,
    priceCents: 8900,
    holdUntil: "2026-11-27T12:31:00.000Z",
    payment: "pending",
  });
  assert.equal(readHold(notes).depositCents, 2500);
  assert.equal(holdExpired({ notes, status: "to_confirm" }, now), false);
  assert.equal(
    holdExpired(
      { notes: notes.replace("2026-11-27T12:31:00.000Z", "2026-11-27T11:00:00.000Z"), status: "to_confirm" },
      now,
    ),
    true,
  );

  const rows = [
    {
      id: "hold",
      appointment_date: "2026-11-28",
      starts_at: "14:00",
      ends_at: "15:00",
      status: "to_confirm",
      notes,
    },
  ];
  assert.equal(
    slotTaken(rows, { date: "2026-11-28", start: "14:00", end: "15:00", ignoreId: "other" }, now),
    true,
  );
  assert.equal(
    slotTaken(
      rows.map((row) => ({
        ...row,
        notes: notes.replace("2026-11-27T12:31:00.000Z", "2026-11-27T11:00:00.000Z"),
      })),
      { date: "2026-11-28", start: "14:00", end: "15:00" },
      now,
    ),
    false,
  );
  assert.equal(
    slotTaken(
      [
        ...rows,
        {
          id: "other",
          appointment_date: "2026-11-28",
          starts_at: "14:00",
          ends_at: "15:00",
          status: "confirmed",
          notes: "",
        },
      ],
      { date: "2026-11-28", start: "14:00", end: "15:00", ignoreId: "hold" },
      now,
    ),
    true,
  );

  assert.equal(
    paymentOutcome({ verified: true, alreadyReceived: false, holdExpired: false, slotTakenByOther: false }),
    "confirm",
  );
  assert.equal(
    paymentOutcome({ verified: true, alreadyReceived: true, holdExpired: false, slotTakenByOther: false }),
    "duplicate",
  );
  assert.equal(
    paymentOutcome({ verified: true, alreadyReceived: false, holdExpired: true, slotTakenByOther: true }),
    "conflict",
  );
  assert.equal(paymentOutcome({ verified: false }), "reject");
});

test("remboursement intégral : bonus en attente retiré, bonus déjà crédité corrigé une fois", () => {
  const state = emptyState();
  confirmDeposit(state, {
    sessionId: "cs_1",
    paymentIntentId: "pi_1",
    amountCents: 2000,
    centerId: "center-a",
    clientId: "client-1",
    appointmentId: "apt-1",
  });
  const pendingInput = {
    program: { enabled: true, depositBonus: 5 },
    status: "confirmed",
    deposits: state.deposits,
    events: [],
    appointmentId: "apt-1",
    centerId: "center-a",
  };
  assert.equal(pendingPoints(pendingInput), 5);
  refundDeposit(state, { paymentIntentId: "pi_1", refundedCents: 2000 });
  assert.equal(pendingPoints({ ...pendingInput, deposits: state.deposits }), 0);

  const credited = [
    {
      centerId: "center-a",
      clientId: "client-1",
      appointmentId: "apt-1",
      kind: "deposit",
      points: 5,
      key: "deposit:apt-1:1",
    },
  ];
  const first = planDepositRefund({
    centerId: "center-a",
    clientId: "client-1",
    appointmentId: "apt-1",
    events: credited,
  });
  assert.equal(first.movements.length, 1);
  assert.equal(first.movements[0].points, -5);
  const second = planDepositRefund({
    centerId: "center-a",
    clientId: "client-1",
    appointmentId: "apt-1",
    events: [
      ...credited,
      {
        centerId: "center-a",
        clientId: "client-1",
        appointmentId: "apt-1",
        kind: "deposit_reversal",
        points: -5,
        key: first.movements[0].key,
      },
    ],
  });
  assert.equal(second.movements.length, 0);
});
