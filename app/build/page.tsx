"use client";
import { useEffect, useState } from "react";
import PageHead from "@/components/PageHead";
import Publish from "@/components/Publish";
import StoryPreview from "@/components/StoryPreview";
import { readDraft, usePreview, type Draft } from "@/components/usePreview";
import { cents } from "@/lib/math";
import type { CatalogEntry, Side } from "@/lib/types";

type Pick = Draft["legs"][number];
const MAX = 8;

export default function Build() {
  const [legs, setLegs] = useState<Pick[]>([]);
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [thesis, setThesis] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogEntry[] | null>(null);

  // A thesis sent here to edit arrives as a draft.
  useEffect(() => {
    const d = readDraft();
    if (!d) return;
    setLegs(d.legs);
    setName(d.name);
    setBlurb(d.blurb);
    setThesis(d.thesis);
  }, []);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/markets?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const { story, loading } = usePreview(legs);
  const add = (c: CatalogEntry, side: Side) =>
    setLegs((ls) => (ls.length >= MAX || ls.some((l) => l.symbol === c.symbol) ? ls : [...ls, { eventTicker: c.eventTicker, symbol: c.symbol, side, weight: 1, label: c.label, eventTitle: c.eventTitle, mid: c.mid }]));
  const set = (i: number, patch: Partial<Pick>) => setLegs((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const total = legs.reduce((s, l) => s + l.weight, 0);

  return (
    <>
      <PageHead eyebrow="Builder" title="Build a story." rest="Five to eight markets that all go your way." />
      <div className="cols rise" style={{ "--d": "220ms" } as React.CSSProperties}>
        <section>
          <div className="panel">
            <h2>
              Your markets. <span>{legs.length} of {MAX}.</span>
            </h2>
            {legs.length === 0 && <p className="sub">Search below and add a side of any market.</p>}
            {legs.map((l, i) => (
              <div className="pick" key={l.symbol}>
                <div className="grow">
                  <div>{l.label}</div>
                  <div className="q muted">{l.eventTitle}</div>
                </div>
                <div className="side-toggle" role="group" aria-label="Side">
                  {(["yes", "no"] as const).map((s) => (
                    <button key={s} aria-pressed={l.side === s} className={`tag ${s}`} onClick={() => set(i, { side: s })}>
                      {s === "yes" ? `Yes ${cents(l.mid)}` : `No ${cents(1 - l.mid)}`}
                    </button>
                  ))}
                </div>
                <label className="weight num">
                  <input type="range" min={1} max={5} step={1} value={l.weight} aria-label={`Weight of ${l.label}`} onChange={(e) => set(i, { weight: Number(e.target.value) })} />
                  {Math.round((l.weight / total) * 100)}%
                </label>
                <button className="btn sm ghost" aria-label={`Remove ${l.label}`} onClick={() => setLegs((ls) => ls.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>
              Find markets. <span>Every live Gemini market.</span>
            </h2>
            <input className="field search-pill" type="search" placeholder="Fed, Le Pen, Buffalo, gold, Chicago temperature" aria-label="Search markets" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="results">
              {results === null && <p className="sub">Loading markets</p>}
              {results?.length === 0 && <p className="sub">Nothing matches that.</p>}
              {results?.map((c) => {
                const taken = legs.some((l) => l.symbol === c.symbol);
                return (
                  <div className="result" key={c.symbol}>
                    <div className="grow">
                      <div>{c.label}</div>
                      <div className="q muted">
                        {c.eventTitle} · {c.category}
                      </div>
                    </div>
                    <button className="tag yes" disabled={taken || legs.length >= MAX} onClick={() => add(c, "yes")}>
                      Yes {cents(c.mid)}
                    </button>
                    <button className="tag no" disabled={taken || legs.length >= MAX} onClick={() => add(c, "no")}>
                      No {cents(1 - c.mid)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="sticky">
          <div className="panel tile">
            <input className="field" placeholder="Story name, like Soft Landing" aria-label="Story name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <input className="field" style={{ marginTop: 8 }} placeholder="One line on what has to happen" aria-label="Story description" value={blurb} maxLength={160} onChange={(e) => setBlurb(e.target.value)} />
          </div>
          <div className="aside-gap" />
          <StoryPreview story={story} loading={loading} />
          <div className="aside-gap" />
          <Publish name={name} blurb={blurb} thesis={thesis} legs={legs} ready={!!story && !loading} />
        </aside>
      </div>
    </>
  );
}
