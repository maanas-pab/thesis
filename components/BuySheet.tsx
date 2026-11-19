"use client";
import Link from "next/link";
import { useState } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import type { Story, TrancheKind } from "@/lib/types";
import { quote, usd } from "@/lib/math";
import { buy, useAccount } from "@/lib/store";

const KINDS: { kind: TrancheKind; label: string; line: string }[] = [
  { kind: "whole", label: "Whole", line: "Pays for every market that hits." },
  { kind: "safe", label: "Safe", line: "Paid first. Smaller gain, last to lose." },
  { kind: "bold", label: "Bold", line: "Paid after Safe. Bigger win, can go to zero." },
];
const CHIPS = [10, 20, 50, 100];

export default function BuySheet({ story }: { story: Story }) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TrancheKind>("whole");
  const [amount, setAmount] = useState("20");
  const [busy, setBusy] = useState(false);

  const i = KINDS.findIndex((k) => k.kind === kind);
  const q = quote(story, kind);
  const dollars = parseFloat(amount) || 0;
  const units = q.price > 0 ? dollars / q.price : 0;
  const maxPay = units * q.max;
  const gain = maxPay - dollars;
  // A side with no upside at the current spread is not sold.
  const closed = (k: TrancheKind) => { const x = quote(story, k); return x.price >= x.max - 0.001; };
  const lossChance = kind === "safe" ? story.tranches.safeLoss : kind === "bold" ? story.tranches.boldLoss : story.tranches.dist[0];
  const short = !!account && dollars > account.cash;
  const bad = dollars < 1 || short || closed(kind);

  async function confirm() {
    if (bad || busy) return;
    setBusy(true);
    // Stand-in for: move USDC, place the Gemini orders, mint the story token.
    await new Promise((r) => setTimeout(r, 700));
    const ok = buy({ storyId: story.id, storyName: story.name, kind, units, cost: dollars });
    setBusy(false);
    if (!ok) return toast.error("That didn't go through. Nothing was charged.");
    setOpen(false);
    toast.success(`Bought ${units.toFixed(1)} units of ${story.name}`, {
      description: `${KINDS[i].label} side for ${usd(dollars)}. You can get back up to ${usd(maxPay)}.`,
    });
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button className="btn wide">Buy this story</button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="overlay" />
        <Drawer.Content className="sheet">
          <div className="grab" />
          <Drawer.Title asChild>
            <h2>Buy {story.name}</h2>
          </Drawer.Title>
          <Drawer.Description className="sub">{KINDS[i].line}</Drawer.Description>

          <div className="seg" role="tablist" aria-label="Side">
            <div className="seg-row">
              {KINDS.map((k) => (
                <button key={k.kind} role="tab" aria-selected={k.kind === kind} disabled={closed(k.kind)} onClick={() => setKind(k.kind)}>
                  {k.label}
                </button>
              ))}
            </div>
            <div
              className="seg-active"
              aria-hidden
              style={{ clipPath: `inset(0 ${((2 - i) * 100) / 3}% 0 ${(i * 100) / 3}% round 9px)` }}
            >
              <div className="seg-row">
                {KINDS.map((k) => (
                  <span key={k.kind}>{k.label}</span>
                ))}
              </div>
            </div>
          </div>

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

          <div className="kv">
            <span>Price per unit</span>
            <span className="num">{usd(q.price)}</span>
          </div>
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
              <span className="btn-label">{busy ? "Buying" : `Buy for ${usd(dollars)}`}</span>
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
