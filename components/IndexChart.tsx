"use client";
import { useRef, useState } from "react";
import type { Story } from "@/lib/types";
import { dayChange, useHistory } from "./useHistory";

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric" });

export default function IndexChart({ story }: { story: Story }) {
  const points = useHistory(story.id);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const has = !!points && points.length > 1;
  const chg = dayChange(points);
  const up = (chg ?? 0) >= 0;
  const color = up ? "var(--up)" : "var(--down)";

  let line = "";
  let area = "";
  let xs: number[] = [];
  let ys: number[] = [];
  if (has) {
    const vs = points!.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const pad = (hi - lo || 1) * 0.15;
    const min = lo - pad;
    const span = hi + pad - min;
    const t0 = points![0].t;
    const tw = points![points!.length - 1].t - t0 || 1;
    xs = points!.map((p) => ((p.t - t0) / tw) * 100);
    ys = points!.map((p) => 100 - ((p.v - min) / span) * 100);
    line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(2)} ${ys[i].toFixed(2)}`).join("");
    area = `${line}L100 100L0 100Z`;
  }

  const shown = hover != null && has ? points![hover] : null;

  function move(e: React.PointerEvent) {
    if (!has || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setHover(best);
  }

  return (
    <>
      <div className="readout">
        <span className="idx num">{(shown?.v ?? story.index).toFixed(1)}</span>
        {shown ? (
          <span className="when num">{fmt.format(shown.t)}</span>
        ) : chg != null ? (
          <span className={`num ${up ? "up" : "down"}`}>
            {up ? "+" : "−"}
            {Math.abs(chg).toFixed(1)} today
          </span>
        ) : null}
      </div>
      <div className="chart" ref={box} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {has ? (
          <>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="reveal" aria-label="Index history">
              <defs>
                <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={color} stopOpacity="0.16" />
                  <stop offset="1" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#fade)" />
              <path d={line} className="line" stroke={color} />
            </svg>
            {hover != null && (
              <>
                <div className="cursor" style={{ left: `${xs[hover]}%` }} />
                <div className="dot" style={{ left: `${xs[hover]}%`, top: `${ys[hover]}%`, background: color }} />
              </>
            )}
          </>
        ) : (
          <div className="empty">{points ? "Not enough price history yet" : "Loading history"}</div>
        )}
      </div>
    </>
  );
}
