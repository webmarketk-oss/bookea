import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

import type { Lead, LeadActivity } from "../types/lead";

// crm-stats.ts importe via l’alias Next « @/ », inconnu de Node.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  getLeadRdvTakenDates,
  isLeadAcompteReceivedOn,
  isLeadRdvTakenOn,
  isOpenReminderDue,
} = await import("./crm-stats.ts");

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

function activity(
  text: string,
  occurredAt: string,
  partial: Partial<LeadActivity> = {},
): LeadActivity {
  return {
    id: partial.id ?? `a-${occurredAt}`,
    author: "Équipe",
    date: occurredAt.slice(0, 10),
    text,
    type: "status",
    occurredAt,
    ...partial,
  };
}

describe("crm-stats acompte / RDV KPI", () => {
  it("ne compte pas une sortie d’Acompte reçu (Vendu/Devis) comme acompte reçu du jour", () => {
    const receivedOn = "2026-03-10";
    const soldOn = "2026-03-15";

    const sold = lead({
      status: "Vendu",
      activityLog: [
        activity("Statut changé : Acompte envoyé → Acompte reçu.", `${receivedOn}T10:00:00.000Z`),
        activity("Statut changé : Acompte reçu → Vendu.", `${soldOn}T11:00:00.000Z`),
      ],
    });

    assert.equal(isLeadAcompteReceivedOn(sold, soldOn), false);
    assert.equal(isLeadAcompteReceivedOn(sold, receivedOn), true);

    const devis = lead({
      status: "Devis",
      activityLog: [
        activity("Statut changé : Nouveau → Acompte reçu.", `${receivedOn}T10:00:00.000Z`),
        activity("Statut changé : Acompte reçu → Devis.", `${soldOn}T12:00:00.000Z`),
      ],
    });
    assert.equal(isLeadAcompteReceivedOn(devis, soldOn), false);
    assert.equal(isLeadAcompteReceivedOn(devis, receivedOn), true);
  });

  it("ne compte pas Acompte reçu comme une nouvelle prise de RDV", () => {
    const bookedOn = "2026-03-01";
    const acompteOn = "2026-03-12";

    const prospect = lead({
      status: "Acompte reçu",
      activityLog: [
        activity("Statut changé : Nouveau → RDV pris.", `${bookedOn}T10:00:00.000Z`),
        activity("Statut changé : RDV pris → Acompte envoyé.", `${bookedOn}T11:00:00.000Z`),
        activity(
          "Statut changé : Acompte envoyé → Acompte reçu.",
          `${acompteOn}T09:00:00.000Z`,
        ),
      ],
    });

    assert.deepEqual(getLeadRdvTakenDates(prospect), [bookedOn]);
    assert.equal(isLeadRdvTakenOn(prospect, bookedOn), true);
    assert.equal(isLeadRdvTakenOn(prospect, acompteOn), false);
  });

  it("compte encore l’entrée directe dans le tunnel RDV / acompte", () => {
    const day = "2026-04-02";
    const direct = lead({
      status: "Acompte envoyé",
      activityLog: [
        activity("Statut changé : Nouveau → Acompte envoyé.", `${day}T10:00:00.000Z`),
      ],
    });
    assert.equal(isLeadRdvTakenOn(direct, day), true);
  });
});

describe("crm-stats relances dues", () => {
  it("détecte une relance ouverte à date échue", () => {
    assert.equal(
      isOpenReminderDue(
        lead({
          reminderDate: "2020-01-01",
          activityLog: [],
        }),
        "2026-03-15",
      ),
      true,
    );

    assert.equal(
      isOpenReminderDue(
        lead({
          reminderDate: "2026-03-15",
          activityLog: [
            activity("Statut changé : Nouveau → À relancer.", "2026-03-15T12:00:00.000Z"),
          ],
        }),
        "2026-03-15",
      ),
      false,
    );
  });
});
