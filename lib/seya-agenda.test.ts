import assert from "node:assert/strict";
import test from "node:test";
import {
  agendaSeyaClientName,
  agendaSeyaSuggestionTexts,
  createAgendaDeskConversation,
  isSeyaAgendaBlockCommand,
  pickFreeCabinId,
  seyaAgendaOccupancyAppointments,
} from "./seya-agenda.ts";
import type { Appointment } from "../types/agenda.ts";

test("une pause ou une fermeture de cabine reste un raccourci planning", () => {
  assert.equal(isSeyaAgendaBlockCommand("pause 14h-15h toutes les cabines"), true);
  assert.equal(isSeyaAgendaBlockCommand("formation cabine 2 demain"), true);
  assert.equal(isSeyaAgendaBlockCommand("cabine 1 indisponible 16h"), true);
  assert.equal(isSeyaAgendaBlockCommand("fermer la cabine 3 toute la journée"), true);
  assert.equal(isSeyaAgendaBlockCommand("supprime la pause de 14h"), true);
});

test("une demande de créneau ou un oui n’est plus transformé en indisponible", () => {
  assert.equal(isSeyaAgendaBlockCommand("un créneau cryo jeudi après-midi"), false);
  assert.equal(isSeyaAgendaBlockCommand("c’est combien le bilan laser ?"), false);
  assert.equal(isSeyaAgendaBlockCommand("16h"), false);
  assert.equal(isSeyaAgendaBlockCommand("oui"), false);
  assert.equal(isSeyaAgendaBlockCommand("bonjour"), false);
  assert.equal(isSeyaAgendaBlockCommand("c’est fermé le dimanche ?"), false);
  assert.equal(isSeyaAgendaBlockCommand("supprime le rdv de Marie"), false);
});

test("Seya Agenda parle au nom de l’équipe du centre actif", () => {
  const conversation = createAgendaDeskConversation("center-1");
  assert.equal(conversation.centerId, "center-1");
  assert.equal(conversation.leadId, "agenda-desk");
  assert.equal(conversation.messages.length, 0);
  assert.equal(agendaSeyaClientName(conversation.firstName, conversation.lastName), "Cliente Seya");
  assert.equal(agendaSeyaClientName("Marie", "Dupont"), "Marie Dupont");
});

test("une pause bloque le créneau envoyé à Seya, et on pose sur une cabine libre", () => {
  const appointments = [
    {
      id: "a",
      personName: "Pause",
      phone: "",
      treatment: "Pause",
      practitionerId: "samantha",
      cabinId: "cabine-1",
      date: "2026-10-15",
      start: "16:00",
      duration: 75,
      status: "Confirmé",
      source: "Seya",
      kind: "Pause",
    },
    {
      id: "b",
      personName: "Marie",
      phone: "",
      treatment: "Cryo",
      practitionerId: "samantha",
      cabinId: "cabine-2",
      date: "2026-10-15",
      start: "16:00",
      duration: 75,
      status: "Confirmé",
      source: "Client",
      kind: "Rendez-vous",
    },
  ] as Appointment[];

  const occupancy = seyaAgendaOccupancyAppointments(appointments);
  assert.equal(occupancy[0]?.kind, "Indisponible");
  assert.equal(
    pickFreeCabinId({
      appointments,
      cabinIds: ["cabine-1", "cabine-2", "cabine-3"],
      date: "2026-10-15",
      start: "16:00",
      duration: 75,
    }),
    "cabine-3",
  );
});

test("les suggestions viennent des vrais créneaux et des RDV à confirmer", () => {
  const suggestions = agendaSeyaSuggestionTexts({
    slots: [{ date: "2026-10-15", time: "16:00", label: "jeu. 15/10 à 16h00" }],
    toConfirm: {
      personName: "Léa",
      date: "2026-10-02",
      start: "10:00",
    },
  });

  assert.equal(suggestions.length, 3);
  assert.match(suggestions[0] ?? "", /Léa/);
  assert.match(suggestions[1] ?? "", /16h00/);
  assert.match(suggestions[2] ?? "", /pause|créneau|tarif/i);
});
