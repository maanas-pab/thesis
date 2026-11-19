"use client";
import { useEffect, useState } from "react";
import type { History, Point, Range } from "@/lib/types";

const memo = new Map<string, { at: number; data: Promise<History> }>();
const EMPTY: History = { points: [], movers: [] };

export function useHistory(id: string, range: Range = "1w", enabled = true) {
  const [state, setState] = useState<{ key: string; data: History } | null>(null);
  const key = `${id}/${range}`;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => {
      const hit = memo.get(key);
      // Reuse a recent answer so a page of cards doesn't ask twice.
      if (!hit || Date.now() - hit.at > 60_000)
        memo.set(key, {
          at: Date.now(),
          data: fetch(`/api/history/${id}?range=${range}`)
            .then((r) => (r.ok ? r.json() : EMPTY))
            .catch(() => EMPTY),
        });
      memo.get(key)!.data.then((data) => live && setState({ key, data }));
    };
    load();
    // New 5-minute bars arrive while the page is open.
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, range, key, enabled]);
  return state?.key === key ? state.data : null;
}

/** Change between the first and last point. */
export function change(points: Point[] | null | undefined) {
  if (!points || points.length < 2) return null;
  return points[points.length - 1].v - points[0].v;
}

/** Change against the value roughly a day ago. */
export function dayChange(points: Point[] | null | undefined) {
  if (!points || points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = last.t - 86_400_000;
  const base = [...points].reverse().find((p) => p.t <= cutoff) ?? points[0];
  return last.v - base.v;
}
