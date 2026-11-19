"use client";
import Link from "next/link";
import type { Story } from "@/lib/types";
import { cents, compactUsd } from "@/lib/math";
import CountUp from "./CountUp";
import { change, useHistory } from "./useHistory";

/** The lead story as a live "product shot": real week of prices drawn in, markets sliding in underneath. */
export default function HeroCard({ story }: { story: Story }) {
  const points = useHistory(story.id, "1w")?.points ?? null;
  const chg = change(points);
  const up = (chg ?? 0) >= 0;

  let line = "";
  let area = "";
  if (points && points.length > 1) {
    const vs = points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const pad = (hi - lo || 1) * 0.2;
    const t0 = points[0].t;
    const tw = points[points.length - 1].t - t0 || 1;
    const xy = points.map((p) => [((p.t - t0) / tw) * 600, 160 - ((p.v - lo + pad) / (hi - lo + pad * 2)) * 160] as const);
    line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    area = `${line}L600 160L0 160Z`;
  }

  return (
    <Link href={`/s/${story.id}`} className="hero-card" aria-label={`${story.name}, index ${story.index.toFixed(1)}`}>
      <div className="hc-top">
        <div>
          <span className="hc-desk">
            {story.group} · Featured{story.volume24h >= 50 ? ` · ${compactUsd(story.volume24h)} traded today` : ""}
          </span>
          <h2>{story.name}</h2>
        </div>
        <div className="hc-num">
          <CountUp value={story.index} className="num" ms={1800} />
          <span className={`num ${chg == null ? "muted" : up ? "up" : "down"}`}>
            {chg == null ? `${cents(story.sellPrice)} / ${cents(story.buyPrice)}` : `${up ? "+" : "−"}${Math.abs(chg).toFixed(1)} this week`}
          </span>
        </div>
      </div>
      <svg className="hc-chart" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="hc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: up ? "var(--up)" : "var(--down)" }} stopOpacity="0.2" />
            <stop offset="1" style={{ stopColor: up ? "var(--up)" : "var(--down)" }} stopOpacity="0" />
          </linearGradient>
        </defs>
        {line && (
          <g className={up ? "up" : "down"}>
            <path className="hc-area" d={area} fill="url(#hc-fill)" />
            <path className="hc-line" d={line} pathLength={1} />
          </g>
        )}
      </svg>
      <ul className="hc-legs">
        {story.legs.slice(0, 5).map((l, i) => (
          <li key={l.symbol} style={{ "--i": i } as React.CSSProperties}>
            <i className={l.side}>{l.side === "yes" ? "Yes" : "No"}</i>
            <span>{l.label}</span>
            <b className="num">{cents(l.price)}</b>
          </li>
        ))}
      </ul>
    </Link>
  );
}
