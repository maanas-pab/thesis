"use client";
import { useEffect, useRef, useState } from "react";
import type { Story } from "@/lib/types";
import { cents } from "@/lib/math";

const STEPS = [
  { k: "01", title: "Five markets.", body: "Each story is a basket of live prediction markets on Gemini that all go your way if you're right." },
  { k: "02", title: "One price.", body: "The index is the price of the whole basket, 0 to 100. Buy it at the ask, sell it at the bid, any time." },
  { k: "03", title: "Your tier.", body: "Or join the pool. Tier 1 is paid first at +3%, up to Uncapped, which keeps everything left over." },
];
const TIERS = [
  { name: "Tier 1", t: "+3%", h: 0.34 },
  { name: "Tier 2", t: "+5%", h: 0.46 },
  { name: "Tier 3", t: "+10%", h: 0.6 },
  { name: "Tier 4", t: "+25%", h: 0.78 },
  { name: "Uncapped", t: "Rest", h: 1 },
];
// Where each market chip starts, scattered around the stage, in % of the stage.
const SCATTER = [
  [-34, -36, -9],
  [30, -30, 7],
  [-38, 18, 6],
  [34, 22, -8],
  [0, 40, 4],
];

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A pinned, scroll-driven scene in the Apple style. The section is three screens tall; the stage stays put while
 * the scroll position drives one progress value, which the CSS turns into motion.
 */
export default function HowItWorks({ story }: { story: Story }) {
  const box = useRef<HTMLElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const p = still ? 1 : clamp(-r.top / (r.height - window.innerHeight));
      el.style.setProperty("--p", p.toFixed(4));
      setStep(p < 0.34 ? 0 : p < 0.67 ? 1 : 2);
      // The price counts up through the middle third.
      const s2 = clamp((p - 0.3) / 0.3);
      if (num.current) num.current.textContent = (story.index * (still ? 1 : s2)).toFixed(1);
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(frame);
    };
  }, [story.index]);

  const legs = story.legs.slice(0, 5);
  return (
    <section ref={box} className="how" aria-label="How Thesis works">
      <div className="how-pin">
        <div className="how-copy">
          <span className="eyebrow">How it works</span>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.k} data-on={step === i || undefined}>
                <span className="how-k">{s.k}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="how-bar" aria-hidden>
            <b />
          </div>
        </div>

        <div className="how-stage" aria-hidden>
          {legs.map((l, i) => (
            <div
              key={l.symbol}
              className="how-chip"
              style={{ "--i": i, "--sx": SCATTER[i][0], "--sy0": SCATTER[i][1], "--rot": SCATTER[i][2] } as React.CSSProperties}
            >
              <i className={l.side}>{l.side === "yes" ? "Yes" : "No"}</i>
              <span>{l.label}</span>
              <b className="num">{cents(l.price)}</b>
            </div>
          ))}

          <div className="how-price">
            <span className="how-name">{story.name}</span>
            <span ref={num} className="how-num num">
              {story.index.toFixed(1)}
            </span>
            <span className="how-quote num">
              {cents(story.sellPrice)} bid · {cents(story.buyPrice)} ask
            </span>
          </div>

          <div className="how-tiers">
            {TIERS.map((t, i) => (
              <div key={t.name} className="how-tier" style={{ "--i": i, "--h": t.h } as React.CSSProperties}>
                <span className="how-t">{t.t}</span>
                <b />
                <span className="how-tn">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
