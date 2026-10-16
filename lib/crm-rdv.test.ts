import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareBookedLeads,
  displayVisitDate,
  isEverBookedLead,
  parseVisitDate,
  RDV_DATE_EVENT,
} from "./crm-rdv.ts";
import type { Lead } from "../types/lead.ts";

function lead(partial: Partial<Lead>): Lead {
  return {
    id: "lead-1",
    firstName: "Laura",
    lastName: "Marie",
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

describe("crm-rdv", () => {
  it("retient la dernière date de RDV saisie", () => {
    const date = parseVisitDate([
      {
        event_type: RDV_DATE_EVENT,
        to_value: "2026-04-01",
        created_at: "2026-03-01T10:00:00.000Z",
      },
      {
        event_type: RDV_DATE_EVENT,
        to_value: "2026-05-12",
        created_at: "2026-03-02T10:00:00.000Z",
      },
      {
        event_type: "status",
        to_value: "RDV pris",
        created_at: "2026-03-03T10:00:00.000Z",
      },
    ]);
    assert.equal(date, "2026-05-12");
  });

  it("affiche la date saisie avant celle de l’agenda", () => {
    const booked = lead({
      visitDate: "2026-06-02",
      appointments: [{ id: "a", bookedOn: "2026-05-01", date: "2026-05-20" }],
    });
    assert.equal(displayVisitDate(booked), "2026-06-02");
    assert.equal(
      displayVisitDate(
        lead({
          appointments: [
            { id: "a", bookedOn: "2026-01-01", date: "2020-01-01" },
            { id: "b", bookedOn: "2026-01-02", date: "2099-03-01" },
          ],
        }),
      ),
      "2099-03-01",
    );
  });

  it("garde un rendez-vous pris même si le statut a changé ensuite", () => {
    assert.equal(
      isEverBookedLead(
        lead({
          status: "Vendu",
          activityLog: [
            {
              id: "e1",
              author: "Équipe",
              date: "01/03/2026",
              text: "Statut changé : Nouveau → RDV pris.",
              type: "status",
              occurredAt: "2026-03-01T10:00:00.000Z",
            },
          ],
        }),
      ),
      true,
    );
    assert.equal(isEverBookedLead(lead({ status: "Nouveau" })), false);
  });

  it("met les dates manquantes en premier, sans limite de mois", () => {
    const missing = lead({ id: "1", status: "RDV pris", lastName: "A" });
    const older = lead({
      id: "2",
      status: "Vendu",
      visitDate: "2024-02-01",
      lastName: "B",
    });
    const newer = lead({
      id: "3",
      status: "RDV pris",
      visitDate: "2026-11-01",
      lastName: "C",
    });
    const sorted = [newer, older, missing].sort(compareBookedLeads);
    assert.deepEqual(
      sorted.map((item) => item.id),
      ["1", "2", "3"],
    );
  });
});
