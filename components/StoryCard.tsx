"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Story } from "@/lib/types";
import { cents, compactUsd } from "@/lib/math";
import { dayChange, useHistory } from "./useHistory";

/** Up to five distinct pictures from the markets inside, with a lettered stand-in where there is none. */
export function Faces({ story, max = 5 }: { story: Story; max?: number }) {
  const seen = new Set<string>();
  const faces = story.legs
    .filter((l) => {
      const key = l.image ?? l.eventTicker;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
  return (
    <span className="faces" aria-hidden>
      {faces.map((l, i) =>
        l.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={l.symbol} src={l.image} alt="" width={30} height={30} loading="lazy" referrerPolicy="no-referrer" style={{ zIndex: max - i }} />
        ) : (
          <b key={l.symbol} style={{ zIndex: max - i }}>
            {l.label.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "•"}
          </b>
        ),
      )}
    </span>
  );
}

/**
 * One story as a tile: pictures of what's inside, live volume, an odds strip (one bar per market, filled to
 * its price), the index and a week of prices washed across the bottom.
 */
export default function StoryCard({ story, i = 0, big = false }: { story: Story; i?: number; big?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const points = useHistory(story.id, "1w", seen)?.points ?? null;
  const chg = dayChange(points);
  const up = (chg ?? 0) >= 0;

  let line = "";
  let area = "";
  if (points && points.length > 1) {
    const vs = points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const span = hi - lo || 1;
    const t0 = points[0].t;
    const tw = points[points.length - 1].t - t0 || 1;
    line = points.map((p, k) => `${k ? "L" : "M"}${(((p.t - t0) / tw) * 300).toFixed(1)} ${(56 - ((p.v - lo) / span) * 44).toFixed(1)}`).join("");
    area = `${line}L300 64L0 64Z`;
  }
  const flat = chg == null || Math.abs(chg) < 0.05;

  return (
    <Link
      ref={ref}
      href={`/s/${story.id}`}
      className={`tile-s${big ? " big" : ""}`}
      data-seen={seen || undefined}
      style={{ "--i": i % 8 } as React.CSSProperties}
    >
      <div className="ts-top">
        <Faces story={story} />
        {story.volume24h >= 50 ? (
          <span className="vol-pill num">
            <i className="live-dot" />
            {compactUsd(story.volume24h)} today
          </span>
        ) : (
          <span className="vol-pill quiet">Quiet today</span>
        )}
      </div>

      <div className="ts-body">
        <span className="ts-group">
          {story.group} · {story.legs.length} markets
        </span>
        <h3>{story.name}</h3>
        <p>{story.blurb}</p>
      </div>

      {big ? (
        <ul className="ts-legs">
          {story.legs.slice(0, 4).map((l) => (
            <li key={l.symbol}>
              <i className={l.side}>{l.side === "yes" ? "Yes" : "No"}</i>
              <span>{story.legs.filter((x) => x.label === l.label).length > 1 ? l.eventTitle : l.label}</span>
              <b className="num">{cents(l.price)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <div className="odds" title="Each bar is one market, filled to its price">
          {story.legs.map((l) => (
            <i key={l.symbol} className={l.side}>
              <b style={{ "--v": l.price.toFixed(3) } as React.CSSProperties} />
            </i>
          ))}
        </div>
      )}

      <div className="ts-foot">
        <span className="ts-idx num">{story.index.toFixed(1)}</span>
        <span className={`pill num ${flat ? "flat" : up ? "up" : "down"}`}>{chg == null ? `${cents(story.sellPrice)}–${cents(story.buyPrice)}` : `${up ? "+" : "−"}${Math.abs(chg).toFixed(1)} today`}</span>
        <span className="ts-all num">{story.volume > 0 ? `${compactUsd(story.volume)} all time` : ""}</span>
      </div>

      <svg className={`ts-area ${up ? "up" : "down"}`} viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden>
        {line && (
          <>
            <path className="fill" d={area} />
            <path className="stroke" d={line} />
          </>
        )}
      </svg>
    </Link>
  );
}
