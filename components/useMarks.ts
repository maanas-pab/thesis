"use client";
import { useEffect, useState } from "react";
import { valueUnit } from "@/lib/math";
import type { Mark, Position } from "@/lib/types";

export type Marks = Record<string, Mark>;

/** Live quotes for every contract the positions hold, refreshed on a timer. */
export function useMarks(positions: Position[] | undefined, every = 30) {
  const [marks, setMarks] = useState<Marks | null>(null);
  const key = (positions ?? []).map((p) => p.id).join(",");
  useEffect(() => {
    if (!positions) return;
    if (!positions.length) {
      setMarks({});
      return;
    }
    let live = true;
    const legs = positions.flatMap((p) => p.legs.map((l) => ({ symbol: l.symbol, eventTicker: l.eventTicker, side: l.side })));
    const load = () =>
      fetch("/api/marks", { method: "POST", body: JSON.stringify({ legs }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => live && m && setMarks(m))
        .catch(() => {});
    load();
    const timer = setInterval(load, every * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
    // The set of positions is what matters, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, every]);
  return marks;
}

export type LegState = { symbol: string; label: string; side: "yes" | "no"; weight: number; price: number; entry: number; state: "open" | "hit" | "missed" | "unknown" };

/**
 * What a position is worth now, from quotes on the exact contracts it was bought with.
 * Settled legs count as $1 or $0. A leg that can't be quoted at all is carried at its entry price.
 */
export function worth(p: Position, marks: Marks | null) {
  let stale = 0;
  let settled = 0;
  const legs: LegState[] = p.legs.map((l) => {
    const m = marks?.[`${l.symbol}:${l.side}`];
    if (!m) stale++;
    else if (m.settled) settled++;
    const state = !m ? "unknown" : m.settled ? (m.price === 1 ? "hit" : "missed") : "open";
    return { symbol: l.symbol, label: l.label, side: l.side, weight: l.weight, price: m?.price ?? l.entry, entry: l.entry, state };
  });
  const unit = valueUnit(
    legs.map((l, i) => ({ weight: l.weight, price: l.price, bid: marks?.[`${p.legs[i].symbol}:${p.legs[i].side}`]?.bid ?? l.price })),
    p.kind,
    p.attach,
    p.corr,
  );
  const done = settled === p.legs.length;
  return { value: p.units * unit.mark, sell: p.units * unit.bid, best: p.units * unit.max, stale, settled, done, legs };
}
