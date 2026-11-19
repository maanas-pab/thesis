import type { Position, Story } from "./types";

/** Money riding on one market across all positions. */
export type Exposure = { eventTicker: string; title: string; dollars: number; positions: number; sides: Set<string> };

type Valued = { p: Position; value: number; legs: { symbol: string; label: string; side: "yes" | "no"; weight: number; price: number; state: string }[] };

/**
 * Split each position's value across its open markets in proportion to what each one
 * contributes (weight times price), then add up by market. This is the money that goes
 * if that market resolves against you. For Safe and Bold it is a rough guide, since
 * their payouts are not linear in each leg.
 */
export function exposures(rows: Valued[]) {
  const byEvent = new Map<string, Exposure>();
  const bySymbol = new Map<string, { label: string; count: number; sides: Set<string> }>();
  for (const r of rows) {
    const open = r.legs.filter((l) => l.state === "open" || l.state === "unknown");
    const total = open.reduce((s, l) => s + l.weight * l.price, 0);
    if (!total) continue;
    for (const l of open) {
      const ticker = l.symbol.replace(/^GEMI-/, "").split("-").slice(0, -1).join("-") || l.symbol;
      const title = l.label.split(":")[0];
      const dollars = (r.value * l.weight * l.price) / total;
      const e = byEvent.get(ticker) ?? { eventTicker: ticker, title, dollars: 0, positions: 0, sides: new Set<string>() };
      e.dollars += dollars;
      e.positions++;
      e.sides.add(`${l.symbol}:${l.side}`);
      byEvent.set(ticker, e);
      const s = bySymbol.get(l.symbol) ?? { label: l.label, count: 0, sides: new Set<string>() };
      s.count++;
      s.sides.add(l.side);
      bySymbol.set(l.symbol, s);
    }
  }
  const list = [...byEvent.values()].sort((a, b) => b.dollars - a.dollars);
  const shared = [...bySymbol.values()].filter((s) => s.count > 1);
  // The same contract held on both sides cancels itself out.
  const offsetting = shared.filter((s) => s.sides.size > 1);
  return { list, shared, offsetting };
}

/** Exposure share by theme (the story's group). */
export function themes(rows: Valued[], stories: Story[]) {
  const group = new Map(stories.map((s) => [s.id, s.group]));
  const out = new Map<string, number>();
  for (const r of rows) out.set(group.get(r.p.storyId) ?? "Other", (out.get(group.get(r.p.storyId) ?? "Other") ?? 0) + r.value);
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * The story that bets against the most of what you hold: full credit for the same contract
 * on the other side, half for a different contract in the same event on the other side.
 */
export function hedge(rows: Valued[], stories: Story[]) {
  const held = new Map<string, { side: string; dollars: number; event: string }>();
  for (const r of rows) {
    const total = r.legs.reduce((s, l) => s + l.weight * l.price, 0) || 1;
    for (const l of r.legs) {
      const prev = held.get(l.symbol);
      const dollars = (r.value * l.weight * l.price) / total;
      held.set(l.symbol, { side: l.side, dollars: (prev?.dollars ?? 0) + dollars, event: l.symbol.split("-").slice(0, -1).join("-") });
    }
  }
  const ownIds = new Set(rows.map((r) => r.p.storyId));
  let best: { story: Story; score: number; against: number } | null = null;
  for (const s of stories) {
    if (ownIds.has(s.id)) continue;
    let score = 0;
    let against = 0;
    for (const l of s.legs) {
      const same = held.get(l.symbol);
      if (same && same.side !== l.side) {
        score += same.dollars;
        against++;
        continue;
      }
      const ev = l.symbol.split("-").slice(0, -1).join("-");
      for (const h of held.values())
        if (h.event === ev && h.side === l.side && !same) {
          // Yes on a different outcome of the same event is a bet against the one you hold.
          score += h.dollars / 2;
          against++;
          break;
        }
    }
    if (score > 0 && (!best || score > best.score)) best = { story: s, score, against };
  }
  return best;
}
