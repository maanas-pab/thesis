"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PoolView } from "@/lib/pools";
import { usd } from "@/lib/math";
import { poolReturn, type Account } from "@/lib/store";
import type { PoolHolding } from "@/lib/types";
import { countdown, reconcile, tierName } from "./usePool";

const pct = (p: number) => (p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

/** Live state of every pool this account has money in. Reports their total value upward. */
export function usePoolViews(account: Account | null | undefined) {
  const [views, setViews] = useState<PoolView[] | null>(null);
  const ids = [...new Set((account?.pools ?? []).filter((h) => !h.done).map((h) => h.poolId))].join(",");
  const wallet = account?.wallet;
  useEffect(() => {
    if (!ids || !wallet) {
      setViews([]);
      return;
    }
    let live = true;
    const load = () =>
      fetch(`/api/pools?ids=${encodeURIComponent(ids)}&account=${wallet}`)
        .then((r) => r.json())
        .then((v: PoolView[]) => {
          if (!live) return;
          setViews(v);
          reconcile(v);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [ids, wallet]);
  return views;
}

/** What a holding is worth now: its deposit while open, the expected payout once locked, the payout once settled. */
export function holdingValue(account: Account, views: PoolView[] | null) {
  let total = 0;
  for (const h of account.pools ?? []) {
    if (h.done) continue;
    const v = views?.find((x) => x.id === h.poolId);
    const d = v?.mine.find((x) => x.id === h.depositId);
    if (v?.status === "settled" || v?.status === "void") total += d?.payout ?? h.amount;
    else if (v?.status === "locked") {
      const row = v.rows.find((r) => r.id === h.tier);
      total += h.amount * (1 + (row?.stat?.expected ?? 0));
    } else total += h.amount;
  }
  return total;
}

export default function PoolHoldings({ account, views }: { account: Account; views: PoolView[] | null }) {
  // One line per pool and tier, however many separate deposits made it up.
  const groups = new Map<string, PoolHolding[]>();
  for (const h of (account.pools ?? []).filter((x) => !x.done)) {
    const k = `${h.poolId}|${h.tier}`;
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  if (!groups.size) return null;
  const open = [...groups.values()].map((hs) => ({ ...hs[0], amount: hs.reduce((s, x) => s + x.amount, 0), all: hs }));
  return (
    <section className="panel reveal">
      <h2>
        Pools. <span>Your tiers, paid in order.</span>
      </h2>
      {open.map((h) => {
        const v = views?.find((x) => x.id === h.poolId);
        const mine = v?.mine.filter((x) => h.all.some((y) => y.depositId === x.id)) ?? [];
        const row = v?.rows.find((r) => r.id === h.tier);
        const payout = mine.length && mine.every((x) => x.payout != null) ? mine.reduce((s, x) => s + (x.payout ?? 0), 0) : null;
        return (
          <div className="kv pool-row" key={`${h.poolId}|${h.tier}`}>
            <span>
              <Link href={`/s/${h.storyId}`}>{h.storyName}</Link> · {usd(h.amount)} in {tierName[h.tier]}
              <span className="q muted" style={{ display: "block" }}>
                {!v
                  ? "Loading"
                  : v.status === "open"
                    ? `Open · locks in ${countdown(v.windowStart - v.now)}${v.now >= v.windowStart ? " or less" : ""} · move tiers on the story page`
                    : v.status === "locked"
                      ? `Locked · ${row?.stat ? `${pct(row.stat.chanceFull)} chance paid in full, likely ${row.stat.likely >= 0 ? "+" : "−"}${Math.abs(row.stat.likely * 100).toFixed(1)}%` : "waiting for prices"}`
                      : v.status === "settled"
                        ? `Settled · ${Object.values(v.hits ?? {}).filter(Boolean).length} of ${Object.keys(v.hits ?? {}).length} markets hit`
                        : v.status === "void"
                          ? "The markets couldn't be bought at lock, so everyone is refunded"
                          : "Closed"}
              </span>
            </span>
            {(v?.status === "settled" || v?.status === "void") && payout != null ? (
              <button
                className="btn sm"
                onClick={() => {
                  let got = 0;
                  for (const x of mine) if (poolReturn(x.id, x.payout ?? 0, "collected")) got += x.payout ?? 0;
                  if (got)
                    toast.success(`Collected ${usd(payout)} from ${h.storyName}`, { description: `${payout >= h.amount ? "+" : "−"}${usd(Math.abs(payout - h.amount))} on ${usd(h.amount)}.` });
                }}
              >
                Collect {usd(payout)}
              </button>
            ) : (
              <span className="num muted">{usd(h.amount)}</span>
            )}
          </div>
        );
      })}
      <p className="note">Pools pay out down the tiers once every market resolves. Open pools are valued at your deposit, locked ones at their expected payout.</p>
    </section>
  );
}
