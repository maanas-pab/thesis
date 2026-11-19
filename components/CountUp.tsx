"use client";
import { useEffect, useRef } from "react";

/**
 * A number that counts up from zero the first time it comes into view.
 * The server renders the final value, so it reads correctly before scripts load and with reduced motion.
 */
export default function CountUp({ value, digits = 1, prefix = "", suffix = "", ms = 1400, className, commas = false }: { value: number; digits?: number; prefix?: string; suffix?: string; ms?: number; className?: string; commas?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  const fmt = (n: number) => `${prefix}${commas ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : n.toFixed(digits)}${suffix}`;
  const final = fmt(value);

  useEffect(() => {
    const el = ref.current;
    // Write into React's own text node, so a later re-render still updates the same node.
    const node = el?.firstChild;
    // Count once per mount; later live updates just show the new value.
    if (!el || !node || done.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const set = (s: string) => {
      node.nodeValue = s;
    };
    let frame = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      done.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 4); // ease out quart: fast, then settles
        set(fmt(value * e));
        if (k < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.95 && r.bottom > 0) {
        window.removeEventListener("scroll", check);
        run();
      }
    };
    set(fmt(0));
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      cancelAnimationFrame(frame);
      set(final);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, digits, prefix, suffix, ms, final]);

  return (
    <span ref={ref} className={className}>
      {final}
    </span>
  );
}
