import { createHash, randomBytes } from "node:crypto";
import { DATA_DIR } from "./data-dir";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { priceLegs } from "./community";
import { getEvent } from "./gemini";
import { LOCK_WINDOW, TIERS, chooseTier, emptyTotals, lockMoment, tierStat, waterfall, type Appetite, type TierId, type TierStat, type Totals } from "./pool-math";
import { getStory, markLeg, priorOf } from "./stories";
import type { LegPick, Story } from "./types";

/**
 * Tiered pools, run on the server so everyone shares one pool per story per lock time.
 * The rules mirror what the Solana vault will enforce:
 * - Deposits and tier moves are open until the pool locks. Withdrawals stop when the
 *   random-close window starts.
 * - The pool locks at a random moment in the last 30 minutes. The random number is fixed
 *   when the pool opens and only its hash is shown, then revealed at lock, so nobody
 *   (including us) can pick the moment. Deposits after that moment are refunded and
 *   moves after it are undone.
 * - At lock, all the money buys the basket at its ask. When every market resolves, the
 *   payout goes down the tiers in order.
 */
const FILE = path.join(DATA_DIR, "pools.json");
const MIN_LEAD = LOCK_WINDOW + 15 * 60_000;
const DAY = 86_400_000;

export type PoolEvent =
  | { t: number; type: "deposit"; id: string; account: string; tier: TierId; amount: number; sim?: boolean }
  | { t: number; type: "move"; id: string; tier: TierId }
  | { t: number; type: "withdraw"; id: string };

export type Deposit = { id: string; account: string; tier: TierId; amount: number; t: number; status: "in" | "refunded" | "withdrawn"; sim?: boolean; payout?: number; claimed?: boolean };

export type Pool = {
  id: string;
  storyId: string;
  storyName: string;
  legs: LegPick[];
  prior: number;
  lockAt: number;
  commit: string;
  seed: string;
  events: PoolEvent[];
  status: "open" | "locked" | "settled" | "void" | "empty";
  lockedAt?: number;
  ask?: number;
  units?: number;
  final?: Totals;
  payoutPerUnit?: number;
  hits?: Record<string, boolean>;
  settledAt?: number;
  createdAt?: number;
  /** Simulated depositors: when each arrives, how much, and how much risk it likes. */
  sim?: { v: 2; basis: number; schedule: { t: number; amount: number; appetite: Appetite }[]; added: number };
};

const g = globalThis as unknown as { __pools?: Record<string, Pool>; __poolTimer?: ReturnType<typeof setInterval> };

function book() {
  if (!g.__pools) {
    try {
      g.__pools = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      g.__pools = {};
    }
  }
  return g.__pools!;
}
function save() {
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(book()));
  } catch {}
}

// ---------- When a pool locks ----------

