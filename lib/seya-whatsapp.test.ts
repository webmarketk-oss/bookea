import assert from "node:assert/strict";
import test from "node:test";
import { newTextsFromAuthor } from "./seya-whatsapp.ts";

test("un nouveau message Seya est détecté pour l’envoi WhatsApp", () => {
  const before = [
    { author: "seya", text: "Bonjour" },
    { author: "lead", text: "Oui" },
  ];
  const after = [
    ...before,
    { author: "seya", text: "Je vous propose jeudi 16h30." },
  ];
  assert.deepEqual(newTextsFromAuthor(before, after, "seya"), [
    "Je vous propose jeudi 16h30.",
  ]);
});

test("un texte déjà dans le fil n’est pas renvoyé", () => {
  const messages = [{ author: "seya", text: "Bonjour" }];
  assert.deepEqual(newTextsFromAuthor(messages, messages, "seya"), []);
});
