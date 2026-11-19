"use client";
import { useId, useRef, useState } from "react";
import type { Point } from "@/lib/types";

/** Line chart with a hover scrubber. Calls onHover with the point under the cursor. */
export default function Chart({
  points,
  up,
  empty,
  onHover,
  label,
}: {
  points: Point[] | null;
  up: boolean;
  empty: string;
  onHover?: (p: Point | null) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const fade = useId();
  const has = !!points && points.length > 1;
  const color = up ? "var(--up)" : "var(--down)";

  let line = "";
  let xs: number[] = [];
  let ys: number[] = [];
  if (has) {
    const vs = points!.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const pad = (hi - lo || Math.abs(hi) * 0.02 || 1) * 0.15;
    const min = lo - pad;
    const span = hi + pad - min;
    const t0 = points![0].t;
    const tw = points![points!.length - 1].t - t0 || 1;
    xs = points!.map((p) => ((p.t - t0) / tw) * 100);
    ys = points!.map((p) => 100 - ((p.v - min) / span) * 100);
    line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(2)} ${ys[i].toFixed(2)}`).join("");
  }

  function set(i: number | null) {
    setHover(i);
    onHover?.(i == null || !has ? null : points![i]);
  }
  function move(e: React.PointerEvent) {
    if (!has || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    // Points are in time order, so a binary search finds the nearest one.
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] < x) lo = m;
      else hi = m;
    }
    set(Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi);
  }
  const at = hover != null && hover < xs.length ? hover : null;

  return (
    <div className="chart" ref={box} onPointerMove={move} onPointerLeave={() => set(null)}>
      {has ? (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="wipe" aria-label={label}>
            <defs>
              <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.16" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line}L100 100L0 100Z`} fill={`url(#${fade})`} />
            <path d={line} className="line" stroke={color} />
          </svg>
          {at != null && (
            <>
              <div className="cursor" style={{ left: `${xs[at]}%` }} />
              <div className="dot" style={{ left: `${xs[at]}%`, top: `${ys[at]}%`, background: color }} />
            </>
          )}
        </>
      ) : (
        <div className="empty">{points ? empty : "Loading"}</div>
      )}
    </div>
  );
}

export function Ranges<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="ranges" role="tablist" aria-label="Time range">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
