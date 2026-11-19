"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { quote, usd } from "@/lib/math";
import { sell, signOut, useAccount } from "@/lib/store";
import type { Position, Story } from "@/lib/types";

const SIDE = { whole: "Whole", safe: "Safe", bold: "Bold" } as const;

export default function Portfolio() {
  const account = useAccount();
  const [stories, setStories] = useState<Story[] | null>(null);
  useEffect(() => {
    fetch("/api/stories")
      .then((r) => r.json())
      .then(setStories)
      .catch(() => setStories([]));
  }, []);

  if (account === undefined) return null;
  if (!account)
    return (
      <div className="empty-state">
        <p>Sign in to see what you hold.</p>
        <Link href="/signin?next=/portfolio" className="btn">
          Sign in
        </Link>
      </div>
    );

  const value = (p: Position) => {
    const s = stories?.find((x) => x.id === p.storyId);
    // A story that has settled or can't be priced is carried at cost.
    return s ? p.units * quote(s, p.kind).mark : p.cost;
  };
  const held = account.positions.reduce((s, p) => s + value(p), 0);
  const cost = account.positions.reduce((s, p) => s + p.cost, 0);
  const gain = held - cost;

  return (
    <>
      <h1 className="page-title">Portfolio</h1>
      <div className="stats">
        <div className="stat">
          <span>Stories</span>
          <b className="num">{usd(held)}</b>
        </div>
        <div className="stat">
          <span>Gain or loss</span>
          <b className={`num ${gain >= 0 ? "up" : "down"}`}>
            {gain >= 0 ? "+" : "−"}
            {usd(Math.abs(gain))}
          </b>
        </div>
        <div className="stat">
          <span>Cash to spend</span>
          <b className="num">{usd(account.cash)}</b>
        </div>
      </div>

      {account.positions.length ? (
        <div className="rows">
          {account.positions.map((p) => {
            const v = value(p);
            const g = v - p.cost;
            return (
              <div className="row" key={p.id}>
                <Link href={`/s/${p.storyId}`} className="grow">
                  <div className="name">{p.storyName}</div>
                  <div className="muted num" style={{ fontSize: 13 }}>
                    {SIDE[p.kind]} · {p.units.toFixed(1)} units · paid {usd(p.cost)}
                  </div>
                </Link>
                <div className="right num">
                  <div>{usd(v)}</div>
                  <div className={g >= 0 ? "up" : "down"} style={{ fontSize: 13 }}>
                    {g >= 0 ? "+" : "−"}
                    {usd(Math.abs(g))}
                  </div>
                </div>
                <button
                  className="btn sm ghost"
                  disabled={!stories}
                  onClick={() => {
                    sell(p.id, v);
                    toast(`Sold ${p.storyName}`, { description: `${usd(v)} is back in your cash.` });
                  }}
                >
                  Sell
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p>You don't hold any stories yet.</p>
          <Link href="/" className="btn">
            Browse stories
          </Link>
        </div>
      )}

      <p className="note" style={{ marginTop: 28 }}>
        Signed in as {account.email}. Demo wallet <span className="mono">{account.wallet.slice(0, 4)}…{account.wallet.slice(-4)}</span>.{" "}
        <button onClick={signOut} style={{ background: "none", border: 0, textDecoration: "underline", cursor: "pointer", color: "inherit" }}>
          Sign out
        </button>
      </p>
    </>
  );
}
