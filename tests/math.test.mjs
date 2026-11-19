// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { levels, outcomes, priceTranches, payout, quote, valueUnit, safeValue, normInv, SAFE_TARGET } from "../lib/math.ts";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const rand = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const equal = (n) => Array.from({ length: n }, () => 1 / n);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const flat = (n, rho) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : rho)));

function randomLegs(r) {
  const n = 5 + Math.floor(r() * 4);
  const probs = Array.from({ length: n }, () => 0.03 + r() * 0.94);
  const raw = Array.from({ length: n }, () => 1 + Math.floor(r() * 3));
  return { n, probs, weights: raw.map((w) => w / sum(raw)) };
}

function story(probs, weights, up = 0.02, down = 0.02, corr = null) {
  const index = sum(probs.map((p, i) => p * weights[i])) * 100;
  return { index, buyPrice: index / 100 + up, sellPrice: index / 100 - down, tranches: priceTranches(probs, weights, up, corr) };
}

test("independent outcomes are the exact product and sum to 1", () => {
  const r = rand(7);
  for (let k = 0; k < 100; k++) {
    const { n, probs } = randomLegs(r);
    const o = outcomes(probs);
    close(sum([...o]), 1);
    // Each leg's own chance comes back out.
    for (let i = 0; i < n; i++) close(sum([...o].filter((_, mask) => (mask >> i) & 1)), probs[i]);
  }
});

test("the index is the expected payout, with any weights", () => {
  const r = rand(9);
  for (let k = 0; k < 100; k++) {
    const { probs, weights } = randomLegs(r);
    const lv = levels(probs, weights);
    close(sum(lv.map((l) => l.p)), 1);
    close(sum(lv.map((l) => l.p * l.pay)), sum(probs.map((p, i) => p * weights[i])));
    assert.ok(lv.every((l) => l.pay >= -1e-9 && l.pay <= 1 + 1e-9));
  }
});

test("Safe and Bold always add up to the whole unit", () => {
  const r = rand(11);
  for (let k = 0; k < 150; k++) {
    const { probs, weights } = randomLegs(r);
    const t = priceTranches(probs, weights, r() * 0.05);
    for (const l of t.levels) {
      const s = payout("safe", l.pay, t.attach);
      const b = payout("bold", l.pay, t.attach);
      close(s + b, l.pay);
      assert.ok(s >= 0 && b >= 0 && s <= t.attach + 1e-12);
    }
    close(t.safePrice + t.boldPrice, sum(probs.map((p, i) => p * weights[i])));
    close(t.safePrice, sum(t.levels.map((l) => l.p * payout("safe", l.pay, t.attach))));
    close(t.boldPrice, sum(t.levels.map((l) => l.p * payout("bold", l.pay, t.attach))));
    close(t.safeLoss, probs.reduce((s, p) => s * (1 - p), 1));
    close(t.allHit, probs.reduce((s, p) => s * p, 1));
  }
});

test("asks and bids of the two sides add up to the whole basket's", () => {
  const r = rand(3);
  for (let k = 0; k < 150; k++) {
    const { probs, weights } = randomLegs(r);
    const s = story(probs, weights, r() * 0.04, r() * 0.04);
    const w = quote(s, "whole");
    const a = quote(s, "safe");
    const b = quote(s, "bold");
    close(w.price, s.buyPrice);
    close(w.bid, s.sellPrice);
    close(a.price + b.price, w.price);
    close(a.mark + b.mark, w.mark);
    close(a.max + b.max, 1);
    if (a.bid > 0 && b.bid > 0) close(a.bid + b.bid, w.bid);
    for (const q of [w, a, b]) assert.ok(q.bid <= q.mark + 1e-12 && q.mark <= q.price + 1e-12);
  }
});

test("Safe keeps the target return unless the cap is at its limit", () => {
  const r = rand(5);
  let checked = 0;
  for (let k = 0; k < 300; k++) {
    const { probs, weights } = randomLegs(r);
    const s = story(probs, weights, r() * 0.04);
    const q = quote(s, "safe");
    const gain = q.max / q.price - 1;
    const a = s.tranches.attach;
    if (a > 0.1 && a < 0.9) {
      assert.ok(Math.abs(gain - SAFE_TARGET) < 0.03, `gain ${gain} at cap ${a}`);
      checked++;
    } else if (a === 0.1) assert.ok(gain >= SAFE_TARGET - 0.03);
  }
  assert.ok(checked > 100);
});

