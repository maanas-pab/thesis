import { getCandles } from "./gemini";
import type { Leg } from "./types";

/**
 * How much the legs of a story move together.
 *
 * Measured: correlation of hourly price changes over the last two weeks, on each leg's own side.
 * Thin markets trade rarely, so a measured number is trusted in proportion to how many hours
 * both legs actually moved, and blended with a prior for the kind of story it is (legs of a
 * team basket obviously rise and fall together even when they have not traded).
 */
const WINDOW = 14 * 86_400_000;
const FULL_TRUST = 30; // hours with movement in both legs
const LIMIT = 0.9;
const TTL = 15 * 60_000;

type Entry = { at: number; corr: number[][] };
const g = globalThis as unknown as { __corr?: Map<string, Entry>; __corrBusy?: Set<string> };
const cache = (g.__corr ??= new Map());
const busy = (g.__corrBusy ??= new Set());

const keyOf = (legs: Leg[], prior: number) => legs.map((l) => `${l.symbol}:${l.side}`).join("|") + `@${prior}`;
const flat = (n: number, rho: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : rho)));

/** Hourly changes for one leg over the window, keyed by hour. */
async function changes(leg: Leg) {
  const rows = await getCandles(leg.symbol, "1hr");
  const since = Date.now() - WINDOW;
  const out = new Map<number, number>();
  let prev: number | null = null;
  for (const [t, close] of rows) {
    const v = leg.side === "yes" ? close : 1 - close;
    if (prev != null && t >= since && v !== prev) out.set(t, v - prev);
    prev = v;
  }
  return out;
}

async function measure(legs: Leg[], prior: number): Promise<number[][]> {
  const moves = await Promise.all(legs.map(changes));
  const hours = [...new Set(moves.flatMap((m) => [...m.keys()]))];
  const n = legs.length;
  const corr = flat(n, prior);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) {
      // Hours where both moved decide how far to trust the measurement.
      const both = hours.filter((h) => moves[i].has(h) && moves[j].has(h)).length;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (const h of hours) {
        const x = moves[i].get(h) ?? 0;
        const y = moves[j].get(h) ?? 0;
        sxy += x * y;
        sxx += x * x;
        syy += y * y;
      }
      const measured = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
      const trust = Math.min(both / FULL_TRUST, 1);
      const rho = Math.max(-LIMIT, Math.min(LIMIT, trust * measured + (1 - trust) * prior));
      corr[i][j] = corr[j][i] = Math.round(rho * 100) / 100;
    }
  return corr;
}

/** Correlations for these legs if they have been measured, else the prior. Never waits. */
export function corrNow(legs: Leg[], prior: number): number[][] | null {
  const hit = cache.get(keyOf(legs, prior));
  if (hit) return hit.corr;
  return prior ? flat(legs.length, prior) : null;
}

/** Measure (or re-measure) the correlations for these legs. */
export async function refreshCorr(legs: Leg[], prior: number) {
  const key = keyOf(legs, prior);
  const hit = cache.get(key);
  if ((hit && Date.now() - hit.at < TTL) || busy.has(key)) return;
  busy.add(key);
  try {
    cache.set(key, { at: Date.now(), corr: await measure(legs, prior) });
  } catch {
    // Keep whatever we had.
  } finally {
    busy.delete(key);
  }
}