/** Next Friday at noon Chicago time (18:00 UTC in winter). */
function nextFriday(after: number) {
  const d = new Date(after);
  d.setUTCHours(18, 0, 0, 0);
  while (d.getUTCDay() !== 5 || d.getTime() <= after) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

/**
 * Games lock at the first kickoff. Anything settling within a week locks 27 hours before
 * its first market settles: the evening before for weather, about a day ahead for prices.
 * Everything else runs weekly pools locking Friday noon. Null when it's too late to open one.
 */
export function scheduleLock(story: Story, now = Date.now()) {
  const earliest = now + MIN_LEAD;
  const starts = story.legs.map((l) => l.start).filter((x): x is number => !!x && x > now - DAY);
  if (starts.length) {
    const t = Math.min(...starts);
    return t > earliest ? t : null;
  }
  const exp = Math.min(...story.legs.map((l) => l.expiry ?? Infinity));
  if (exp - now < 8 * DAY) {
    const t = exp - 27 * 3_600_000;
    return t > earliest ? t : null;
  }
  const weekly = nextFriday(earliest);
  return Math.min(weekly, exp - DAY) > earliest ? Math.min(weekly, exp - DAY) : weekly;
}

// ---------- State ----------

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Replay the event log up to a moment: who holds what, and which deposits came too late. */
function replay(pool: Pool, until = Infinity) {
  const deps = new Map<string, Deposit>();
  for (const e of pool.events) {
    if (e.type === "deposit") deps.set(e.id, { id: e.id, account: e.account, tier: e.tier, amount: e.amount, t: e.t, sim: e.sim, status: e.t <= until ? "in" : "refunded" });
    else if (e.t <= until) {
      const d = deps.get(e.id);
      if (!d || d.status !== "in") continue;
      if (e.type === "move") d.tier = e.tier;
      else d.status = "withdrawn";
    }
  }
  const totals = emptyTotals();
  for (const d of deps.values()) if (d.status === "in") totals[d.tier] += d.amount;
  return { deposits: [...deps.values()], totals };
}

function create(story: Story, lockAt: number): Pool {
  const seed = randomBytes(32).toString("hex");
  const id = `${story.id}_${lockAt}`;
  const pool: Pool = {
    id,
    storyId: story.id,
    storyName: story.name,
    legs: story.legs.map((l) => ({ eventTicker: l.eventTicker, symbol: l.symbol, side: l.side, weight: l.weight })),
    prior: priorOf(story.id),
    lockAt,
    commit: sha(`${id}:${seed}`),
    seed,
    events: [],
    status: "open",
    createdAt: Date.now(),
  };
  book()[id] = pool;
  save();
  return pool;
}

/** The open pool for a story, made on first request. */
export async function poolFor(storyId: string) {
  const story = await getStory(storyId);
  if (!story) return null;
  const lockAt = scheduleLock(story);
  if (!lockAt) return null;
  const id = `${story.id}_${lockAt}`;
  const have = book()[id];
  if (have) {
    // Until someone joins, keep the basket in step with the story.
    if (!have.events.length) have.legs = story.legs.map((l) => ({ eventTicker: l.eventTicker, symbol: l.symbol, side: l.side, weight: l.weight }));
    return have;
  }
  return create(story, lockAt);
}

export const getPool = (id: string) => book()[id] ?? null;
export const poolsOfStory = (storyId: string) => Object.values(book()).filter((p) => p.storyId === storyId).sort((a, b) => b.lockAt - a.lockAt);

// ---------- Actions ----------

const tierIds = new Set(TIERS.map((t) => t.id));

export function act(pool: Pool, body: { action: string; account?: string; tier?: string; amount?: number; depositId?: string }) {
  const now = Date.now();
  if (pool.status !== "open" || now >= pool.lockAt) return { error: "This pool has locked." };
  const { deposits } = replay(pool);
  if (body.action === "deposit") {
    const amount = Number(body.amount);
    if (!body.account || !tierIds.has(body.tier as TierId) || !(amount >= 1 && amount <= 100_000)) return { error: "Bad deposit." };
    const id = randomBytes(8).toString("hex");
    pool.events.push({ t: now, type: "deposit", id, account: body.account, tier: body.tier as TierId, amount: Math.round(amount * 100) / 100 });
    save();
    return { depositId: id };
  }
  const d = deposits.find((x) => x.id === body.depositId);
  if (!d || d.account !== body.account || d.status !== "in") return { error: "That deposit isn't yours or isn't in the pool." };
  if (body.action === "move") {
    if (!tierIds.has(body.tier as TierId)) return { error: "Unknown tier." };
    pool.events.push({ t: now, type: "move", id: d.id, tier: body.tier as TierId });
    save();
    return { ok: true };
  }
  if (body.action === "withdraw") {
    if (now >= pool.lockAt - LOCK_WINDOW) return { error: "Withdrawals close when the random-close window starts. You can still move tiers." };
    pool.events.push({ t: now, type: "withdraw", id: d.id });
    save();
    return { ok: true, amount: d.amount };
  }
  return { error: "Unknown action." };
}

// ---------- Simulated depositors ----------

/**
 * So a pool behaves like a live one in the demo, simulated depositors join it over time.
 * The total they bring is a fifth of the last day's Gemini volume across the basket's
 * markets (between $300 and $8,000). Arrivals bunch up toward the lock, as real ones do.
 * Each picks a tier from the odds it sees at that moment, by its appetite for risk, so the
 * pool balances itself the way it would with people. Every simulated deposit is marked.
 */
const SIM_SHARE = 0.2;
const SIM_MIN = 300;
const SIM_MAX = 8000;
const APPETITES: Appetite[] = ["cautious", "cautious", "cautious", "balanced", "balanced", "balanced", "bold", "bold"];

function rng(seedHex: string) {
  let x = parseInt(seedHex.slice(0, 8), 16) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

async function ensureSchedule(pool: Pool) {
  if (pool.sim?.v === 2 || pool.status !== "open") return;
  const events = await Promise.all([...new Set(pool.legs.map((l) => l.eventTicker))].map((t) => getEvent(t)));
  const volume = events.reduce((s, e) => s + (parseFloat(e?.volume24h ?? "") || (parseFloat(e?.volume ?? "") || 0) / 30), 0);
  const basis = Math.round(volume);
  const total = Math.min(Math.max(volume * SIM_SHARE, SIM_MIN), SIM_MAX);
  const r = rng(sha(`${pool.id}:${pool.seed}:sim`));
  const count = Math.round(Math.min(Math.max(total / 45, 8), 120));
  // Uneven sizes: most people put in a little, a few put in a lot.
  const raw = Array.from({ length: count }, () => Math.exp(r() * 2.5));
  const scale = total / raw.reduce((s, x) => s + x, 0);
  // Treat the pool as open for a week before a weekly lock, or 12 hours for short ones, and
  // fill in the arrivals that would already have happened.
  const now = Date.now();
  const start = pool.lockAt - now > 2 * DAY ? pool.lockAt - 7 * DAY : now - 12 * 3_600_000;
  const span = pool.lockAt - start;
  const schedule = raw
    .map((x) => ({
      // The square root bunches arrivals toward the lock.
      t: Math.round(start + span * Math.sqrt(r())),
      amount: Math.max(5, Math.round(x * scale)),
      appetite: APPETITES[Math.floor(r() * APPETITES.length)],
    }))
    .sort((a, b) => a.t - b.t);
  // Simulated deposits from an earlier schedule are replaced.
  pool.events = pool.events.filter((e) => !(e.type === "deposit" && e.sim));
  pool.sim = { v: 2, basis, schedule, added: 0 };
  save();
}

/** Add every simulated deposit whose time has come, each choosing from the odds at that moment. */
async function tickSim(pool: Pool) {
  await ensureSchedule(pool);
  const sim = pool.sim;
  if (!sim || pool.status !== "open" || sim.added >= sim.schedule.length || sim.schedule[sim.added].t > Date.now()) return;
  const priced = await priceLegs(pool.legs, { id: pool.id, name: pool.storyName, blurb: "" }, undefined, pool.prior).catch(() => null);
  if (!priced) return;
  const levels = priced.tranches.levels;
  let { totals } = replay(pool);
  while (sim.added < sim.schedule.length && sim.schedule[sim.added].t <= Date.now()) {
    const a = sim.schedule[sim.added];
    const stats: Partial<Record<TierId, TierStat>> = {};
    for (const t of TIERS) {
      const tot = { ...totals, [t.id]: totals[t.id] + a.amount };
      stats[t.id] = tierStat(t.id, tot, Object.values(tot).reduce((s, x) => s + x, 0) / priced.buyPrice, levels);
    }
    const tier = chooseTier(stats, a.appetite);
    pool.events.push({ t: a.t, type: "deposit", id: `sim-${sim.added}`, account: "sim", tier, amount: a.amount, sim: true });
    totals = { ...totals, [tier]: totals[tier] + a.amount };
    sim.added++;
  }
  pool.events.sort((x, y) => x.t - y.t);
  save();
}

// ---------- Lock and settle ----------

async function finalize(pool: Pool) {
  const r = parseInt(sha(`${pool.id}:${pool.seed}:close`).slice(0, 8), 16);
  const at = lockMoment(pool.lockAt, r);
  const { totals } = replay(pool, at);
  const total = Object.values(totals).reduce((s, x) => s + x, 0);
  pool.lockedAt = at;
  if (total <= 0) {
    pool.status = "empty";
    return save();
  }
  const priced = await priceLegs(pool.legs, { id: pool.id, name: pool.storyName, blurb: "" }, undefined, pool.prior);
  if (!priced) {
    // The markets can't be bought right now: everyone gets their money back.
    pool.status = "void";
    return save();
  }
  pool.ask = priced.buyPrice;
  pool.units = total / priced.buyPrice;
  pool.final = totals;
  pool.status = "locked";
  save();
}

async function settle(pool: Pool) {
  const marks = await Promise.all(pool.legs.map((l) => markLeg(l.eventTicker, l.symbol, l.side)));
  if (!marks.every((m) => m?.settled)) return;
  pool.hits = Object.fromEntries(pool.legs.map((l, i) => [l.symbol, marks[i]!.price === 1]));
  pool.payoutPerUnit = pool.legs.reduce((s, l, i) => s + l.weight * marks[i]!.price, 0);
  pool.settledAt = Date.now();
  pool.status = "settled";
  save();
}

const lastCheck = new Map<string, number>();
/** Move a pool along if it is due: lock it, or settle it once every market has resolved. */
export async function advance(pool: Pool) {
  if (pool.status === "open") await tickSim(pool).catch(() => {});
  if (pool.status === "open" && Date.now() >= pool.lockAt) await finalize(pool);
  else if (pool.status === "locked" && Date.now() - (lastCheck.get(pool.id) ?? 0) > 60_000) {
    lastCheck.set(pool.id, Date.now());
    await settle(pool).catch(() => {});
  }
  return pool;
}

/** Lock pools on time even when nobody has a page open. */
export function keepAdvancing() {
  if (g.__poolTimer) return;
  g.__poolTimer = setInterval(() => {
    for (const p of Object.values(book())) if (p.status === "open" || p.status === "locked") advance(p).catch(() => {});
  }, 20_000);
  g.__poolTimer.unref?.();
}

// ---------- What the page shows ----------

export async function view(pool: Pool, account?: string, amount = 20) {
  keepAdvancing();
  await advance(pool);
  const now = Date.now();
  const final = pool.status !== "open";
  const { deposits, totals } = replay(pool, final ? pool.lockedAt : Infinity);
  const priced = pool.status === "settled" ? null : await priceLegs(pool.legs, { id: pool.id, name: pool.storyName, blurb: "" }, undefined, pool.prior).catch(() => null);
  const levels =
    pool.status === "settled"
      ? [{ pay: pool.payoutPerUnit!, p: 1, hits: 0 }]
      : priced?.tranches.levels ?? [];
  const ask = pool.ask ?? priced?.buyPrice ?? null;

  // Open pools: odds for each tier if you added `amount` there. Locked pools: the real odds.
  const rows = TIERS.map((t) => {
    let tot = totals;
    let units = pool.units ?? 0;
    if (pool.status === "open" && ask) {
      tot = { ...totals, [t.id]: totals[t.id] + amount };
      units = Object.values(tot).reduce((s, x) => s + x, 0) / ask;
    }
    const stat = levels.length && tot[t.id] > 0 ? tierStat(t.id, tot, units, levels) : null;
    return { ...t, inPool: totals[t.id], stat };
  });

  let payouts: Record<string, number> = {};
  if (pool.status === "settled") {
    const paid = waterfall(pool.final!, pool.units! * pool.payoutPerUnit!);
    for (const d of deposits) if (d.status === "in") payouts[d.id] = (paid[d.tier] * d.amount) / (pool.final![d.tier] || 1);
  }
  if (pool.status === "void") payouts = Object.fromEntries(deposits.filter((d) => d.status === "in").map((d) => [d.id, d.amount]));

  return {
    id: pool.id,
    storyId: pool.storyId,
    storyName: pool.storyName,
    status: pool.status,
    lockAt: pool.lockAt,
    windowStart: pool.lockAt - LOCK_WINDOW,
    lockedAt: pool.lockedAt ?? null,
    commit: pool.commit,
    seed: final ? pool.seed : null,
    now,
    ask,
    units: pool.units ?? null,
    payoutPerUnit: pool.payoutPerUnit ?? null,
    hits: pool.hits ?? null,
    total: Object.values(totals).reduce((s, x) => s + x, 0),
    people: new Set(deposits.filter((d) => d.status === "in" && !d.sim).map((d) => d.account)).size,
    simulated: deposits.filter((d) => d.status === "in" && d.sim).length,
    simulatedTotal: deposits.filter((d) => d.status === "in" && d.sim).reduce((s, d) => s + d.amount, 0),
    simBasis: pool.sim?.basis ?? null,
    rows,
    legs: priced?.legs.map((l) => ({ symbol: l.symbol, label: l.label, eventTitle: l.eventTitle, side: l.side, price: l.price, weight: l.weight })) ?? [],
    mine: account
      ? deposits.filter((d) => d.account === account).map((d) => ({ ...d, payout: payouts[d.id] ?? null }))
      : [],
  };
}
export type PoolView = Awaited<ReturnType<typeof view>>;