test("Safe value per dollar of cap falls as the cap rises", () => {
  const lv = levels([0.8, 0.6, 0.5, 0.4, 0.7], [0.3, 0.1, 0.2, 0.2, 0.2]);
  let prev = Infinity;
  for (let a = 0.1; a <= 0.9; a += 0.01) {
    const ratio = safeValue(lv, a) / a;
    assert.ok(ratio <= prev + 1e-12);
    prev = ratio;
  }
});

test("the normal inverse is accurate", () => {
  close(normInv(0.5), 0, 1e-8);
  close(normInv(0.975), 1.959964, 1e-5);
  close(normInv(0.1), -1.281552, 1e-5);
  close(normInv(0.001), -3.090232, 1e-5);
});

test("correlation keeps each leg's own chance and moves the extremes", () => {
  const probs = [0.6, 0.5, 0.4, 0.7, 0.55, 0.45];
  const w = equal(6);
  const ind = outcomes(probs);
  const cor = outcomes(probs, flat(6, 0.6));
  close(sum([...cor]), 1, 1e-9);
  // Simulated, so each leg's chance is close, not exact.
  for (let i = 0; i < 6; i++) close(sum([...cor].filter((_, m) => (m >> i) & 1)), probs[i], 0.02);
  // Legs that move together hit together, and miss together, more often.
  assert.ok(cor[63] > ind[63] * 2, "all hit");
  assert.ok(cor[0] > ind[0] * 2, "none hit");
  // Zero correlation is the exact independent answer.
  outcomes(probs, flat(6, 0)).forEach((p, m) => close(p, ind[m]));
  // Same inputs, same price, every time.
  close(priceTranches(probs, w, 0.02, flat(6, 0.6)).safePrice, priceTranches(probs, w, 0.02, flat(6, 0.6)).safePrice);
});

test("correlated pricing matches the exact answer for two legs", () => {
  // For two legs the chance both hit has a closed form at rho = 1 and rho = -1.
  close(outcomes([0.3, 0.6], flat(2, 0.9))[3], 0.3, 0.03);
  const both = outcomes([0.5, 0.5], flat(2, 0.5))[3];
  // P(both) for two fair coins with correlation rho is 1/4 + asin(rho) / (2 pi) = 1/3.
  close(both, 1 / 3, 0.015);
});

test("correlation makes Safe worth less and Bold worth more", () => {
  const probs = [0.6, 0.5, 0.4, 0.7, 0.55, 0.45];
  const w = equal(6);
  const lvI = levels(probs, w);
  const lvC = levels(probs, w, flat(6, 0.6));
  assert.ok(safeValue(lvC, 0.4) < safeValue(lvI, 0.4));
});

test("a held position is valued the same way a fresh one is priced", () => {
  const probs = [0.62, 0.35, 0.8, 0.5, 0.44];
  const weights = [0.3, 0.2, 0.2, 0.2, 0.1];
  for (const corr of [null, flat(5, 0.4)]) {
    const s = story(probs, weights, 0.02, 0.03, corr);
    const legs = probs.map((p, i) => ({ price: p, bid: p - 0.03, weight: weights[i] }));
    for (const kind of ["whole", "safe", "bold"]) {
      const q = quote(s, kind);
      const v = valueUnit(legs, kind, s.tranches.attach, corr);
      close(v.mark, q.mark);
      close(v.bid, q.bid);
      close(v.max, q.max);
    }
  }
});

test("a position settles at its payout once every leg is known", () => {
  const weights = [0.3, 0.2, 0.2, 0.2, 0.1];
  const done = [1, 1, 0, 1, 0].map((p, i) => ({ price: p, bid: p, weight: weights[i] }));
  for (const kind of ["whole", "safe", "bold"])
    for (const corr of [null, flat(5, 0.5)]) close(valueUnit(done, kind, 0.4, corr).mark, payout(kind, 0.7, 0.4));
});
