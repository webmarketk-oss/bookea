import assert from "node:assert/strict";
import test from "node:test";
import { createAgendaDeskConversation } from "./seya-agenda.ts";
import {
  applyPlanningReply,
  isPlanningProspectTone,
  pickPlanningSlots,
} from "./seya-planning.ts";
import type { SeyaAgentSettings } from "./seya-settings.ts";

const settings = {
  whatsappAgentEnabled: true,
  autoMessageOnNewLead: true,
  seyaMission: "book",
  qualifyOnSignup: true,
  askForAppointment: true,
  bookAppointment: true,
  handoffToHuman: true,
  relanceEnabled: false,
  relanceDays: [1, 5, 14],
  relances: [
    { afterDays: 1, message: "" },
    { afterDays: 5, message: "" },
    { afterDays: 14, message: "" },
  ],
  brief: "Toujours vérifier le planning réel avant de poser un RDV.",
  centerProfile: {
    activity: "",
    extras: "",
    audience: "",
    problem: "",
    differentiation: "",
    promise: "",
    positioning: "",
    supportPhone: "",
    supportEmail: "",
  },
  treatmentBriefs: [
    {
      name: "Cryolipolyse",
      brief: "Bilan 75 min. Pacemaker : ne pas poser.",
      price: "89 € le bilan",
    },
  ],
  offerMaps: [],
} as SeyaAgentSettings;

const slots = [
  { date: "2026-10-08", time: "16:00", label: "jeu. 08/10 à 16h00" },
];

test("Seya Planning ne parle pas comme un prospect WhatsApp", () => {
  const result = applyPlanningReply(
    createAgendaDeskConversation("center-1"),
    "un créneau cryo jeudi",
    settings,
    slots,
  );
  const reply = result.conversation.messages.at(-1)?.text || "";

  assert.equal(result.conversation.messages.at(-2)?.author, "centre");
  assert.match(reply, /16h00|Brief Cryolipolyse/i);
  assert.equal(isPlanningProspectTone(reply), false);
  assert.doesNotMatch(reply, /lequel vous irait|quelle zone|c’est Seya|début ou fin de semaine/i);
});

test("Seya Planning donne le tarif fiche à l’équipe", () => {
  const result = applyPlanningReply(
    createAgendaDeskConversation("center-1"),
    "c’est combien le bilan cryo ?",
    settings,
    [],
  );
  const reply = result.conversation.messages.at(-1)?.text || "";

  assert.match(reply, /89 €/);
  assert.match(reply, /fiche/i);
  assert.doesNotMatch(reply, /je vous propose|lequel vous irait/i);
});

test("Seya Planning pose un RDV seulement si l’équipe le confirme", () => {
  const asked = applyPlanningReply(
    createAgendaDeskConversation("center-1"),
    "créneau jeudi",
    settings,
    slots,
  );
  assert.equal(asked.shouldBook, null);

  const booked = applyPlanningReply(
    asked.conversation,
    "pose 16h pour Marie Dupont",
    settings,
    slots,
  );
  assert.equal(booked.shouldBook?.time, "16:00");
  assert.match(booked.conversation.messages.at(-1)?.text || "", /Marie Dupont/);
});

test("Seya Planning cherche les samedis suivants si le prochain est plein à l’horaire demandé", () => {
  const hours = [
    { weekday: 6, label: "Sam", startTime: "09:00", endTime: "19:00", closed: false },
    { weekday: 1, label: "Lun", startTime: "09:00", endTime: "19:00", closed: false },
  ];
  const now = new Date("2026-10-01T10:00:00");
  const nextSaturdayBusy = [
    { date: "2026-10-03", start: "11:00", duration: 75, status: "Confirmé", cabinId: "c1" },
    { date: "2026-10-03", start: "11:30", duration: 75, status: "Confirmé", cabinId: "c1" },
  ];
  const laterFree = pickPlanningSlots(
    nextSaturdayBusy,
    hours,
    "créneaux samedi entre 11h et midi",
    { now, duration: 75 },
  );

  assert.ok(laterFree.length > 0);
  assert.equal(laterFree.some((slot) => slot.date === "2026-10-03"), false);
  assert.equal(laterFree.every((slot) => slot.date > "2026-10-03"), true);
  assert.equal(
    laterFree.every((slot) => slot.time === "11:00" || slot.time === "11:30"),
    true,
  );
  assert.ok(laterFree.some((slot) => slot.date === "2026-10-10"));
});
