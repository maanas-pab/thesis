// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { chooseTier, lockMoment, LOCK_WINDOW, tierStat, waterfall, emptyTotals } from "../lib/pool-math.ts";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const totals = (o) => ({ ...emptyTotals(), ...o });
const sum = (o) => Object.values(o).reduce((s, x) => s + x, 0);

test("the worked example pays in order", () => {
  const t = totals({ t1: 400, t2: 300, u: 300 });
  const a = waterfall(t, 1200);
  close(a.t1, 412);
  close(a.t2, 315);
  close(a.u, 473);
  const b = waterfall(t, 600);
  close(b.t1, 412);
  close(b.t2, 188);
  close(b.u, 0);
  const c = waterfall(t, 300);
  close(c.t1, 300);
  close(c.t2, 0);
});

test("every dollar paid out goes to someone, and never more", () => {
  for (let k = 0; k < 300; k++) {
    const t = totals({ t1: Math.random() * 500, t2: Math.random() * 500, t3: Math.random() * 500, t4: Math.random() * 500, u: Math.random() < 0.3 ? 0 : Math.random() * 500 });
    const amount = Math.random() * 3000;
    const w = waterfall(t, amount);
    close(sum(w), sum(t) > 0 ? amount : 0);
    assert.ok(Object.values(w).every((x) => x >= -1e-9));
  }
});

test("with nobody in Uncapped the leftover is shared by deposit", () => {
  const w = waterfall(totals({ t1: 100, t2: 300 }), 1000);
  // Owed 103 and 315; 582 left, split 1:3.
  close(w.t1, 103 + 582 / 4);
  close(w.t2, 315 + (582 * 3) / 4);
});

test("a later tier is never paid while an earlier one is short", () => {
  const t = totals({ t1: 500, t2: 200, t3: 100, u: 100 });
  for (let amount = 0; amount <= 1500; amount += 25) {
    const w = waterfall(t, amount);
    if (w.t1 < 515 - 1e-9) assert.equal(w.t2 + w.t3 + w.u, 0);
    if (w.t2 < 210 - 1e-9) assert.equal(w.t3 + w.u, 0);
  }
});

test("a crowded first tier loses its protection, as in the NBA example", () => {
  const dist = [5, 4, 3, 2, 1, 0].map((h, i) => ({ hits: h, pay: h / 5, p: [0.146, 0.348, 0.324, 0.147, 0.032, 0.003][i] }));
  const units = 1000 / 0.684;
  const crowded = tierStat("t1", totals({ t1: 900, u: 100 }), units, dist);
  close(crowded.chanceFull, 0.494, 0.001);
  close(crowded.expected, -0.069, 0.002);
  const roomy = tierStat("t1", totals({ t1: 200, u: 800 }), units, dist);
  assert.ok(roomy.chanceFull > 0.99);
  const unc = tierStat("u", totals({ t1: 900, u: 100 }), units, dist);
  close(unc.expected, 0.63, 0.01);
});

test("the random close always lands in the last 30 minutes", () => {
  const lockAt = 1_800_000_000_000;
  for (const r of [0, 1, 123456789, 4294967295, LOCK_WINDOW - 1, LOCK_WINDOW]) {
    const m = lockMoment(lockAt, r);
    assert.ok(m >= lockAt - LOCK_WINDOW && m < lockAt);
  }
});

test("the likely result is the middle outcome", () => {
  const dist = [5, 4, 3, 2, 1, 0].map((h, i) => ({ hits: h, pay: h / 5, p: [0.146, 0.348, 0.324, 0.147, 0.032, 0.003][i] }));
  const units = 1000 / 0.684;
  // Roomy Tier 1 is paid in full in the middle outcome.
  const roomy = tierStat("t1", { ...emptyTotals(), t1: 200, u: 800 }, units, dist);
  close(roomy.likely, 0.03);
  // Crowded Tier 1: the middle outcome is 3 or 4 wins, and 4 wins pays it in full.
  const crowded = tierStat("t1", { ...emptyTotals(), t1: 900, u: 100 }, units, dist);
  assert.ok(crowded.likely <= 0.03 + 1e-9 && crowded.likely > -0.05);
});

test("simulated depositors pick tiers the way their appetite says", () => {
  const s = (full, exp, profit = full) => ({ owed: 1, chanceFull: full, chanceProfit: profit, expected: exp, likely: 0, worst: 0 });
  const stats = { t1: s(0.99, 0.02), t2: s(0.95, 0.04), t3: s(0.8, 0.06), t4: s(0.5, 0.08), u: s(0.4, 0.1, 0.4) };
  assert.equal(chooseTier(stats, "cautious"), "t2");
  assert.equal(chooseTier(stats, "balanced"), "t3");
  assert.equal(chooseTier(stats, "bold"), "u");
  assert.equal(chooseTier({ ...stats, u: s(0.1, 0.5, 0.1) }, "bold"), "t4");
});
