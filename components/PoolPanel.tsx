"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { usd } from "@/lib/math";
import { joinPool, poolReturn, setPoolTier, useAccount, walletKeypair } from "@/lib/store";
import type { TierId } from "@/lib/pool-math";
import { countdown, tierName, usePool } from "./usePool";

const CHIPS = [10, 25, 50, 100, 250];
const time = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const pct = (p: number) => (p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const ret = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}%`;

/** The tiered pool for one story, laid out like an options chain. */
export default function PoolPanel({ storyId, storyName }: { storyId: string; storyName: string }) {
  const account = useAccount();
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState<string | null>(null);
  const { pool, reload } = usePool(storyId, amount);

  if (pool === undefined) return <section className="panel pool"><p className="sub">Loading the pool</p></section>;
  if (pool === null)
    return (
      <section className="panel pool">
        <h2>Tiered pool</h2>
        <p className="sub">No pool is open for this story right now. Game and weather pools open again when the next slate is listed.</p>
      </section>
    );

  const open = pool.status === "open";
  const inWindow = open && pool.now >= pool.windowStart;
  const mine = pool.mine.filter((d) => d.status === "in");
  const short = !!account && amount > account.cash;

  async function post(body: Record<string, unknown>) {
    const kp = await walletKeypair();
    const res = await fetch(`/api/pools/${encodeURIComponent(pool!.id)}`, { method: "POST", body: JSON.stringify({ ...body, account: kp?.publicKey.toBase58() }) }).catch(() => null);
    return res ? { ok: res.ok, ...(await res.json().catch(() => ({}))) } : { ok: false, error: "Couldn't reach the server." };
  }

  async function join(tier: TierId) {
    if (!account || busy || short) return;
    setBusy(tier);
    const out = await post({ action: "deposit", tier, amount });
    if (out.ok && out.depositId) {
      joinPool({ poolId: pool!.id, depositId: out.depositId, storyId, storyName, amount, tier, lockAt: pool!.lockAt });
      toast.success(`${usd(amount)} in ${tierName[tier]} of ${storyName}`, { description: `You can move tiers until the pool locks${inWindow ? "" : ", and withdraw until the last 30 minutes"}.` });
    } else toast.error(out.error ?? "That didn't go through.");
    setBusy(null);
    reload();
  }

  /** Move every deposit you hold in one tier to another. */
  async function move(from: TierId, to: TierId) {
    for (const d of mine.filter((x) => x.tier === from)) {
      const out = await post({ action: "move", depositId: d.id, tier: to });
      if (out.ok) setPoolTier(d.id, to);
      else {
        toast.error(out.error ?? "Couldn't move it.");
        break;
      }
    }
    reload();
  }

  /** Take back everything you hold in one tier. */
  async function withdraw(tier: TierId) {
    let back = 0;
    for (const d of mine.filter((x) => x.tier === tier)) {
      const out = await post({ action: "withdraw", depositId: d.id });
      if (!out.ok) {
        toast.error(out.error ?? "Couldn't withdraw.");
        break;
      }
      poolReturn(d.id, d.amount, "withdrawn");
      back += d.amount;
    }
    if (back) toast(`${usd(back)} is back in your cash`);
    reload();
  }

  const byTier = pool.rows
    .map((r) => ({ id: r.id, name: r.name, amount: mine.filter((d) => d.tier === r.id).reduce((s, d) => s + d.amount, 0), payout: mine.filter((d) => d.tier === r.id).reduce((s, d) => s + (d.payout ?? 0), 0) }))
    .filter((g) => g.amount > 0);

  return (
    <section className="panel pool">
      <div className="pool-head">
        <div>
          <h2>Tiered pool</h2>
          <p className="sub">
            Pick your target return. Everyone&apos;s money buys this basket, and it pays out down the line: Tier 1 first, Uncapped gets whatever is left.
          </p>
        </div>
        <div className="pool-status num">
          {open ? (
            <>
              <b>Locks in {countdown(pool.windowStart - pool.now)}{inWindow ? " or less" : ""}</b>
              <span>
                at a random moment {time.format(pool.windowStart)} to {time.format(pool.lockAt)}
              </span>
            </>
          ) : pool.status === "locked" ? (
            <>
              <b>Locked {pool.lockedAt ? time.format(pool.lockedAt) : ""}</b>
              <span>Waiting for the markets to resolve</span>
            </>
          ) : pool.status === "settled" ? (
            <>
              <b>Settled</b>
              <span>The basket paid {usd(pool.payoutPerUnit ?? 0)} per unit</span>
            </>
          ) : (
            <>
              <b>{pool.status === "void" ? "Refunded" : "Closed empty"}</b>
              <span>{pool.status === "void" ? "The markets couldn't be bought at lock" : "Nobody joined before it locked"}</span>
            </>
          )}
          <span className="muted">
            {usd(pool.total)} in the pool
            {pool.people > 0 && ` · ${pool.people} ${pool.people === 1 ? "person" : "people"}`}
            {pool.simulated > 0 && ` · ${pool.simulated} simulated`}
          </span>
        </div>
      </div>

      {open && (
        <div className="pool-amount">
          <span className="muted">Your amount</span>
          {CHIPS.map((c) => (
            <button key={c} className="chip num" aria-pressed={amount === c} onClick={() => setAmount(c)}>
              ${c}
            </button>
          ))}
        </div>
      )}

      <div className="chain-wrap">
        <table className="chain num">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="r">Target</th>
              <th className="r">Paid</th>
              <th className="r">In pool</th>
              <th className="r">{open ? "If you join: paid in full" : "Paid in full"}</th>
              <th className="r">Likely result</th>
              {open && <th />}
            </tr>
          </thead>
          <tbody>
            {pool.rows.map((r, i) => {
              const you = mine.filter((d) => d.tier === r.id).reduce((s, d) => s + d.amount, 0);
              return (
                <tr key={r.id} data-tier={r.id}>
                  <td>
                    <span className="tier-dot" style={{ opacity: 0.35 + i * 0.16 }} />
                    {r.name}
                    {you > 0 && <span className="you">You {usd(you)}</span>}
                  </td>
                  <td className="r">{r.target == null ? "All leftover" : `+${Math.round(r.target * 100)}%`}</td>
                  <td className="r muted">{r.target == null ? "Last" : ["1st", "2nd", "3rd", "4th"][i]}</td>
                  <td className="r">{usd(r.inPool)}</td>
                  <td className="r">
                    {r.stat ? pct(r.stat.chanceFull) : "–"}
                    {r.target == null && r.stat && <span className="cell-note">of a profit</span>}
                  </td>
                  <td className={`r ${r.stat ? (r.stat.likely >= 0 ? "up" : "down") : ""}`}>{r.stat ? ret(r.stat.likely) : "–"}</td>
                  {open && (
                    <td className="r">
                      {account ? (
                        <button className="btn sm" disabled={!!busy || short} data-busy={busy === r.id} onClick={() => join(r.id)}>
                          <span className="btn-label">Join</span>
                        </button>
                      ) : (
                        <Link className="btn sm ghost" href={`/signin?next=/s/${storyId}`}>
                          Sign in
                        </Link>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {short && <p className="err" style={{ textAlign: "left" }}>You have {usd(account!.cash)} to spend.</p>}

      {mine.length > 0 && (
        <div className="pool-mine">
          <h3>Your deposits</h3>
          {byTier.map((g) => (
            <div className="kv" key={g.id}>
              <span>
                {usd(g.amount)} in {g.name}
                {pool.status === "settled" && <b className={g.payout >= g.amount ? "up" : "down"}> · pays {usd(g.payout)}</b>}
              </span>
              {open ? (
                <span className="pool-actions">
                  <select className="field select sm" aria-label={`Move ${g.name} money to`} value={g.id} onChange={(e) => move(g.id, e.target.value as TierId)}>
                    {pool.rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {!inWindow && (
                    <button className="linkish" onClick={() => withdraw(g.id)}>
                      Withdraw
                    </button>
                  )}
                </span>
              ) : (
                <Link className="linkish" href="/portfolio">
                  In your portfolio
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="note">
        {pool.simulated > 0 &&
          `Demo: ${usd(pool.simulatedTotal)} of this pool comes from ${pool.simulated} simulated depositors, sized from Gemini's last-day volume in these markets${pool.simBasis ? ` (${usd(pool.simBasis)})` : ""}. They arrive over time and pick tiers from the live odds, like people would. `}
        {open
          ? `Odds update as people join. "If you join" shows your odds with your ${usd(amount)} added to that tier. Likely result is the middle outcome: half the time you do at least this well. Move tiers any time before lock; withdrawals close when the random window starts. Deposits after the random close are refunded. If nobody holds Uncapped, the leftover is shared across the tiers.`
          : `Odds are from live prices on the markets inside. The pool bought ${pool.units?.toFixed(1) ?? "–"} units at ${pool.ask ? `${Math.round(pool.ask * 100)}¢` : "–"} each.`}{" "}
        Fair close: the random moment was fixed when the pool opened and published as{" "}
        <span className="mono" title={pool.commit}>
          sha256 {pool.commit.slice(0, 10)}…
        </span>
        {pool.seed ? (
          <>
            {", "}revealed as <span className="mono" title={pool.seed}>{pool.seed.slice(0, 10)}…</span>
          </>
        ) : (
          ", revealed at lock"
        )}
        .
      </p>
    </section>
  );
}
