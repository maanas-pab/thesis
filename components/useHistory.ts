"use client";
import { useEffect, useState } from "react";
import type { Point } from "@/lib/types";

const memo = new Map<string, Promise<Point[]>>();

export function useHistory(id: string, enabled = true) {
  const [points, setPoints] = useState<Point[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    if (!memo.has(id))
      memo.set(
        id,
        fetch(`/api/history/${id}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      );
    memo.get(id)!.then((p) => live && setPoints(p));
    return () => {
      live = false;
    };
  }, [id, enabled]);
  return points;
}

/** Change against the value roughly a day ago. */
export function dayChange(points: Point[] | null) {
  if (!points || points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = last.t - 86_400_000;
  const base = [...points].reverse().find((p) => p.t <= cutoff) ?? points[0];
  return last.v - base.v;
}
