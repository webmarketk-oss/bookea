import assert from "node:assert/strict";
import test from "node:test";
import {
  inboxTag,
  isOngoingSeyaThread,
  sortSeyaInbox,
  type SeyaInboxItem,
} from "./seya-inbox-sort.ts";

function conversation(partial: SeyaInboxItem & { id: string }) {
  return {
    status: "En cours",
    messages: [],
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

test("un fil avec réponse reste En cours, pas Sans réponse", () => {
  const live = conversation({
    id: "live",
    messages: [
      { author: "seya", at: "2026-10-01T10:00:00.000Z" },
      { author: "lead", at: "2026-10-01T10:05:00.000Z" },
    ],
  });
  assert.equal(inboxTag(live), "court");
  assert.equal(isOngoingSeyaThread(live), true);
});

test("les discussions en cours passent devant relances sans réponse et fermées", () => {
  const closed = conversation({
    id: "closed",
    status: "Terminé",
    updatedAt: "2026-10-02T18:00:00.000Z",
    messages: [
      { author: "seya", at: "2026-10-02T17:00:00.000Z" },
      { author: "lead", at: "2026-10-02T18:00:00.000Z" },
    ],
  });
  const waiting = conversation({
    id: "waiting",
    status: "En cours",
    updatedAt: "2026-10-02T19:00:00.000Z",
    messages: [
      { author: "seya", at: "2026-10-02T10:00:00.000Z" },
      { author: "seya", at: "2026-10-02T19:00:00.000Z" },
      { author: "seya", at: "2026-10-02T19:30:00.000Z" },
    ],
  });
  const live = conversation({
    id: "live",
    status: "En cours",
    updatedAt: "2026-10-01T09:00:00.000Z",
    messages: [
      { author: "seya", at: "2026-10-01T08:00:00.000Z" },
      { author: "lead", at: "2026-10-01T09:00:00.000Z" },
    ],
  });

  const sorted = sortSeyaInbox([closed, waiting, live]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["live", "waiting", "closed"],
  );
  assert.equal(isOngoingSeyaThread(waiting), false);
  assert.equal(inboxTag(waiting), "sans_reponse");
});
