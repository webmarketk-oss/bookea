import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACOMPTE_RELANCE_EVENT,
  ACOMPTE_SUIVI_EVENT,
  fromDatetimeLocalValue,
  isDepositManagedLead,
  matchesDepositPhaseFilter,
  parseDepositReminderNotes,
  parseDepositReminders,
  parseDepositTracked,
  toDatetimeLocalValue,
} from "./crm-deposit.ts";
import type { Lead } from "../types/lead.ts";

function lead(partial: Partial<Lead>): Lead {
  return {
    id: "lead-1",
    firstName: "A",
    lastName: "B",
    phone: "",
    email: "",
    treatment: "Soin",
    source: "Facebook",
    campaign: "",
    status: "Nouveau",
    dealAmount: 0,
    commercial: "Équipe",
    createdAt: "",
    createdDate: "2026-01-01",
    nextAction: "À contacter",
    activityLog: [],
    ...partial,
  };
}

describe("crm-deposit", () => {
  it("inclut les acomptes envoyés / reçus / en attente et le suivi marqué", () => {
    assert.equal(
      isDepositManagedLead(lead({ status: "Acompte envoyé" })),
      true,
    );
    assert.equal(
      isDepositManagedLead(lead({ status: "Acompte reçu" })),
      true,
    );
    assert.equal(
      isDepositManagedLead(lead({ status: "Acompte en attente" })),
      true,
    );
    assert.equal(
      isDepositManagedLead(lead({ status: "Vendu", depositTracked: true })),
      true,
    );
    assert.equal(isDepositManagedLead(lead({ status: "Nouveau" })), false);
  });

  it("filtre en attente vs reçus via les statuts existants", () => {
    const pending = lead({ status: "Acompte envoyé" });
    const waiting = lead({ status: "Acompte en attente" });
    const received = lead({ status: "Acompte reçu" });

    assert.equal(matchesDepositPhaseFilter(pending, "En attente"), true);
    assert.equal(matchesDepositPhaseFilter(waiting, "En attente"), true);
    assert.equal(matchesDepositPhaseFilter(received, "En attente"), false);
    assert.equal(matchesDepositPhaseFilter(received, "Reçus"), true);
    assert.equal(matchesDepositPhaseFilter(pending, "Reçus"), false);
    assert.equal(matchesDepositPhaseFilter(pending, "Tous"), true);
  });

  it("lit la dernière date/heure de chaque relance acompte", () => {
    const reminders = parseDepositReminders([
      {
        event_type: ACOMPTE_RELANCE_EVENT,
        from_value: "1",
        to_value: "2026-03-01T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
      },
      {
        event_type: ACOMPTE_RELANCE_EVENT,
        from_value: "1",
        to_value: "2026-03-02T11:30:00.000Z",
        created_at: "2026-03-02T10:00:00.000Z",
      },
      {
        event_type: ACOMPTE_RELANCE_EVENT,
        from_value: "3",
        to_value: "2026-03-05T08:15:00.000Z",
        created_at: "2026-03-05T07:00:00.000Z",
      },
      {
        event_type: "comment",
        from_value: null,
        to_value: null,
        created_at: "2026-03-06T00:00:00.000Z",
      },
    ]);

    assert.equal(reminders[1], "2026-03-02T11:30:00.000Z");
    assert.equal(reminders[2], "");
    assert.equal(reminders[3], "2026-03-05T08:15:00.000Z");
    assert.equal(reminders[4], "");
  });

  it("lit le commentaire de la dernière relance et ignore l’ancienne note automatique", () => {
    const events = [
      {
        event_type: ACOMPTE_RELANCE_EVENT,
        from_value: "1",
        to_value: "2026-03-01T10:00:00.000Z",
        note: "Relance acompte 1 : 2026-03-01T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
      },
      {
        event_type: ACOMPTE_RELANCE_EVENT,
        from_value: "1",
        to_value: "2026-03-02T11:30:00.000Z",
        note: "Rappeler après 18h, elle est au travail",
        created_at: "2026-03-02T10:00:00.000Z",
      },
      {
        event_type: ACOMPTE_RELANCE_EVENT,
        from_value: "2",
        to_value: "2026-03-04T09:00:00.000Z",
        note: "Relance acompte 2 effacée.",
        created_at: "2026-03-04T08:00:00.000Z",
      },
    ];
    const notes = parseDepositReminderNotes(events);
    assert.equal(notes[1], "Rappeler après 18h, elle est au travail");
    assert.equal(notes[2], "");
    assert.equal(parseDepositReminders(events)[1], "2026-03-02T11:30:00.000Z");
  });

  it("détecte le marqueur de suivi acompte", () => {
    assert.equal(parseDepositTracked([]), false);
    assert.equal(
      parseDepositTracked([
        {
          event_type: ACOMPTE_SUIVI_EVENT,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ]),
      true,
    );
  });

  it("convertit datetime-local ↔ ISO sans perdre la valeur", () => {
    const local = "2026-04-15T14:30";
    const iso = fromDatetimeLocalValue(local);
    assert.ok(iso.includes("2026"));
    assert.equal(toDatetimeLocalValue(iso), local);
    assert.equal(fromDatetimeLocalValue(""), "");
    assert.equal(toDatetimeLocalValue(""), "");
  });
});
