import type { Level, Tranches, TrancheKind, Story } from "./types";

/** Best-case gain the Safe side is built to offer, after the spread. */
export const SAFE_TARGET = 0.15;
/** The Safe cap is kept inside this range of each $1 unit. */
const CAP_MIN = 0.1;
const CAP_MAX = 0.9;
/** Share of every buy of a community story that goes to its creator. */
export const CREATOR_FEE = 0.01;
/** Simulated worlds used when legs are correlated. */
const SIMS = 6000;

const compactFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
/** Dollars in short form for volume: $840, $7.2K, $1.3M. */
export const compactUsd = (n: number) => (n < 1000 ? `$${Math.round(n)}` : compactFmt.format(n));

// ---------- Outcome probabilities ----------

/** Deterministic random numbers, so the same inputs always give the same price. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws, SIMS rows of n, made once per n and reused. */
const drawCache = new Map<number, Float64Array>();
function draws(n: number) {
  let z = drawCache.get(n);
  if (!z) {
    const r = rng(20261116 + n);
    z = new Float64Array(SIMS * n);
    // Box-Muller, with each row mirrored so the sample is symmetric.
    for (let s = 0; s < SIMS; s += 2)
      for (let i = 0; i < n; i++) {
        const v = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
        z[s * n + i] = v;
        if (s + 1 < SIMS) z[(s + 1) * n + i] = -v;
      }
    drawCache.set(n, z);
  }
  return z;
}

/** Inverse of the standard normal distribution (Acklam's approximation). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  p = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - 0.02425) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Lower-triangular L with L·Lᵀ = m, or null when m is not a valid correlation matrix. */
function cholesky(m: number[][]) {
  const n = m.length;
  const l = m.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      if (i === j) {
        if (s <= 1e-10) return null;
        l[i][i] = Math.sqrt(s);
      } else l[i][j] = s / l[j][j];
    }
  return l;
}

/**
 * Probability of every yes/no outcome of the legs, indexed by bitmask (bit i set = leg i hits).
 *
 * Independent legs: the exact product.
 * Correlated legs: a Gaussian copula. Each leg hits when a normal variable falls below the
 * level that gives it its own market probability, and the variables are correlated by `corr`.
 * That keeps every leg's own probability and changes only how often legs hit together.
 */
export function outcomes(probs: number[], corr?: number[][] | null): Float64Array {
  const n = probs.length;
  const out = new Float64Array(1 << n);
  let l = corr && corr.length === n ? cholesky(corr) : null;
  // A noisy estimate may not be a valid matrix: pull it toward independence until it is.
  for (let k = 0; corr && !l && k < 6; k++) {
    const f = 0.8 ** (k + 1);
    l = cholesky(corr.map((row, i) => row.map((v, j) => (i === j ? 1 : v * f))));
  }
  const flat = !corr || !l || corr.every((row, i) => row.every((v, j) => i === j || Math.abs(v) < 1e-6));
  if (flat) {
    for (let mask = 0; mask < out.length; mask++) {
      let p = 1;
      for (let i = 0; i < n; i++) p *= (mask >> i) & 1 ? probs[i] : 1 - probs[i];
      out[mask] = p;
    }
    return out;
  }
  const z = draws(n);
  const cut = probs.map(normInv);
  for (let s = 0; s < SIMS; s++) {
    let mask = 0;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (let k = 0; k <= i; k++) x += l![i][k] * z[s * n + k];
      if (x < cut[i]) mask |= 1 << i;
    }
    out[mask] += 1 / SIMS;
  }
  return out;
}

/** Collapse outcomes into payout levels: how much a unit pays and how likely that is. Highest first. */
export function levels(probs: number[], weights: number[], corr?: number[][] | null): Level[] {
  const o = outcomes(probs, corr);
  const by = new Map<number, Level>();
  for (let mask = 0; mask < o.length; mask++) {
    if (!o[mask]) continue;
    let pay = 0;
    let hits = 0;
    for (let i = 0; i < probs.length; i++)
      if ((mask >> i) & 1) {
        pay += weights[i];
        hits++;
      }
    const key = Math.round(pay * 1e6);
    const at = by.get(key);
    if (at) at.p += o[mask];
    else by.set(key, { pay, p: o[mask], hits });
  }
  return [...by.values()].sort((a, b) => b.pay - a.pay);
}

// ---------- Safe and Bold ----------

