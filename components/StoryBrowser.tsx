"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExchangeVolume } from "@/lib/gemini";
import type { Story } from "@/lib/types";
import { compactUsd } from "@/lib/math";
import CountUp from "./CountUp";
import StoryCard from "./StoryCard";

const ORDER: Story["group"][] = ["Community", "Economy", "Crypto", "Tech", "Politics", "Games", "Sports", "Weather"];
const TITLES: Record<Story["group"], string> = {
  Economy: "Economy and markets",
  Crypto: "Crypto",
  Tech: "Tech",
  Politics: "Politics",
  Games: "This week's games",
  Sports: "Seasons and titles",
  Weather: "Weather",
  Community: "Built by the community",
};
const SORTS = [
  { id: "theme", label: "By theme" },
  { id: "volume", label: "Most traded" },
  { id: "high", label: "Most likely" },
  { id: "low", label: "Long shots" },
  { id: "tight", label: "Tightest spread" },
] as const;
type Sort = (typeof SORTS)[number]["id"];
const byVolume = (a: Story, b: Story) => b.volume24h - a.volume24h || b.volume - a.volume;

/** Volume across every market on the page, counting each event once. */
function totals(stories: Story[]) {
  const events = new Map<string, { day: number; all: number }>();
  for (const s of stories) for (const l of s.legs) events.set(l.eventTicker, { day: l.vol24h ?? 0, all: l.vol ?? 0 });
  let day = 0;
  let all = 0;
  for (const e of events.values()) {
    day += e.day;
    all += e.all;
  }
  const markets = new Set(stories.flatMap((s) => s.legs.map((l) => l.symbol))).size;
  return { day, all, markets, events: events.size };
}

/** The five most traded stories today, skipping twins that share the same markets, and at most two per group. */
function hottest(stories: Story[]) {
  const out: Story[] = [];
  const seen = new Set<string>();
  const per = new Map<string, number>();
  for (const s of [...stories].sort(byVolume)) {
    const key = s.legs.map((l) => l.eventTicker).sort().join("|");
    const vkey = Math.round(s.volume24h);
    if (seen.has(key) || seen.has(`v${vkey}`) || (per.get(s.group) ?? 0) >= 2) continue;
    per.set(s.group, (per.get(s.group) ?? 0) + 1);
    seen.add(key);
    seen.add(`v${vkey}`);
    out.push(s);
    if (out.length === 5) break;
  }
  return out;
}

const SHADES = ["var(--lime)", "var(--ink)", "#8e8e93", "#c7c7cc", "#e5e5ea"];

/** Volume across all of Gemini, fetched once; the crawl behind it is slow the first time, so it arrives late. */
function useExchange() {
  const [v, setV] = useState<ExchangeVolume | null>(null);
  useEffect(() => {
    let live = true;
    const load = (tries: number) =>
      fetch("/api/volume")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: ExchangeVolume) => live && setV(d))
        .catch(() => live && tries > 0 && setTimeout(() => load(tries - 1), 8000));
    load(6);
    return () => {
      live = false;
    };
  }, []);
  return v;
}

