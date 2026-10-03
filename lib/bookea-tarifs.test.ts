import assert from "node:assert/strict";
import test from "node:test";

import { smsPacks } from "./bookea-tarifs.ts";

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