/** What one unit of a side pays when the pool pays `pay`. Safe is paid first, up to the cap. */
export function payout(kind: TrancheKind, pay: number, attach: number) {
  if (kind === "safe") return Math.min(pay, attach);
  if (kind === "bold") return Math.max(pay - attach, 0);
  return pay;
}

/** What Safe is worth per unit when it is paid first up to `attach`. */
export function safeValue(lv: Level[], attach: number) {
  return lv.reduce((s, l) => s + l.p * Math.min(l.pay, attach), 0);
}

/**
 * Pick the Safe cap for one story so that Safe, bought at the spread, can still
 * gain about SAFE_TARGET. A fixed cap fails on likely stories: Safe becomes
 * certain, its price reaches the cap, and the spread turns it into a sure loss.
 * Raising the cap gives Safe more of the risk, which is what pays its return.
 */
function pickAttach(lv: Level[], spread: number) {
  // Price over cap falls as the cap rises, so bisect for the target ratio.
  const want = 1 / (1 + SAFE_TARGET) - spread;
  const ratio = (a: number) => safeValue(lv, a) / a;
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

const avgCorr = (corr?: number[][] | null) => {
  if (!corr || corr.length < 2) return 0;
  let s = 0;
  let k = 0;
  for (let i = 0; i < corr.length; i++) for (let j = 0; j < i; j++) (s += corr[i][j]), k++;
  return s / k;
};

export function priceTranches(probs: number[], weights: number[], spread = 0, corr?: number[][] | null): Tranches {
  const lv = levels(probs, weights, corr);
  const attach = pickAttach(lv, spread);
  const safePrice = safeValue(lv, attach);
  // The mid is exact (weights times prices), so Bold is whatever Safe leaves of it.
  const whole = probs.reduce((s, p, i) => s + p * weights[i], 0);
  const all = lv[0]?.pay > 1 - 1e-6 ? lv[0].p : 0;
  return {
    attach,
    safePrice,
    boldPrice: Math.max(whole - safePrice, 0),
    safeLoss: lv.reduce((s, l) => s + (l.pay <= 1e-9 ? l.p : 0), 0),
    boldLoss: lv.reduce((s, l) => s + (l.pay <= attach + 1e-9 ? l.p : 0), 0),
    levels: lv,
    corr: corr ?? null,
    avgCorr: avgCorr(corr),
    allHit: all,
    allHitIndependent: probs.reduce((s, p) => s * p, 1),
  };
}

/**
 * Ask, bid and mid for one side of a story.
 * The whole basket's ask is every leg at its ask and its bid is every leg at its bid.
 * Safe and Bold split that spread in proportion to their share of the $1 unit,
 * so Safe ask + Bold ask = whole ask, and the same for bids.
 */
export function quote(story: Pick<Story, "index" | "buyPrice" | "sellPrice" | "tranches">, kind: TrancheKind) {
  const t = story.tranches;
  const mid = story.index / 100;
  const up = Math.max(story.buyPrice - mid, 0);
  const down = Math.max(mid - story.sellPrice, 0);
  const share = kind === "safe" ? t.attach : kind === "bold" ? 1 - t.attach : 1;
  const mark = kind === "safe" ? t.safePrice : kind === "bold" ? t.boldPrice : mid;
  return { price: mark + up * share, bid: Math.max(mark - down * share, 0), max: share, mark };
}

/**
 * Value of one unit of a held position from live quotes on its own legs,
 * using the Safe cap and correlations it was bought with.
 */
export function valueUnit(
  legs: { price: number; bid: number; weight: number }[],
  kind: TrancheKind,
  attach: number,
  corr?: number[][] | null,
) {
  const mid = legs.reduce((s, l) => s + l.weight * l.price, 0);
  const bidWhole = legs.reduce((s, l) => s + l.weight * l.bid, 0);
  const down = Math.max(mid - bidWhole, 0);
  const share = kind === "safe" ? attach : kind === "bold" ? 1 - attach : 1;
  let mark = mid;
  if (kind !== "whole") {
    // A leg that has settled is certain; only the open ones are simulated.
    const safe = safeValue(levels(legs.map((l) => l.price), legs.map((l) => l.weight), corr), attach);
    mark = kind === "safe" ? safe : Math.max(mid - safe, 0);
  }
  return { mark, bid: Math.max(mark - down * share, 0), max: share };
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
export const cents = (p: number) => `${Math.round(p * 100)}¢`;
