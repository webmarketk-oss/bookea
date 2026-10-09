const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSameSeyaConversation,
  mergeSeyaConversationLists,
  persistableConversations,
} = require("./conversation-key");

test("un fil WhatsApp sans leadId reste fusionné par le téléphone", () => {
  const remote = [
    {
      phone: "0611223344",
      firstName: "Camille",
      messages: [
        { author: "seya", text: "Bonjour", at: "2026-09-20T10:00:00.000Z" },
        { author: "lead", text: "Oui", at: "2026-09-20T10:01:00.000Z" },
      ],
    },
  ];
  const local = [];
  const merged = mergeSeyaConversationLists(remote, local);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].phone, "0611223344");
});

test("un fil slug et un fil UUID du même numéro ne font qu’une conversation", () => {
  const bySlug = {
    id: "lead-1",
    leadId: "lead-1",
    phone: "0611223344",
    centerId: "center-clermont",
    messages: [{ author: "seya", text: "hello", at: "2026-09-20T10:00:00.000Z" }],
  };
  const byPhone = {
    phone: "33611223344",
    centerId: "center-clermont",
    messages: [
      { author: "seya", text: "hello", at: "2026-09-20T10:00:00.000Z" },
      { author: "lead", text: "prix", at: "2026-09-21T10:00:00.000Z" },
    ],
  };
  const merged = mergeSeyaConversationLists([bySlug], [byPhone]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].leadId, "lead-1");
  assert.equal(merged[0].messages.length, 2);
  assert.equal(isSameSeyaConversation(bySlug, byPhone), true);
});

test("le même numéro chez deux centres ne fusionne pas", () => {
  const clermont = {
    phone: "0612455675",
    centerId: "center-clermont",
    firstName: "Claudine",
    messages: [{ author: "lead", text: "bonjour", at: "2026-10-09T10:00:00.000Z" }],
  };
  const gaillard = {
    phone: "33612455675",
    centerId: "center-gaillard",
    firstName: "Claudine",
    messages: [{ author: "seya", text: "Gaillard", at: "2026-10-09T11:00:00.000Z" }],
  };
  const merged = mergeSeyaConversationLists([clermont], [gaillard]);
  assert.equal(merged.length, 2);
});

test("les ouvertures auto n’évincient pas un WhatsApp en attente de réponse", () => {
  const waiting = {
    phone: "0611223344",
    messages: [
      { author: "seya", text: "Bonjour, c’est Seya", at: "2026-09-10T12:00:00.000Z" },
    ],
    updatedAt: "2026-09-10T12:00:00.000Z",
  };
  const synthetics = Array.from({ length: 90 }, (_, index) => ({
    leadId: `new-${index}`,
    messages: [
      {
        author: "seya",
        text: "ouverture",
        at: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  }));
  const kept = persistableConversations([...synthetics, waiting]);
  assert.ok(kept.some((item) => item.phone === "0611223344"));
});

test("un message plus récent n’efface pas un RDV déjà confirmé", () => {
  const booked = {
    leadId: "lead-1",
    phone: "0611223344",
    status: "RDV confirmé",
    bookedSlot: { date: "2026-10-05", time: "17:30" },
    bookingState: { appointmentStatus: "confirmed", lastOfferedSlots: [] },
    messages: [
      {
        author: "seya",
        text: "Parfait, votre rendez-vous est confirmé",
        at: "2026-09-30T14:00:00.000Z",
      },
    ],
    updatedAt: "2026-09-30T14:00:00.000Z",
  };
  const laterThanks = {
    leadId: "lead-1",
    phone: "0611223344",
    status: "Qualifié",
    bookingState: { pendingQuestion: "offer_slots" },
    messages: [
      {
        author: "seya",
        text: "Parfait, votre rendez-vous est confirmé",
        at: "2026-09-30T14:00:00.000Z",
      },
      { author: "lead", text: "Merci à bientôt", at: "2026-09-30T14:02:00.000Z" },
    ],
    updatedAt: "2026-09-30T14:02:00.000Z",
  };
  const merged = mergeSeyaConversationLists([booked], [laterThanks]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "RDV confirmé");
  assert.equal(merged[0].bookedSlot.time, "17:30");
  assert.equal(merged[0].bookingState.appointmentStatus, "confirmed");
  assert.equal(merged[0].messages.length, 2);
});
