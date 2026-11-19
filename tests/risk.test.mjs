// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { exposures, hedge } from "../lib/risk.ts";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const leg = (symbol, side, weight, price, state = "open") => ({ symbol, label: `${symbol.split("-")[1]}: x`, side, weight, price, state });
const row = (storyId, value, legs) => ({ p: { storyId, legs: [] }, value, legs });

test("exposure splits a position's value across its open markets", () => {
  const rows = [row("a", 100, [leg("GEMI-FED-HIKE", "yes", 0.5, 0.8), leg("GEMI-GDP-X", "yes", 0.5, 0.2)])];
  const { list } = exposures(rows);
  close(list.reduce((s, e) => s + e.dollars, 0), 100);
  // Weight times price: 0.4 against 0.1, so 80 and 20.
  close(list[0].dollars, 80);
  close(list[1].dollars, 20);
});

test("settled markets carry no exposure", () => {
  const rows = [row("a", 50, [leg("GEMI-FED-HIKE", "yes", 0.5, 1, "hit"), leg("GEMI-GDP-X", "yes", 0.5, 0.4)])];
  const { list } = exposures(rows);
  assert.equal(list.length, 1);
  close(list[0].dollars, 50);
});

test("the same contract on both sides is flagged as offsetting", () => {
  const rows = [row("a", 10, [leg("GEMI-FED-HIKE", "yes", 1, 0.5)]), row("b", 10, [leg("GEMI-FED-HIKE", "no", 1, 0.5)])];
  const { shared, offsetting } = exposures(rows);
  assert.equal(shared.length, 1);
  assert.equal(offsetting.length, 1);
});

test("the hedge is the story that takes the other side of the most money", () => {
  const rows = [row("mine", 100, [leg("GEMI-FED-HIKE", "yes", 0.5, 0.8), leg("GEMI-GDP-X", "yes", 0.5, 0.2)])];
  const s = (id, legs) => ({ id, legs: legs.map(([symbol, side]) => ({ symbol, side })) });
  const stories = [s("mine", [["GEMI-FED-HIKE", "yes"]]), s("weak", [["GEMI-GDP-X", "no"]]), s("strong", [["GEMI-FED-HIKE", "no"]]), s("same", [["GEMI-FED-HIKE", "yes"]])];
  const h = hedge(rows, stories);
  assert.equal(h.story.id, "strong");
  close(h.score, 80);
});
