import assert from "node:assert/strict";
import test from "node:test";
import type { CenterDayHours } from "./center-hours.ts";
import {
  buildRequestedSlots,
  slotWindowLabel,
} from "./requested-slots.ts";
import type { Appointment } from "../types/agenda.ts";

const hours: CenterDayHours[] = [
  {
    weekday: 1,
    label: "Lun",
    startTime: "10:00",
    endTime: "18:00",
    closed: false,
  },
  {
    weekday: 0,
    label: "Dim",
    startTime: "08:00",
    endTime: "19:00",
    closed: true,
  },
];

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    date: "2026-10-05",
    start: "10:30",
    duration: 60,
    cabinId: "cabine-1",
    practitionerId: "p1",
    personName: "Léa",
    phone: "0611223344",
    treatment: "Laser",
    status: "Confirmé",
    source: "Client",
    kind: "Rendez-vous",
    ...overrides,
  };
}

test("le créneau suit l’ouverture du centre, pas 08h", () => {
  assert.equal(slotWindowLabel(hours[0], "10:30"), "Lun 10h-12h");
  assert.equal(slotWindowLabel(hours[0], "16:15"), "Lun 16h-18h");
  assert.equal(slotWindowLabel(hours[0], "09:00"), "");
});

test("un RDV hors horaires ou un jour fermé n’apparaît pas", () => {
  const rows = buildRequestedSlots(
    [
      appointment({ start: "09:00" }),
      appointment({ date: "2026-10-04", start: "11:00" }),
      appointment({ start: "11:15" }),
    ],
    hours,
  );

  assert.deepEqual(
    rows.map((row) => row.slot),
    ["Lun 10h-12h"],
  );
  assert.equal(rows[0].bookings, 1);
});
