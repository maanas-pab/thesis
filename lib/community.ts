import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATA_DIR } from "./data-dir";
import path from "node:path";
import { getEvent } from "./gemini";
import { COMMUNITY_PRIOR, finish, toLeg } from "./stories";
import { corrNow } from "./corr";
import { CREATOR_FEE, priceTranches } from "./math";
import type { Leg, LegPick, Story } from "./types";

/**
 * Stories people build. Kept on the server so everyone sees them, in a local file like the
 * price recorder. On a host with no lasting disk they live only as long as the server.
 */
const FILE = path.join(DATA_DIR, "community.json");
export const MAX_WEIGHT = 5;

export type CommunityDef = {
  id: string;
  name: string;
  blurb: string;
  creator: string;
  createdAt: number;
  startIndex: number;
  thesis?: string;
  legs: LegPick[];
};
export type Stats = { volume: number; fees: number; buys: number };
type Book = { stories: CommunityDef[]; stats: Record<string, Stats> };

const g = globalThis as unknown as { __community?: Book };

function book(): Book {
  if (!g.__community) {
    try {
      g.__community = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      g.__community = { stories: [], stats: {} };
    }
  }
  return g.__community!;
}

function save() {
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(book(), null, 1));
  } catch {
    // No writable disk: keep it in memory.
  }
}

export const stats = (id: string): Stats => book().stats[id] ?? { volume: 0, fees: 0, buys: 0 };
export const defs = () => book().stories;

/** Price a set of picks from live quotes. Returns null when fewer than five can be priced. */
export async function priceLegs(
  picks: LegPick[],
  meta: { id: string; name: string; blurb: string },
  community?: Story["community"],
  prior = COMMUNITY_PRIOR,
): Promise<Story | null> {
  const legs: Leg[] = [];
  const weights: number[] = [];
  for (const p of picks) {
    const e = await getEvent(p.eventTicker);
    const c = e?.contracts.find((x) => x.instrumentSymbol === p.symbol);
    const leg = e && c ? toLeg(e, c, p.side) : null;
    if (!leg) continue;
    legs.push(leg);
    weights.push(Math.min(Math.max(p.weight || 1, 0.1), MAX_WEIGHT));
  }
  const s = finish({ ...meta, group: "Community", settles: settles(legs.map((l) => l.eventTicker)) }, legs, weights);
  if (!s) return null;
  // Re-price with the correlation prior for hand-picked baskets.
  s.tranches = priceTranches(
    s.legs.map((l) => l.price),
    s.legs.map((l) => l.weight),
    Math.max(s.buyPrice - s.index / 100, 0),
    corrNow(s.legs, prior),
  );
  if (community) s.community = community;
  return s;
}

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
const expiries = new Map<string, number>();
function settles(tickers: string[]) {
  const ts = tickers.map((t) => expiries.get(t)).filter((x): x is number => !!x);
  return ts.length ? `By ${dayFmt.format(Math.max(...ts))}` : "Varies";
}

async function learnExpiries(picks: LegPick[]) {
  await Promise.all(
    picks.map(async (p) => {
      if (expiries.has(p.eventTicker)) return;
      const e = await getEvent(p.eventTicker);
      const t = Date.parse(e?.expiryDate ?? "");
      if (Number.isFinite(t)) expiries.set(p.eventTicker, t);
    }),
  );
}

export async function buildOne(d: CommunityDef) {
  await learnExpiries(d.legs);
  const reasons = Object.fromEntries(d.legs.filter((l) => l.reason).map((l) => [l.symbol, l.reason!]));
  return priceLegs(d.legs, d, {
    creator: d.creator,
    createdAt: d.createdAt,
    startIndex: d.startIndex,
    thesis: d.thesis,
    reasons: Object.keys(reasons).length ? reasons : undefined,
  });
}

export async function buildAll(): Promise<Story[]> {
  const out = await Promise.all(defs().map((d) => buildOne(d).catch(() => null)));
  return out.filter((s): s is Story => !!s);
}

export async function preview(picks: LegPick[]) {
  await learnExpiries(picks);
  return priceLegs(picks, { id: "preview", name: "Preview", blurb: "" });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "story";

export async function publish(input: { name: string; blurb: string; creator: string; thesis?: string; legs: LegPick[] }) {
  const name = input.name.trim().slice(0, 60);
  const creator = input.creator.trim().slice(0, 30);
  if (!name || !creator) return { error: "Give the story a name and say who made it." };
  const legs = input.legs.slice(0, 8).map((l) => ({
    eventTicker: String(l.eventTicker),
    symbol: String(l.symbol),
    side: l.side === "no" ? ("no" as const) : ("yes" as const),
    weight: Math.min(Math.max(Number(l.weight) || 1, 0.1), MAX_WEIGHT),
    reason: l.reason ? String(l.reason).slice(0, 200) : undefined,
  }));
  const priced = await preview(legs);
  if (!priced) return { error: "At least five of the markets need a live price." };
  const def: CommunityDef = {
    id: `c-${slug(name)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    blurb: input.blurb.trim().slice(0, 160) || "A story built by the community.",
    creator,
    createdAt: Date.now(),
    startIndex: priced.index,
    thesis: input.thesis?.trim().slice(0, 300) || undefined,
    // Only legs that could be priced are kept.
    legs: legs.filter((l) => priced.legs.some((p) => p.symbol === l.symbol)),
  };
  book().stories.unshift(def);
  save();
  return { id: def.id };
}

/** Record a buy of a community story, and the creator's cut of it. */
export function recordTrade(id: string, amount: number) {
  if (!defs().some((d) => d.id === id) || !(amount > 0) || amount > 1e6) return null;
  const s = (book().stats[id] ??= { volume: 0, fees: 0, buys: 0 });
  s.volume += amount;
  s.fees += amount * CREATOR_FEE;
  s.buys += 1;
  save();
  return s;
}