/** Today's money on Gemini: the headline total, a bar split by category, and how much of it these stories hold. */
function Pulse({ stories }: { stories: Story[] }) {
  const ex = useExchange();
  const t = useMemo(() => totals(stories), [stories]);
  const cats = ex?.byCategory.filter((c) => c.day >= ex.day * 0.01).slice(0, 4) ?? [];
  return (
    <section className="pulse reveal" aria-label="Market pulse">
      <span className="eyebrow">
        <i className="live-dot" /> Gemini, last 24 hours
      </span>
      <h2>
        {ex ? <CountUp key="ex" value={ex.day} digits={0} prefix="$" commas className="num" ms={2200} /> : <span className="num pulse-wait">$———</span>}{" "}
        <span>traded across every prediction market on Gemini.</span>
      </h2>
      <div className={`pulse-bar${ex ? " in" : ""}`} aria-hidden>
        {cats.map((c, i) => (
          <i key={c.name} style={{ "--w": `${(c.day / ex!.day) * 100}%`, "--c": SHADES[i], "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <div className="specs pulse-specs">
        {cats.map((c, i) => (
          <div key={c.name}>
            <span>
              <i className="dot" style={{ background: SHADES[i] }} />
              {c.name}
            </span>
            <b className="num">{compactUsd(c.day)}</b>
          </div>
        ))}
        <div>
          <span>In these stories</span>
          <b className="num">{compactUsd(t.day)}</b>
        </div>
        <div>
          <span>Stories, all time</span>
          <b className="num">{compactUsd(t.all)}</b>
        </div>
      </div>
      <p className="pulse-note">
        {ex
          ? `Counted the way Gemini counts it, $1 a contract, across ${ex.events.toLocaleString("en-US")} markets that traded, including the 5-minute crypto markets and games that already settled. ${t.markets} live markets across ${t.events} events sit inside the ${stories.length} stories here.`
          : "Counting every market on Gemini…"}
      </p>
    </section>
  );
}

/** A row of tiles that scrolls sideways, with arrows on wider screens. */
function Shelf({ stories }: { stories: Story[] }) {
  const box = useRef<HTMLDivElement>(null);
  const go = (dir: number) => box.current?.scrollBy({ left: dir * box.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="shelf-wrap">
      <div className="shelf" ref={box}>
        {stories.map((s, i) => (
          <StoryCard key={s.id} story={s} i={i} />
        ))}
      </div>
      {stories.length > 3 && (
        <div className="shelf-nav">
          <button aria-label="Scroll back" onClick={() => go(-1)}>
            ←
          </button>
          <button aria-label="Scroll on" onClick={() => go(1)}>
            →
          </button>
        </div>
      )}
    </div>
  );
}

export default function StoryBrowser({ stories }: { stories: Story[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Story["group"] | "All">("All");
  const [sort, setSort] = useState<Sort>("theme");
  const groups = ORDER.filter((g) => stories.some((s) => s.group === g));
  const hot = useMemo(() => hottest(stories), [stories]);

  const list = useMemo(() => {
    const want = q.trim().toLowerCase();
    const hit = (s: Story) =>
      !want ||
      s.name.toLowerCase().includes(want) ||
      s.blurb.toLowerCase().includes(want) ||
      s.legs.some((l) => l.eventTitle.toLowerCase().includes(want) || l.label.toLowerCase().includes(want));
    const out = stories.filter((s) => (group === "All" || s.group === group) && hit(s));
    if (sort === "volume" || sort === "theme") out.sort(byVolume);
    if (sort === "high") out.sort((a, b) => b.index - a.index);
    if (sort === "low") out.sort((a, b) => a.index - b.index);
    if (sort === "tight") out.sort((a, b) => a.buyPrice - a.sellPrice - (b.buyPrice - b.sellPrice));
    return out;
  }, [stories, q, group, sort]);
  const shelves = sort === "theme" && group === "All" && !q.trim();

  return (
    <>
      <Pulse stories={stories} />

      {hot.length === 5 && (
        <section className="group reveal" aria-label="Most traded today">
          <h2>
            Most traded today. <span>Where the money is moving.</span>
          </h2>
          <div className="bento">
            {hot.map((s, i) => (
              <StoryCard key={s.id} story={s} i={i} big={i === 0} />
            ))}
          </div>
        </section>
      )}

      <div className="browse-head reveal" id="stories">
        <h2>
          Every story. <span>Find yours.</span>
        </h2>
      </div>
      <div className="toolbar">
        <input className="field search" type="search" placeholder="Search stories, teams, markets" aria-label="Search stories" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filters">
        {(["All", ...groups] as const).map((g) => (
          <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
            {g === "All" ? `All ${stories.length}` : g}
          </button>
        ))}
      </div>

      {shelves ? (
        groups.map((g) => {
          const mine = list.filter((s) => s.group === g);
          if (!mine.length) return null;
          const vol = totals(mine).day;
          return (
            <section className="group reveal" key={g}>
              <h2>
                {TITLES[g]}. <span>
                  {mine.length} {mine.length === 1 ? "basket" : "baskets"}
                  {vol >= 50 ? `, ${compactUsd(vol)} traded today.` : ", priced live."}
                </span>
              </h2>
              <Shelf stories={mine} />
            </section>
          );
        })
      ) : (
        <section className="group reveal" key={`${group}-${sort}-${q}`}>
          <div className="tiles">
            {list.map((s, i) => (
              <StoryCard key={s.id} story={s} i={i} />
            ))}
          </div>
        </section>
      )}
      {!list.length && <p className="empty-state">No stories match that.</p>}
    </>
  );
}
