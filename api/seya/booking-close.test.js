const test = require("node:test");
const assert = require("node:assert/strict");

const {
  closeConversationsForBooking,
  conversationHasStaffBooking,
  conversationMatchesBookedVisit,
  bookedVisitKeysFromAppointments,
} = require("./booking-close");

test("un RDV CRM ferme la conversation Seya en cours", () => {
  const next = closeConversationsForBooking(
    [
      {
        id: "c1",
        leadId: "lead-1",
        phone: "0612345678",
        status: "En cours",
        proposedSlots: [{ date: "2026-10-06", time: "15:00", label: "lun. 15h" }],
        bookingState: { pendingQuestion: "offer_slots" },
      },
      {
        id: "c2",
        leadId: "lead-2",
        phone: "0699999999",
        status: "En cours",
      },
    ],
    { leadId: "lead-1", phone: "06 12 34 56 78" },
    { date: "2026-10-05", start: "17:30" },
  );

  assert.equal(next[0].status, "RDV confirmé");
  assert.equal(next[0].bookingState.appointmentStatus, "confirmed");
  assert.deepEqual(next[0].proposedSlots, []);
  assert.equal(next[0].bookedSlot.time, "17:30");
  assert.equal(next[1].status, "En cours");
  assert.equal(conversationHasStaffBooking(next[0]), true);
});

test("le matching téléphone ferme aussi un fil sans leadId", () => {
  const next = closeConversationsForBooking(
    [{ id: "c-phone", phone: "+33 6 12 34 56 78", status: "RDV proposé" }],
    { leadId: "lead-1", phone: "0612345678" },
    { date: "2026-10-05", start: "09:00" },
  );
  assert.equal(next[0].status, "RDV confirmé");
});

test("un RDV agenda à venir bloque la relance Seya", () => {
  const keys = bookedVisitKeysFromAppointments([
    {
      lead_id: "lead-1",
      status: "confirmed",
      clients: { phone: "0612345678" },
    },
    {
      lead_id: "lead-2",
      status: "cancelled",
      clients: { phone: "0688888888" },
    },
  ]);
  assert.equal(
    conversationMatchesBookedVisit(
      { leadId: "lead-1", phone: "0600000000", status: "En cours" },
      keys,
    ),
    true,
  );
  assert.equal(
    conversationMatchesBookedVisit(
      { leadId: "other", phone: "0612345678", status: "En cours" },
      keys,
    ),
    true,
  );
  assert.equal(
    conversationMatchesBookedVisit(
      { leadId: "lead-2", phone: "0688888888", status: "En cours" },
      keys,
    ),
    false,
  );
});
