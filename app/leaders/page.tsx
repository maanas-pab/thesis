"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Leaders } from "@/lib/leaders";
import { usd } from "@/lib/math";
import PageHead from "@/components/PageHead";

const signed = (n: number | null) => (n == null ? "–" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`);
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export default function LeadersPage() {
  const [data, setData] = useState<Leaders | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/leaders")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="empty-state">The leaderboard couldn't load. Try again in a minute.</p>;
  if (!data) return <p className="empty-state">Adding up a week of prices for every story. This takes a few seconds the first time.</p>;
  const best = data.week.filter((w) => w.change != null);
  const top = best.slice(0, 10);
  const bottom = best.slice(-5).reverse();

  return (
    <>
      <PageHead eyebrow="Leaderboard" title="Who moved." rest="This week's biggest swings." />

      <div className="cols even reveal">
        <section className="panel">
          <h2>
            Risers. <span>This week.</span>
          </h2>
          <Ranked rows={top} />
        </section>
        <section className="panel">
          <h2>
            Fallers. <span>This week.</span>
          </h2>
          <Ranked rows={bottom} />
        </section>
      </div>

      <section className="panel reveal">
        <h2>
          Community. <span>Stories people published.</span>
        </h2>
        {data.community.length ? (
          <table className="legs">
            <thead>
              <tr>
                <th>Story</th>
                <th>Creator</th>
                <th className="r">Since launch</th>
                <th className="r">Bought</th>
                <th className="r">Creator earned</th>
              </tr>
            </thead>
            <tbody>
              {data.community.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/s/${c.id}`}>{c.name}</Link>
                    <div className="q">launched {ago(c.createdAt)}</div>
                  </td>
                  <td>{c.creator}</td>
                  <td className={`r num ${c.sinceLaunch >= 0 ? "up" : "down"}`}>{signed(c.sinceLaunch)}</td>
                  <td className="r num">
                    {usd(c.volume)} <span className="muted">({c.buys})</span>
                  </td>
                  <td className="r num">{usd(c.fees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sub">
            No one has published a story yet. <Link href="/thesis">Write a thesis</Link> or <Link href="/build">build one</Link>.
          </p>
        )}
      </section>

      {data.creators.length > 0 && (
        <section className="panel reveal">
          <h2>
            Creators. <span>Paid 1% of every buy.</span>
          </h2>
          <table className="legs">
            <thead>
              <tr>
                <th>Creator</th>
                <th className="r">Stories</th>
                <th className="r">Best since launch</th>
                <th className="r">Earned</th>
              </tr>
            </thead>
            <tbody>
              {data.creators.map((c) => (
                <tr key={c.creator}>
                  <td>{c.creator}</td>
                  <td className="r num">{c.stories}</td>
                  <td className={`r num ${c.best >= 0 ? "up" : "down"}`}>{signed(c.best)}</td>
                  <td className="r num">{usd(c.fees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="note" style={{ marginTop: 16 }}>
        Weekly moves come from 15-minute Gemini prices. Creator earnings are 1% of every simulated buy. Updated every five minutes.
      </p>
    </>
  );
}

function Ranked({ rows }: { rows: { id: string; name: string; group: string; change: number | null }[] }) {
  const most = Math.max(...rows.map((r) => Math.abs(r.change ?? 0)), 0.1);
  return (
    <ol className="ranked">
      {rows.map((r, i) => {
        const up = (r.change ?? 0) >= 0;
        return (
          <li key={r.id} style={{ "--i": i } as React.CSSProperties}>
            <Link href={`/s/${r.id}`}>
              <span className="rk num">{String(i + 1).padStart(2, "0")}</span>
              <span className="rn">
                {r.name}
                <small>{r.group}</small>
              </span>
              <span className="rb" aria-hidden>
                <b className={up ? "up" : "down"} style={{ width: `${(Math.abs(r.change ?? 0) / most) * 100}%` }} />
              </span>
              <span className={`rc num ${up ? "up" : "down"}`}>{signed(r.change)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
