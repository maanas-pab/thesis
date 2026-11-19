import type { Level } from "./types";

/**
 * Tiered pools: everyone's money buys the same basket, and the payout is handed out in
 * order. Each capped tier is owed its deposit plus a target return, paid in tier order.
 * Uncapped is paid last and takes everything left. If nobody is in Uncapped, the leftover
 * is shared across the capped tiers in proportion to their deposits.
 */
export type TierId = "t1" | "t2" | "t3" | "t4" | "u";
export const TIERS: { id: TierId; name: string; target: number | null }[] = [
  { id: "t1", name: "Tier 1", target: 0.03 },
  { id: "t2", name: "Tier 2", target: 0.05 },
  { id: "t3", name: "Tier 3", target: 0.1 },
  { id: "t4", name: "Tier 4", target: 0.25 },
  { id: "u", name: "Uncapped", target: null },
];
export const LOCK_WINDOW = 30 * 60_000;

export type Totals = Record<TierId, number>;
export const emptyTotals = (): Totals => ({ t1: 0, t2: 0, t3: 0, t4: 0, u: 0 });

/** What each tier receives in total when the pool pays `amount`. */
export function waterfall(totals: Totals, amount: number): Totals {
  const out = emptyTotals();
  let left = Math.max(amount, 0);
  for (const t of TIERS) {
    if (t.target == null) continue;
    const pay = Math.min(left, totals[t.id] * (1 + t.target));
    out[t.id] = pay;
    left -= pay;
  }
  if (totals.u > 0) out.u = left;
  else if (left > 0) {
    // No one holds Uncapped: the capped tiers share the leftover as a bonus.
    const capped = TIERS.filter((t) => t.target != null).reduce((s, t) => s + totals[t.id], 0);
    if (capped > 0) for (const t of TIERS) if (t.target != null) out[t.id] += (left * totals[t.id]) / capped;
  }
  return out;
}

export type TierStat = {
  owed: number | null;
  chanceFull: number;
  chanceProfit: number;
  /** Average return. Used for valuation and by the simulated depositors, not shown as a headline. */
  expected: number;
  /** Return in the middle outcome: half the time you do at least this well. */
  likely: number;
  worst: number;
};

/**
 * Odds for one tier given every payout the basket can make (`levels`, per $1 unit) and how
 * many units the pool holds. chanceFull is the chance a capped tier gets everything it is
 * owed; expected is the average return on the tier's money.
 */
export function tierStat(tier: TierId, totals: Totals, units: number, levels: Level[]): TierStat {
  const dep = totals[tier];
  const t = TIERS.find((x) => x.id === tier)!;
  const owed = t.target == null ? null : dep * (1 + t.target);
  let full = 0;
  let profit = 0;
  let mean = 0;
  let worst = Infinity;
  const outcomes: { got: number; p: number }[] = [];
  for (const l of levels) {
    const got = waterfall(totals, units * l.pay)[tier];
    outcomes.push({ got, p: l.p });
    mean += l.p * got;
    if (owed != null && got >= owed - 1e-9) full += l.p;
    if (got > dep + 1e-9) profit += l.p;
    worst = Math.min(worst, got);
  }
  // Middle outcome: walk up from the worst until half the chance is behind us.
  outcomes.sort((a, b) => a.got - b.got);
  let acc = 0;
  let mid = outcomes[outcomes.length - 1]?.got ?? 0;
  for (const o of outcomes) {
    acc += o.p;
    if (acc >= 0.5 - 1e-9) {
      mid = o.got;
      break;
    }
  }
  return {
    owed,
    chanceFull: owed == null ? profit : full,
    chanceProfit: profit,
    expected: dep > 0 ? mean / dep - 1 : 0,
    likely: dep > 0 ? mid / dep - 1 : 0,
    worst: dep > 0 ? worst / dep - 1 : 0,
  };
}

export type Appetite = "cautious" | "balanced" | "bold";

/**
 * How a simulated depositor picks a tier from the odds it sees, like a person would.
 * Cautious: the best target it can get with at least a 90% chance of being paid in full.
 * Balanced: the best average return among tiers with at least a 65% chance.
 * Bold: Uncapped, unless Uncapped is so crowded that it rarely makes a profit.
 */
export function chooseTier(stats: Partial<Record<TierId, TierStat>>, appetite: Appetite): TierId {
  const capped = TIERS.filter((t) => t.target != null).map((t) => t.id);
  const ok = (id: TierId, min: number) => (stats[id]?.chanceFull ?? 0) >= min;
  if (appetite === "cautious") return [...capped].reverse().find((id) => ok(id, 0.9)) ?? "t1";
  if (appetite === "bold") return (stats.u?.chanceProfit ?? 0) >= 0.2 ? "u" : "t4";
  const pool = TIERS.map((t) => t.id).filter((id) => ok(id, 0.65));
  if (!pool.length) return "t1";
  return pool.reduce((best, id) => ((stats[id]?.expected ?? -1) > (stats[best]?.expected ?? -1) ? id : best), pool[0]);
}

/**
 * Where the random close lands: a moment in the last LOCK_WINDOW before the scheduled lock,
 * from a number that was committed to (by its hash) when the pool opened.
 */
export function lockMoment(lockAt: number, random32: number) {
  return lockAt - LOCK_WINDOW + (random32 % LOCK_WINDOW);
}
