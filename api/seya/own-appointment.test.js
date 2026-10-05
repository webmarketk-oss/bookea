const test = require("node:test");
const assert = require("node:assert/strict");
const { findOwnSeyaAppointment } = require("./own-appointment");

const booked = {
  bookedSlot: { date: "2026-10-08", time: "11:30", label: "jeu. 08/10 à 11h30" },
};

test("décale le RDV déjà posé à 11h30, pas un autre du même lead", () => {
  const own = findOwnSeyaAppointment(
    [
      {
        id: "later",
        lead_id: "lead-1",
        appointment_date: "2026-10-15",
        starts_at: "10:00:00",
        status: "confirmed",
      },
      {
        id: "current",
        lead_id: "lead-1",
        appointment_date: "2026-10-08",
        starts_at: "11:30:00",
        notes: "RDV Seya WhatsApp · minceur",
        status: "confirmed",
      },
    ],
    { leadId: "lead-1" },
    booked,
  );
  assert.equal(own?.id, "current");
});

test("retrouve le 11h30 même sans lead_id, via le créneau déjà confirmé", () => {
  const own = findOwnSeyaAppointment(
    [
      {
        id: "current",
        lead_id: null,
        appointment_date: "2026-10-08T00:00:00.000Z",
        starts_at: "11:30:00",
        notes: "RDV Seya WhatsApp",
        status: "to_confirm",
      },
    ],
    { leadId: "lead-1" },
    booked,
  );
  assert.equal(own?.id, "current");
});

test("ignore un RDV annulé sur le même horaire", () => {
  const own = findOwnSeyaAppointment(
    [
      {
        id: "cancelled",
        lead_id: "lead-1",
        appointment_date: "2026-10-08",
        starts_at: "11:30",
        status: "cancelled",
      },
      {
        id: "current",
        lead_id: "lead-1",
        appointment_date: "2026-10-08",
        starts_at: "11:30",
        status: "confirmed",
      },
    ],
    { leadId: "lead-1" },
    booked,
  );
  assert.equal(own?.id, "current");
});
