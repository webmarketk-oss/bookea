import assert from "node:assert/strict";
import test from "node:test";
import {
  agendaBlockTitle,
  applyPositionedAppointmentStatus,
  belongsOnClientFiche,
  dbStatusWhenSlotPositioned,
  isHiddenAgendaBlockClient,
  statusWhenAppointmentPositioned,
  stripAgendaBlockClientIdentity,
  withAgendaBlockIdentity,
} from "./appointment-position-status.ts";

function hoursFromNow(hours: number) {
  const when = new Date();
  when.setTime(when.getTime() + hours * 60 * 60 * 1000);
  const date = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, "0"),
    String(when.getDate()).padStart(2, "0"),
  ].join("-");
  const start = [
    String(when.getHours()).padStart(2, "0"),
    String(when.getMinutes()).padStart(2, "0"),
  ].join(":");
  return { date, start };
}

test("un RDV laser à plus de 48h passe en Confirmé même en Prospect", () => {
  const slot = hoursFromNow(72);
  const next = applyPositionedAppointmentStatus({
    kind: "Rendez-vous" as const,
    date: slot.date,
    start: slot.start,
    status: "À confirmer" as const,
    source: "Prospect",
  });

  assert.equal(statusWhenAppointmentPositioned(slot.date, slot.start), "Confirmé");
  assert.equal(next.status, "Confirmé");
  assert.equal(dbStatusWhenSlotPositioned(slot.date, slot.start), "confirmed");
});

test("un RDV cryo dans moins de 48h reste À confirmer", () => {
  const slot = hoursFromNow(12);
  const next = applyPositionedAppointmentStatus({
    kind: "Rendez-vous" as const,
    date: slot.date,
    start: slot.start,
    status: "Confirmé" as const,
    source: "Client",
  });

  assert.equal(next.status, "À confirmer");
  assert.equal(dbStatusWhenSlotPositioned(slot.date, slot.start), "to_confirm");
});

test("une pause n’affiche pas À confirmer", () => {
  const slot = hoursFromNow(12);
  const next = applyPositionedAppointmentStatus({
    kind: "Pause" as const,
    date: slot.date,
    start: slot.start,
    status: "À confirmer" as const,
  });

  assert.equal(next.status, "Confirmé");
});

test("une formation reconnue par le soin n’est pas un RDV à confirmer", () => {
  const slot = hoursFromNow(12);
  const next = applyPositionedAppointmentStatus({
    date: slot.date,
    start: slot.start,
    status: "À confirmer" as const,
    treatment: "Formation",
  });

  assert.equal(next.status, "Confirmé");
  assert.equal(next.kind, "Formation");
});

test("une pause n’affiche pas Bookea derrière le nom", () => {
  assert.equal(agendaBlockTitle("Pause", "Pause", "Pause Bookea"), "Pause");
  assert.equal(
    agendaBlockTitle(undefined, "Indisponible", "Indisponible Bookea"),
    "Indisponible",
  );
});

test("un bloc Indisponible ne s’affiche pas comme Pause", () => {
  assert.equal(
    agendaBlockTitle("Indisponible", "Pause", "Pause"),
    "Indisponible",
  );
  assert.equal(
    agendaBlockTitle(undefined, "Pause", "Indisponible Bookea"),
    "Indisponible",
  );
  assert.equal(
    agendaBlockTitle(undefined, "Pause", "Pause", "[kind:Indisponible]"),
    "Indisponible",
  );

  const next = withAgendaBlockIdentity({
    kind: "Indisponible" as const,
    treatment: "Pause",
    personName: "Pause",
  });
  assert.equal(next.kind, "Indisponible");
  assert.equal(next.treatment, "Indisponible");
  assert.equal(next.personName, "Indisponible");
});

test("une pause n’apparaît pas sur la fiche client", () => {
  assert.equal(
    belongsOnClientFiche({
      kind: "Pause",
      treatment: "Pause",
      personName: "Pause",
    }),
    false,
  );
  assert.equal(
    belongsOnClientFiche({
      kind: "Rendez-vous",
      treatment: "Laser",
      personName: "Marie Dupont",
    }),
    true,
  );
});

test("une fiche Pause sans contact est cachée du CRM", () => {
  assert.equal(
    isHiddenAgendaBlockClient({
      firstName: "Pause",
      lastName: "",
      phone: "",
      email: "",
    }),
    true,
  );
  assert.equal(
    isHiddenAgendaBlockClient({
      firstName: "Marie",
      lastName: "Dupont",
      phone: "0612345678",
    }),
    false,
  );
  assert.equal(
    isHiddenAgendaBlockClient({
      firstName: "Agenda",
      lastName: "Interne",
      privateNote: "[agenda-block] Planning",
    }),
    true,
  );
});

test("une pause ne garde pas l’identité d’une cliente", () => {
  const next = stripAgendaBlockClientIdentity({
    kind: "Pause" as const,
    treatment: "Pause",
    personName: "Pause",
    clientId: "client-1",
    phone: "0612345678",
    email: "marie@test.fr",
    birthDate: "1990-01-01",
  });

  assert.equal(next.clientId, undefined);
  assert.equal(next.phone, "");
  assert.equal(next.email, undefined);
  assert.equal(next.birthDate, undefined);
});
