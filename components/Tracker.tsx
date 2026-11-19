"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CREATOR_FEE, quote, usd } from "@/lib/math";
import { mintFor } from "@/lib/chain-client";
import { positionFrom } from "@/lib/positions";
import { fillOrder, removeAlert, snap, useAccount } from "@/lib/store";
import type { Story } from "@/lib/types";
import { useMarks, worth } from "./useMarks";

function notify(title: string, body: string) {
  toast(title, { description: body, duration: 10_000 });
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification(title, { body });
  } catch {}
}

/**
 * Runs on every page while the app is open: records account value once a minute,
 * fires price alerts, and fills limit orders when the price comes down to them.
 */
export default function Tracker() {
  const account = useAccount();
  const marks = useMarks(account?.positions, 60);
  const held = useRef<string | null>(null);

  useEffect(() => {
    if (!account || !marks) return;
    const key = account.positions.map((p) => p.id).join(",");
    const traded = held.current !== null && held.current !== key;
    held.current = key;
    // Pools are counted at their deposit here; the portfolio page values them more closely.
    const pooled = (account.pools ?? []).filter((h) => !h.done).reduce((s, h) => s + h.amount, 0);
    const reserved = (account.orders ?? []).reduce((s, o) => s + o.dollars, 0);
    snap(account.cash + pooled + reserved + account.positions.reduce((s, p) => s + worth(p, marks).value, 0), traded);
  }, [account, marks]);

  const watching = [...(account?.alerts ?? []).map((a) => a.id), ...(account?.orders ?? []).map((o) => o.id)].join(",");
  useEffect(() => {
    if (!account || !watching) return;
    let live = true;
    async function check() {
      const stories: Story[] = await fetch("/api/stories")
        .then((r) => r.json())
        .catch(() => []);
      if (!live || !account) return;
      const by = new Map(stories.map((s) => [s.id, s]));
      for (const a of account.alerts ?? []) {
        const s = by.get(a.storyId);
        if (!s) continue;
        if ((a.dir === "above" && s.index >= a.level) || (a.dir === "below" && s.index <= a.level)) {
          removeAlert(a.id);
          notify(`${s.name} is at ${s.index.toFixed(1)}`, `It went ${a.dir} your alert at ${a.level.toFixed(1)}.`);
        }
      }
      for (const o of account.orders ?? []) {
        const s = by.get(o.storyId);
        if (!s) continue;
        const q = quote(s, o.kind);
        if (q.price > o.limit || q.price >= q.max - 0.001) continue;
        const fee = s.community ? o.dollars * CREATOR_FEE : 0;
        const units = (o.dollars - fee) / q.price;
        const pos = positionFrom(s, o.kind, units, o.dollars);
        const pid = fillOrder(o.id, pos);
        if (pid) {
          mintFor(pid, pos);
          if (s.community) fetch(`/api/community/${s.id}`, { method: "POST", body: JSON.stringify({ amount: o.dollars }) }).catch(() => {});
          notify(`Limit order filled: ${s.name}`, `${units.toFixed(1)} units at ${Math.round(q.price * 100)}¢ for ${usd(o.dollars)}.`);
        }
      }
    }
    check();
    const timer = setInterval(check, 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
    // Re-arm only when the set of alerts or orders changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);
  return null;
}
