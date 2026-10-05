import assert from "node:assert/strict";
import test from "node:test";

import { smsPacks, whatsappLeadPacks } from "./bookea-tarifs.ts";

test("les packs SMS sont vendus au prix coûtant France", () => {
  assert.deepEqual(
    smsPacks.map((pack) => [pack.quantity, pack.price]),
    [
      [30, 1.35],
      [50, 2.25],
      [100, 4.5],
      [200, 8.4],
      [300, 12],
      [800, 30.4],
    ],
  );
});

test("les packs WhatsApp IA suivent la grille 100 à 500 leads", () => {
  assert.deepEqual(
    whatsappLeadPacks.map((pack) => [pack.leads, pack.price]),
    [
      [100, 69.97],
      [150, 99.97],
      [200, 129.95],
      [250, 159.95],
      [300, 189.95],
      [400, 249.92],
      [500, 309.9],
    ],
  );
});
