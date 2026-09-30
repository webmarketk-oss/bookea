import assert from "node:assert/strict";
import test from "node:test";
import {
  leadStatusAfterAgendaBooking,
  shouldMarkLeadAsBooked,
} from "./appointment-lead-status.ts";

test("un RDV posé au téléphone depuis le CRM passe en RDV confirmé", () => {
  assert.equal(leadStatusAfterAgendaBooking("Prospect", "Nouveau"), "RDV confirmé");
  assert.equal(leadStatusAfterAgendaBooking("Client", "À relancer"), "RDV confirmé");
  assert.equal(leadStatusAfterAgendaBooking("Organique", "En réflexion"), "RDV confirmé");
});

test("un RDV posé par Seya reste RDV pris", () => {
  assert.equal(leadStatusAfterAgendaBooking("Seya", "Nouveau"), "RDV pris");
  assert.equal(leadStatusAfterAgendaBooking("seya", "Message WhatsApp envoyé"), "RDV pris");
});

test("un lead déjà vendu ou confirmé n’est pas reculé", () => {
  assert.equal(shouldMarkLeadAsBooked("Vendu"), false);
  assert.equal(leadStatusAfterAgendaBooking("Prospect", "RDV confirmé"), "RDV confirmé");
  assert.equal(leadStatusAfterAgendaBooking("Prospect", "Vendu"), "Vendu");
});
