// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { mood } from "../lib/mood.ts";

const gloomy = ["i think ai bad", "the economy crashes", "AI is overhyped and the bubble pops", "le pen loses", "buffalo won't win", "rates won't go up", "ai isn't going to work"];
const upbeat = ["ai is probably like not gonna do that bad", "ai is going to boom", "stocks don't crash", "buffalo wins it all", "the fed won't cut", "this is not a bubble", "growth holds up"];

test("gloomy views read as gloomy", () => {
  for (const t of gloomy) assert.ok(mood(t) < 0, t);
});

test("upbeat views, including negated gloom, read as upbeat", () => {
  for (const t of upbeat) assert.ok(mood(t) > 0, t);
});

test("a view with no mood words is neutral", () => {
  assert.equal(mood("le pen and reform in europe"), 0);
});
