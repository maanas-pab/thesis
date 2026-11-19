"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Story } from "@/lib/types";
import { dayChange, useHistory } from "./useHistory";

export default function StoryCard({ story }: { story: Story }) {
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
  const points = useHistory(story.id, seen);
  const chg = dayChange(points);
  const up = (chg ?? 0) >= 0;

  let d = "";
  if (points && points.length > 1) {
    const vs = points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const span = hi - lo || 1;
    const t0 = points[0].t;
    const tw = points[points.length - 1].t - t0 || 1;
    d = points.map((p, i) => `${i ? "L" : "M"}${(((p.t - t0) / tw) * 120).toFixed(1)} ${(38 - ((p.v - lo) / span) * 36).toFixed(1)}`).join("");
  }

  return (
    <Link ref={ref} href={`/s/${story.id}`} className="card enter">
      <div className="card-top">
        <div>
          <h3>{story.name}</h3>
          <p className="blurb">{story.blurb}</p>
        </div>
        <span className="meta">{story.legs.length} markets</span>
      </div>
      <div className="card-bottom">
        <div>
          <div className="idx num">{story.index.toFixed(1)}</div>
          <div className={`chg num ${chg == null ? "muted" : up ? "up" : "down"}`}>
            {chg == null ? " " : `${up ? "+" : "−"}${Math.abs(chg).toFixed(1)} today`}
          </div>
        </div>
        <svg className="spark" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
          {d && <path d={d} stroke={up ? "var(--up)" : "var(--down)"} />}
        </svg>
      </div>
    </Link>
  );
}
