"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Chart, { Ranges } from "@/components/Chart";
import PoolHoldings, { holdingValue, usePoolViews } from "@/components/PoolHoldings";
import { useMarks, worth } from "@/components/useMarks";
import { burnFor } from "@/lib/chain-client";
import { cents, usd } from "@/lib/math";
import { exposures, hedge, themes } from "@/lib/risk";
import { cancelOrder, removeAlert, sell, signOut, snap, START_CASH, useAccount } from "@/lib/store";
import type { Point, Story } from "@/lib/types";

const SIDE = { whole: "Whole", safe: "Safe", bold: "Bold" } as const;
const SPANS = [
  { id: "1h", label: "1H", ms: 3_600_000 },
  { id: "1d", label: "1D", ms: 86_400_000 },
  { id: "all", label: "All", ms: Infinity },
] as const;
type Span = (typeof SPANS)[number]["id"];
const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
const pct = (n: number, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;
const STATE = { open: "", hit: "Hit", missed: "Missed", unknown: "No quote" } as const;

export default function Portfolio() {
  const account = useAccount();
  const marks = useMarks(account?.positions, 20);
  const [span, setSpan] = useState<Span>("all");
  const [shown, setShown] = useState<Point | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  useEffect(() => {
    fetch("/api/stories")
      .then((r) => r.json())
      .then(setStories)
      .catch(() => {});
  }, []);

  const rows = useMemo(() => (account?.positions ?? []).map((p) => ({ p, ...worth(p, marks) })), [account, marks]);
  const held = rows.reduce((s, r) => s + r.value, 0);
  const reserved = (account?.orders ?? []).reduce((s, o) => s + o.dollars, 0);
  const poolViews = usePoolViews(account);
  const inPools = account ? holdingValue(account, poolViews) : 0;
  const total = (account?.cash ?? 0) + held + reserved + inPools;

  // Keep the graph's last point on the live value.
  useEffect(() => {
    if (account && marks) snap(total);
  }, [account, marks, total]);

  const risk = useMemo(() => (rows.length && marks ? exposures(rows) : null), [rows, marks]);
  const hedgeIdea = useMemo(() => (rows.length && stories.length ? hedge(rows, stories) : null), [rows, stories]);
  const byTheme = useMemo(() => (rows.length && stories.length ? themes(rows, stories) : []), [rows, stories]);

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

  const cost = rows.reduce((s, r) => s + r.p.cost, 0);
  const best = rows.reduce((s, r) => s + r.best, 0);
  const allTime = total - START_CASH;
  const since = Date.now() - SPANS.find((s) => s.id === span)!.ms;
  const points = marks ? [...account.history.filter((h) => h.t >= since), { t: Date.now(), v: total }] : null;
  const chg = points && points.length > 1 ? points[points.length - 1].v - points[0].v : 0;
  const top = risk?.list[0];

  return (
    <>
      <span className="eyebrow rise page-eyebrow">Portfolio</span>
      <div className="readout">
        <span className="idx num">{usd(shown?.v ?? total)}</span>
        {shown ? (
          <span className="when num">{fmt.format(shown.t)}</span>
        ) : (
          <span className={`num ${allTime >= 0 ? "up" : "down"}`}>
            {money(allTime)} ({pct((allTime / START_CASH) * 100, 2)}) all time
          </span>
        )}
        <Ranges value={span} options={[...SPANS]} onChange={setSpan} />
      </div>
      <Chart key={span} points={points} up={chg >= 0} onHover={setShown} label="Account value" empty="Your account value is recorded every minute while the app is open." />
      <p className="chart-note">Cash, money in pools and limit orders, and every position at its live mid price, recorded once a minute while the app is open.</p>

      <div className="specs reveal">
        <div>
          <span>In stories and pools</span>
          <b className="num">{usd(held + inPools)}</b>
        </div>
        <div>
          <span>Gain on open positions</span>
          <b className={`num ${held - cost >= 0 ? "up" : "down"}`}>{money(held - cost)}</b>
        </div>
        <div>
          <span>Cash to spend</span>
          <b className="num">{usd(account.cash)}</b>
        </div>
        <div>
          <span>Most the positions can pay</span>
          <b className="num">{usd(best)}</b>
        </div>
      </div>

      <h2 className="shead-h reveal">
        Positions. <span>Valued at the live mid.</span>
      </h2>
      {rows.length || (account.pools ?? []).some((h) => !h.done) ? (
        <div className="rows">
          {rows.map(({ p, value, sell: proceeds, best: topPay, stale, settled, done, legs }) => {
            const g = value - p.cost;
            return (
              <div className="row position" key={p.id}>
                <div className="row-main">
                  <Link href={`/s/${p.storyId}`} className="grow">
                    <div className="name">
                      {p.storyName}
                      {done && <span className="tag yes" style={{ marginLeft: 8 }}>Settled</span>}
                    </div>
                    <div className="muted num" style={{ fontSize: 13 }}>
                      {SIDE[p.kind]} · {p.units.toFixed(1)} units · paid {usd(p.cost)} · pays up to {usd(topPay)}
                      {settled > 0 && !done && ` · ${settled} of ${p.legs.length} markets settled`}
                      {stale > 0 && ` · ${stale} without a quote, held at entry`}
                    </div>
                    {p.chain && (
                      <a className="chain-link" href={p.chain.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        Token on Solana devnet
                      </a>
                    )}
                    {total > 0 && (
                      <div className="alloc" aria-hidden>
                        <b style={{ width: `${Math.min((value / total) * 100, 100)}%` }} />
                      </div>
                    )}
                  </Link>
                  <div className="right num">
                    <div>{usd(value)}</div>
                    <div className={g >= 0 ? "up" : "down"} style={{ fontSize: 13 }}>
                      {money(g)} ({pct(p.cost ? (g / p.cost) * 100 : 0)})
                    </div>
                  </div>
                  {done ? (
                    <button
                      className="btn sm"
                      onClick={() => {
                        sell(p.id, value, "settled");
                        burnFor(p);
                        toast.success(`Collected ${usd(value)} from ${p.storyName}`, { description: `${legs.filter((l) => l.state === "hit").length} of ${legs.length} markets hit (${money(value - p.cost)}).` });
                      }}
                    >
                      Collect {usd(value)}
                    </button>
                  ) : (
                    <button
                      className="btn sm ghost"
                      disabled={!marks}
                      onClick={() => {
                        sell(p.id, proceeds);
                        burnFor(p);
                        toast(`Sold ${p.storyName}`, { description: `${usd(proceeds)} at the bid is back in your cash (${money(proceeds - p.cost)}).` });
                      }}
                    >
                      Sell {usd(proceeds)}
                    </button>
                  )}
                </div>
                <details className="legs-detail">
                  <summary>Markets inside</summary>
                  {legs.map((l) => (
                    <div className="kv" key={l.symbol}>
                      <span>
                        <span className={`tag ${l.side}`}>{l.side === "yes" ? "Yes" : "No"}</span>{" "}
                        {l.label}
                        {l.state !== "open" && <span className={`state ${l.state}`}>{STATE[l.state]}</span>}
                      </span>
                      <span className="num">
                        {cents(l.entry)} → {cents(l.price)}
                      </span>
                    </div>
                  ))}
                </details>
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

      <PoolHoldings account={account} views={poolViews} />

      {(account.orders?.length ?? 0) > 0 && (
        <section className="panel reveal">
          <h2>
            Orders. <span>Waiting for your price.</span>
          </h2>
          {account.orders!.map((o) => (
            <div className="kv" key={o.id}>
              <span>
                <Link href={`/s/${o.storyId}`}>{o.storyName}</Link> · {SIDE[o.kind]} · {usd(o.dollars)} at {Math.round(o.limit * 100)}¢ or less
              </span>
              <button className="linkish" onClick={() => cancelOrder(o.id)}>
                Cancel
              </button>
            </div>
          ))}
          <p className="note">Orders are checked every 30 seconds while Thesis is open in this browser.</p>
        </section>
      )}

      {(account.alerts?.length ?? 0) > 0 && (
        <section className="panel reveal">
          <h2>
            Alerts. <span>We'll tell you.</span>
          </h2>
          {account.alerts!.map((a) => (
            <div className="kv" key={a.id}>
              <span>
                <Link href={`/s/${a.storyId}`}>{a.storyName}</Link> {a.dir} {a.level.toFixed(1)}
              </span>
              <button className="linkish" onClick={() => removeAlert(a.id)}>
                Remove
              </button>
            </div>
          ))}
        </section>
      )}

      {risk && top && held > 0 && (
        <section className="panel reveal">
          <h2>
            Risk. <span>Where your money rides.</span>
          </h2>
          <p className="risk-lead">
            <b>{top.dollars / total < 0.01 ? "Under 1%" : `${Math.round((top.dollars / total) * 100)}%`}</b> of your account rides on <b>{top.title}</b>. If it goes against you, you lose about{" "}
            {usd(top.dollars)}.
          </p>
          <div className="risk-bars">
            {risk.list.slice(0, 6).map((e) => (
              <div className="risk-bar num" key={e.eventTicker}>
                <span className="label">{e.title}</span>
                <span className="bar">
                  <b style={{ width: `${(e.dollars / top.dollars) * 100}%` }} />
                </span>
                <span>{usd(e.dollars)}</span>
              </div>
            ))}
          </div>
          {byTheme.length > 1 && (
            <p className="sub" style={{ marginTop: 10 }}>
              By theme: {byTheme.map(([g, v]) => `${g} ${Math.round((v / held) * 100)}%`).join(" · ")}
            </p>
          )}
          {risk.shared.length > 0 && (
            <p className="sub">
              {risk.shared.length} market{risk.shared.length > 1 ? "s appear" : " appears"} in more than one of your stories, so those stories rise and fall together.
              {risk.offsetting.length > 0 && ` ${risk.offsetting.length} of them you hold on both sides, which cancels out.`}
            </p>
          )}
          {hedgeIdea ? (
            <div className="hedge">
              <div>
                <div className="muted" style={{ fontSize: 13 }}>Hedge idea</div>
                <Link href={`/s/${hedgeIdea.story.id}`} className="name">
                  {hedgeIdea.story.name}
                </Link>
                <div className="sub">
                  Takes the other side of {hedgeIdea.against} of your market{hedgeIdea.against > 1 ? "s" : ""}, covering about {usd(hedgeIdea.score)} of exposure.
                </div>
              </div>
              <Link href={`/s/${hedgeIdea.story.id}`} className="btn sm ghost">
                Look
              </Link>
            </div>
          ) : (
            <p className="sub">No story takes the other side of what you hold right now.</p>
          )}
          <p className="note">Exposure splits each position across its open markets by weight times price. For Safe and Bold it is a rough guide.</p>
        </section>
      )}

      {(account.closed?.length ?? 0) > 0 && (
        <section className="panel reveal">
          <h2>
            History. <span>Closed positions.</span>
          </h2>
          {account.closed!.slice(0, 12).map((c) => (
            <div className="kv" key={c.id}>
              <span>
                {c.storyName} · {SIDE[c.kind]} · {c.how === "settled" ? "settled" : "sold"} {fmt.format(c.ts)}
              </span>
              <span className={`num ${c.proceeds - c.cost >= 0 ? "up" : "down"}`}>{money(c.proceeds - c.cost)}</span>
            </div>
          ))}
        </section>
      )}

      <p className="note" style={{ marginTop: 28 }}>
        Positions are valued at the mid and sell at the bid, so selling right away returns a little less than the value shown. Signed in as {account.email}. Devnet wallet{" "}
        <a className="mono" href={`https://explorer.solana.com/address/${account.wallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer">
          {account.wallet.slice(0, 4)}…{account.wallet.slice(-4)}
        </a>
        , with its key kept in this browser for the demo.{" "}
        <button onClick={signOut} className="linkish">
          Sign out
        </button>
      </p>
    </>
  );
}
