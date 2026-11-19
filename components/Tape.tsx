"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Story } from "@/lib/types";
import { compactUsd } from "@/lib/math";

type Item = { id: string; name: string; index: number; vol: number };

/** A ticker tape of every story's index, refreshed each minute. */
export default function Tape() {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/stories")
        .then((r) => r.json())
        .then((all: Story[]) => {
          if (!live) return;
          setItems(all.sort((a, b) => b.volume24h - a.volume24h).map((s) => ({ id: s.id, name: s.name, index: s.index, vol: s.volume24h })));
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const row = (key: string, hidden?: boolean) => (
    <div className="tape-row" key={key} aria-hidden={hidden || undefined}>
      {items!.map((s) => (
        <Link key={s.id} href={`/s/${s.id}`} className="tape-item" tabIndex={hidden ? -1 : undefined}>
          <span className="tape-name">{s.name}</span>
          <span className="tape-idx">{s.index.toFixed(1)}</span>
          {s.vol > 0 && <span className="tape-sp">{compactUsd(s.vol)}</span>}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="tape" aria-label="Story index tape">
      {items?.length ? (
        // Two copies side by side so the loop has no seam; the speed scales with how many stories there are.
        <div className="tape-track" style={{ "--n": items.length } as React.CSSProperties}>
          {row("a")}
          {row("b", true)}
        </div>
      ) : (
        <div className="tape-row tape-wait">Loading the tape</div>
      )}
    </div>
  );
}
