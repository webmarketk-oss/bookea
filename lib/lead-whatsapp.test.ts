import assert from "node:assert/strict";
import test from "node:test";

import { leadWhatsAppSummaries, threadWhatsAppMessages } from "./lead-whatsapp.ts";

const lead = { id: "lead-1", phone: "06 11 22 33 44" };

test("statut d’envoi enregistré par message : un échec n’est jamais « envoyé »", () => {
  const messages = threadWhatsAppMessages({
    leadId: "lead-1",
    messages: [
      { id: "1", author: "seya", text: "Bonjour", at: "2026-10-14T08:00:00Z", delivery: "sent" },
      { id: "2", author: "lead", text: "Oui ?", at: "2026-10-14T08:05:00Z" },
      { id: "3", author: "seya", text: "Je vous propose jeudi", at: "2026-10-14T08:06:00Z", delivery: "failed" },
    ],
  });
  assert.deepEqual(
    messages.map((item) => item.delivery),
    ["sent", "received", "failed"],
  );

  const summary = leadWhatsAppSummaries([lead], [
    {
      leadId: "lead-1",
      messages: [
        { id: "1", author: "seya", text: "Bonjour", at: "2026-10-14T08:00:00Z", delivery: "sent" },
        { id: "3", author: "seya", text: "Je vous propose jeudi", at: "2026-10-14T08:06:00Z", delivery: "failed" },
      ],
    },
  ]).get("lead-1");
  assert.equal(summary?.lastSent?.text, "Bonjour");
  assert.equal(summary?.lastAttempt?.delivery, "failed");
});

test("ancien message sans statut : l’erreur du fil le marque en échec, pas les plus anciens", () => {
  const messages = threadWhatsAppMessages({
    sendError: "Seya n’a pas pu envoyer sa réponse WhatsApp.",
    messages: [
      { id: "1", author: "seya", text: "Bonjour", at: "2026-10-14T08:00:00Z" },
      { id: "2", author: "lead", text: "Photo", at: "2026-10-14T08:05:00Z" },
      { id: "3", author: "seya", text: "Je ne peux pas lire ce fichier", at: "2026-10-14T08:06:00Z" },
    ],
  });
  assert.deepEqual(
    messages.map((item) => item.delivery),
    ["sent", "received", "failed"],
  );
});

test("échec de génération : l’ancien message envoyé reste envoyé", () => {
  const messages = threadWhatsAppMessages({
    sendError: "Seya n’a pas pu répondre.",
    messages: [
      { id: "1", author: "seya", text: "Bonjour", at: "2026-10-14T08:00:00Z" },
      { id: "2", author: "lead", text: "Combien ?", at: "2026-10-14T08:05:00Z" },
    ],
  });
  assert.equal(messages[0].delivery, "sent");
});

test("premier message programmé : en attente, pas envoyé", () => {
  const messages = threadWhatsAppMessages({
    status: "À envoyer",
    messages: [{ id: "1", author: "seya", text: "Bonjour Inès", at: "2026-10-14T08:00:00Z" }],
  });
  assert.equal(messages[0].delivery, "pending");
});

test("messages de l’équipe inclus, note interne exclue", () => {
  const summary = leadWhatsAppSummaries([lead], [
    {
      phone: "+33611223344",
      messages: [
        { id: "1", author: "centre", text: "Bonjour, ici le centre", at: "2026-10-14T09:00:00Z" },
        {
          id: "2",
          author: "centre",
          text: "Vérification santé faite. Seya peut reprendre la conversation.",
          at: "2026-10-14T09:10:00Z",
        },
      ],
    },
  ]).get("lead-1");
  assert.equal(summary?.messages.length, 1);
  assert.equal(summary?.lastSent?.from, "equipe");
});

test("un fil rattaché à une autre fiche du centre ne s’affiche pas ici", () => {
  const summaries = leadWhatsAppSummaries(
    [lead, { id: "lead-2", phone: "06 11 22 33 44" }],
    [
      {
        leadId: "lead-2",
        phone: "0611223344",
        messages: [{ id: "1", author: "seya", text: "Bonjour", at: "2026-10-14T08:00:00Z" }],
      },
    ],
  );
  assert.equal(summaries.get("lead-1"), undefined);
  assert.equal(summaries.get("lead-2")?.messages.length, 1);
});
