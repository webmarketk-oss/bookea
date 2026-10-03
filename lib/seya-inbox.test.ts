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

test("un refus ferme la conversation même si le statut dit Qualifié ou RDV", () => {
  const declined = conversation({
    id: "declined",
    status: "Qualifié",
    messages: [
      { author: "seya", text: "Bonjour, je suis Seya.", at: "2026-10-03T09:00:00.000Z" },
      {
        author: "lead",
        text: "Désolé je ne donne pas suite cordialement",
        at: "2026-10-03T10:00:00.000Z",
      },
      {
        author: "seya",
        text: "D’accord, je comprends. Si vous changez d’avis, n’hésitez pas.",
        at: "2026-10-03T10:02:00.000Z",
      },
    ],
  });
  const staleRdv = conversation({
    id: "stale-rdv",
    status: "RDV pris",
    bookedSlot: { label: "Jeudi 15h" },
    messages: [
      { author: "lead", text: "Je ne suis pas intéressée", at: "2026-10-03T11:00:00.000Z" },
    ],
  });

  assert.equal(inboxTag(declined), "ferme");
  assert.equal(inboxTag(staleRdv), "ferme");
  assert.equal(isOngoingSeyaThread(declined), false);
});

test("Qualifié, chaud et vrai RDV gardent leur pastille", () => {
  assert.equal(
    inboxTag(
      conversation({
        status: "Qualifié",
        messages: [{ author: "lead", text: "Le visage", at: "2026-10-03T09:00:00.000Z" }],
      }),
    ),
    "qualifie",
  );
  assert.equal(
    inboxTag(
      conversation({
        status: "Chaud",
        messages: [{ author: "lead", text: "Oui je veux un RDV", at: "2026-10-03T09:00:00.000Z" }],
      }),
    ),
    "chaud",
  );
  assert.equal(
    inboxTag(
      conversation({
        status: "RDV confirmé",
        bookedSlot: { label: "Vendredi 10h" },
        messages: [{ author: "lead", text: "Oui jeudi 15h", at: "2026-10-03T09:00:00.000Z" }],
      }),
    ),
    "rdv",
  );
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

  const sorted = sortSeyaInbox(
    [closed, waiting, live],
    Date.parse("2026-10-02T20:00:00.000Z"),
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["live", "waiting", "closed"],
  );
  assert.equal(isOngoingSeyaThread(waiting), false);
  assert.equal(inboxTag(waiting), "sans_reponse");
});

test("les messages des 48 h, les fils en cours et les chauds restent en haut", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");
  const notInterested = conversation({
    id: "not-interested",
    status: "Pas intéressé",
    updatedAt: "2026-10-03T11:50:00.000Z",
    messages: [
      { author: "seya", at: "2026-10-03T11:40:00.000Z" },
      { author: "lead", at: "2026-10-03T11:50:00.000Z" },
    ],
  });
  const recentWaiting = conversation({
    id: "recent-waiting",
    status: "En cours",
    updatedAt: "2026-10-03T10:00:00.000Z",
    messages: [{ author: "seya", at: "2026-10-03T10:00:00.000Z" }],
  });
  const recentHot = conversation({
    id: "recent-hot",
    status: "Chaud",
    updatedAt: "2026-10-03T09:00:00.000Z",
    messages: [
      { author: "seya", at: "2026-10-03T08:00:00.000Z" },
      { author: "lead", at: "2026-10-03T09:00:00.000Z" },
    ],
  });
  const olderLive = conversation({
    id: "older-live",
    status: "En cours",
    updatedAt: "2026-09-28T09:00:00.000Z",
    messages: [
      { author: "seya", at: "2026-09-28T08:00:00.000Z" },
      { author: "lead", at: "2026-09-28T09:00:00.000Z" },
    ],
  });
  const olderClosed = conversation({
    id: "older-closed",
    status: "Terminé",
    updatedAt: "2026-09-20T09:00:00.000Z",
    messages: [
      { author: "seya", at: "2026-09-20T08:00:00.000Z" },
      { author: "lead", at: "2026-09-20T09:00:00.000Z" },
    ],
  });

  const sorted = sortSeyaInbox(
    [olderClosed, notInterested, olderLive, recentWaiting, recentHot],
    now,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["recent-hot", "recent-waiting", "older-live", "not-interested", "older-closed"],
  );
});
