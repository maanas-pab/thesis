"use client";
import { useCallback, useEffect, useState } from "react";
import type { PoolView } from "@/lib/pools";
import { poolReturn, setPoolTier, useAccount } from "@/lib/store";

/**
 * Bring this browser's record of pool deposits in line with the server: a deposit made after
 * the random close is refunded, a move made after it is undone.
 */
export function reconcile(views: PoolView[]) {
  for (const v of views)
    for (const d of v.mine) {
      if (d.status === "refunded") poolReturn(d.id, d.amount, "refunded");
      else if (d.status === "in") setPoolTier(d.id, d.tier);
    }
}

/** The open pool for a story, refreshed every 15 seconds. */
export function usePool(storyId: string, amount: number) {
  const account = useAccount();
  const wallet = account?.wallet;
  const [pool, setPool] = useState<PoolView | null | undefined>(undefined);
  const load = useCallback(async () => {
    const q = new URLSearchParams({ story: storyId, amount: String(amount || 20) });
    if (wallet) q.set("account", wallet);
    const v: PoolView | null = await fetch(`/api/pools?${q}`)
      .then((r) => r.json())
      .catch(() => null);
    setPool(v);
    if (v) reconcile([v]);
  }, [storyId, amount, wallet]);
  useEffect(() => {
    const first = setTimeout(load, 250);
    const timer = setInterval(load, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  return { pool, reload: load };
}

export const tierName = { t1: "Tier 1", t2: "Tier 2", t3: "Tier 3", t4: "Tier 4", u: "Uncapped" } as const;

export function countdown(ms: number) {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}
