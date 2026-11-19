"use client";
import Link from "next/link";
import { useState } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import type { Story, TrancheKind } from "@/lib/types";
import { CREATOR_FEE, quote, usd } from "@/lib/math";
import { positionFrom } from "@/lib/positions";
import { mintFor } from "@/lib/chain-client";
import { buy, placeOrder, useAccount } from "@/lib/store";

const CHIPS = [10, 20, 50, 100];

export default function BuySheet({ story }: { story: Story }) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  // Safe and Bold are now the tiered pool; buying now is always the whole basket.
  const kind: TrancheKind = "whole";
  const [amount, setAmount] = useState("20");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"now" | "limit">("now");
  const [limitCents, setLimitCents] = useState("");

  const q = quote(story, kind);
  const dollars = parseFloat(amount) || 0;
  // Community stories pay their creator a cut of each buy.
  const fee = story.community ? dollars * CREATOR_FEE : 0;
  const limit = (parseFloat(limitCents) || 0) / 100;
  // A limit at or above today's ask would fill right away, so it is just a buy.
  const resting = mode === "limit" && limit > 0 && limit < q.price;
  const unitPrice = resting ? limit : q.price;
  const units = unitPrice > 0 ? (dollars - fee) / unitPrice : 0;
  const maxPay = units * q.max;
  const gain = maxPay - dollars;
  // A side with no upside at the current spread is not sold.
  const closed = (k: TrancheKind) => { const x = quote(story, k); return x.price >= x.max - 0.001; };
  const lossChance = story.tranches.safeLoss;
  const short = !!account && dollars > account.cash;
  const bad = dollars < 1 || short || closed(kind) || (mode === "limit" && !(limit > 0));

  async function confirm() {
    if (bad || busy) return;
    setBusy(true);
    if (resting) {
      const ok = placeOrder({ storyId: story.id, storyName: story.name, kind, limit, dollars });
      setBusy(false);
      if (!ok) return toast.error("That didn't go through. Nothing was set aside.");
      setOpen(false);
      return toast.success(`Limit order placed on ${story.name}`, {
        description: `${usd(dollars)} is set aside and buys the basket if its price drops to ${Math.round(limit * 100)}¢. Cancel any time in Portfolio.`,
      });
    }
    const pos = positionFrom(story, kind, units, dollars);
    const id = buy(pos);
    setBusy(false);
    if (!id) return toast.error("That didn't go through. Nothing was charged.");
    mintFor(id, pos);
    if (story.community) fetch(`/api/community/${story.id}`, { method: "POST", body: JSON.stringify({ amount: dollars }) }).catch(() => {});
    setOpen(false);
    toast.success(`Bought ${units.toFixed(1)} units of ${story.name}`, {
      description: `$Whole basket for ${usd(dollars)}. You can get back up to ${usd(maxPay)}.`,
    });
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button className="btn wide">Buy the basket now</button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="overlay" />
        <Drawer.Content className="sheet">
          <div className="grab" />
          <Drawer.Title asChild>
            <h2>Buy {story.name} now</h2>
          </Drawer.Title>
          <Drawer.Description className="sub">Pays for every market that hits. Sell any time at the bid.</Drawer.Description>

          <label className="amount num">
            <span>$</span>
            <input
              inputMode="decimal"
              aria-label="Amount in dollars"
              value={amount}
              style={{ width: `${Math.max(amount.length, 1) + 0.2}ch` }}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))}
            />
          </label>
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c} className="chip num" aria-pressed={dollars === c} onClick={() => setAmount(String(c))}>
                ${c}
              </button>
            ))}
          </div>

          <div className="mode" role="group" aria-label="Order type">
            <button className="chip" aria-pressed={mode === "now"} onClick={() => setMode("now")}>
              Buy now
            </button>
            <button
              className="chip"
              aria-pressed={mode === "limit"}
              onClick={() => {
                setMode("limit");
                if (!limitCents) setLimitCents(String(Math.max(Math.round(q.price * 100) - 2, 1)));
              }}
            >
              Limit order
            </button>
            {mode === "limit" && (
              <label className="limit num">
                Buy if the price drops to
                <input inputMode="numeric" aria-label="Limit price in cents" value={limitCents} onChange={(e) => setLimitCents(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))} />¢
              </label>
            )}
          </div>
          <div className="kv">
            <span>{resting ? "Your limit per unit" : "Price per unit (ask)"}</span>
            <span className="num">{usd(unitPrice)}</span>
          </div>
          <div className="kv">
            <span>Sells back for (bid)</span>
            <span className="num">{usd(units * q.bid)}</span>
          </div>
          {story.community && (
            <div className="kv">
              <span>Creator fee (1%) to {story.community.creator}</span>
              <span className="num">{usd(fee)}</span>
            </div>
          )}
          <div className="kv">
            <span>You get</span>
            <span className="num">{units.toFixed(1)} units</span>
          </div>
          <div className="kv">
            <span>Most you can get back</span>
            <span className="num">{usd(maxPay)}</span>
          </div>
          <div className="kv">
            <span>Best-case profit</span>
            <span className="num" style={{ color: gain > 0 ? "var(--up)" : undefined }}>
              {gain >= 0 ? "+" : "−"}
              {usd(Math.abs(gain))}
            </span>
          </div>
          <div className="kv">
            <span>Chance of losing it all</span>
            <span className="num">{lossChance < 0.005 ? "under 1%" : `${Math.round(lossChance * 100)}%`}</span>
          </div>

          {account ? (
            <button className="btn wide" onClick={confirm} disabled={bad} data-busy={busy}>
              <span className="btn-label">{busy ? "Buying" : resting ? `Place limit order for ${usd(dollars)}` : `Buy for ${usd(dollars)}`}</span>
            </button>
          ) : (
            <Link className="btn wide" href={`/signin?next=/s/${story.id}`}>
              Sign in to buy
            </Link>
          )}
          <p className="err">{closed(kind) ? "This side has no upside at today\u2019s prices." : short ? `You have ${usd(account!.cash)} to spend.` : ""}</p>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
