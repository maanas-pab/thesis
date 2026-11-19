import type { Tranches, TrancheKind, Story } from "./types";

/** Best-case gain the Safe side is built to offer, after the spread. */
export const SAFE_TARGET = 0.15;
/** The Safe cap is kept inside this range of each $1 unit. */
const CAP_MIN = 0.1;
const CAP_MAX = 0.9;

/**
 * Chance of exactly h legs hitting, treating legs as independent.
 * Legs in one story usually move together, so real tails are fatter than this.
 */
export function hitDistribution(probs: number[]): number[] {
  let dist = [1];
  for (const p of probs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let h = 0; h < dist.length; h++) {
      next[h] += dist[h] * (1 - p);
      next[h + 1] += dist[h] * p;
    }
    dist = next;
  }
  return dist;
}

/** What Safe is worth per unit when it is paid first up to `attach`. */
function safeValue(dist: number[], attach: number) {
  const n = dist.length - 1;
  let v = 0;
  for (let h = 0; h <= n; h++) v += dist[h] * Math.min(h / n, attach);
  return v;
}

/**
 * Pick the Safe cap for one story so that Safe, bought at the spread, can still
 * gain about SAFE_TARGET. A fixed cap fails on likely stories: Safe becomes
 * certain, its price reaches the cap, and the spread turns it into a sure loss.
 * Raising the cap gives Safe more of the risk, which is what pays its return.
 */
function pickAttach(dist: number[], spread: number) {
  // Price over cap falls as the cap rises, so bisect for the target ratio.
  const want = 1 / (1 + SAFE_TARGET) - spread;
  const ratio = (a: number) => safeValue(dist, a) / a;
  if (ratio(CAP_MIN) <= want) return CAP_MIN;
  if (ratio(CAP_MAX) >= want) return CAP_MAX;
  let lo = CAP_MIN;
  let hi = CAP_MAX;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) > want) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

export function priceTranches(probs: number[], spread = 0): Tranches {
  const n = probs.length;
  const dist = hitDistribution(probs);
  const attach = pickAttach(dist, spread);
  const safePrice = safeValue(dist, attach);
  let whole = 0;
  let boldLoss = 0;
  for (let h = 0; h <= n; h++) {
    const pay = h / n;
    whole += dist[h] * pay;
    if (pay <= attach + 1e-9) boldLoss += dist[h];
  }
  return {
    attach,
    safePrice,
    boldPrice: Math.max(whole - safePrice, 0),
    safeLoss: dist[0],
    boldLoss,
    dist,
  };
}

export function quote(story: Story, kind: TrancheKind) {
  const t = story.tranches;
  // Charge the spread on top of the model split so the three sides still add up.
  const spread = Math.max(story.buyPrice - story.index / 100, 0);
  if (kind === "safe")
    return { price: t.safePrice + spread * t.attach, max: t.attach, mark: t.safePrice };
  if (kind === "bold")
    return { price: t.boldPrice + spread * (1 - t.attach), max: 1 - t.attach, mark: t.boldPrice };
  return { price: story.buyPrice, max: 1, mark: story.index / 100 };
}

export function payout(kind: TrancheKind, hits: number, n: number, attach: number) {
  const pool = hits / n;
  if (kind === "safe") return Math.min(pool, attach);
  if (kind === "bold") return Math.max(pool - attach, 0);
  return pool;
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
export const cents = (p: number) => `${Math.round(p * 100)}¢`;
