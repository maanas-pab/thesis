"use client";
import { useState } from "react";
import type { Mover, Point, Range, Story } from "@/lib/types";
import Chart, { Ranges } from "./Chart";
import { change, useHistory } from "./useHistory";

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const RANGES: { id: Range; label: string; word: string; bars: string }[] = [
  { id: "1d", label: "1D", word: "today", bars: "5-minute prices" },
  { id: "1w", label: "1W", word: "this week", bars: "15-minute prices" },
  { id: "1m", label: "1M", word: "this month", bars: "hourly prices" },
];
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
const c = (p: number) => `${Math.round(p * 100)}¢`;

/** One plain sentence on what drove the change, from the markets inside. */
function why(movers: Mover[], chg: number | null, word: string) {
  if (chg == null || Math.abs(chg) < 0.1) return null;
  const top = movers.filter((m) => Math.abs(m.delta) >= 0.1 && Math.sign(m.delta) === Math.sign(chg)).slice(0, 2);
  if (!top.length) return null;
  const part = (m: Mover) => `${m.side === "no" ? "No on " : ""}${m.label} ${m.to > m.from ? "rose" : "fell"} from ${c(m.from)} to ${c(m.to)}`;
  return `${chg > 0 ? "Up" : "Down"} ${Math.abs(chg).toFixed(1)} ${word}, mostly because ${top.map(part).join(", and ")}.`;
}

export default function IndexChart({ story }: { story: Story }) {
  const [range, setRange] = useState<Range>("1d");
  const [shown, setShown] = useState<Point | null>(null);
  const history = useHistory(story.id, range);
  const points = history?.points ?? null;
  const chg = change(points);
  const up = (chg ?? 0) >= 0;
  const r = RANGES.find((x) => x.id === range)!;
  const movers = (history?.movers ?? []).filter((m) => Math.abs(m.delta) >= 0.05).slice(0, 5);

  return (
    <>
      <div className="readout">
        <span className="idx num">{(shown?.v ?? story.index).toFixed(1)}</span>
        {shown ? (
          <span className="when num">{fmt.format(shown.t)}</span>
        ) : chg != null ? (
          <span className={`num ${up ? "up" : "down"}`}>
            {signed(chg)} {r.word}
          </span>
        ) : null}
        <Ranges value={range} options={RANGES} onChange={setRange} />
      </div>
      <Chart
        key={range}
        points={points}
        up={up}
        onHover={setShown}
        label="Index history"
        empty="No trades in this window yet. Prices are being recorded every minute."
      />
      <p className="chart-note">
        {r.bars}. The shape comes from Gemini trades, anchored so the line ends at the live mid.
      </p>
      {movers.length > 0 && (
        <section className="panel movers">
          <h2>
            Why it moved. <span>{r.word[0].toUpperCase() + r.word.slice(1)}.</span>
          </h2>
          {why(movers, chg, r.word) && <p className="why">{why(movers, chg, r.word)}</p>}
          {movers.map((m) => (
            <div className="kv" key={m.label + m.side}>
              <span>
                <span className={`tag ${m.side}`}>{m.side === "yes" ? "Yes" : "No"}</span>{" "}
                {m.label}
              </span>
              <span className={`num ${m.delta >= 0 ? "up" : "down"}`}>{signed(m.delta)}</span>
            </div>
          ))}
          <p className="note">Index points each market added or took away over the window. Worked out from prices, not from news.</p>
        </section>
      )}
    </>
  );
}
