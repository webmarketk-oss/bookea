import assert from "node:assert/strict";
import test from "node:test";
import {
  CABIN_COLUMN_MIN_PX,
  cabinColumnWidth,
} from "./agenda-board-layout.ts";

test("une seule cabine prend toute la largeur restante", () => {
  assert.equal(cabinColumnWidth(1200, 1), 1200);
});

test("plusieurs cabines qui tiennent s’affichent côte à côte", () => {
  assert.equal(cabinColumnWidth(900, 3), 300);
});

test("trop de cabines gardent une largeur mini pour pouvoir glisser", () => {
  assert.equal(cabinColumnWidth(700, 5), CABIN_COLUMN_MIN_PX);
});

test("une cabine laisse la place de la barre verticale", () => {
  assert.equal(cabinColumnWidth(1200 - 16, 1), 1184);
});
