"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import PageHead from "@/components/PageHead";
import Publish from "@/components/Publish";
import StoryPreview from "@/components/StoryPreview";
import { writeDraft } from "@/components/usePreview";
import type { LegPick, Story } from "@/lib/types";

type Result = { name: string; blurb: string; legs: LegPick[]; note?: string; source: "ai" | "jev" | "rule" | "keyword"; preview: Story | null; error?: string };
const EXAMPLES = [
  "AI spending slows and rates stay high",
  "A cold snap hits the big cities this week",
  "Populists win in Europe and the US",
  "Every NFL favorite wins this week",
];

function ThesisInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run(t = text) {
    if (t.trim().length < 8 || busy) return;
    setBusy(true);
    setRes(null);
    const r = await fetch("/api/thesis", { method: "POST", body: JSON.stringify({ text: t }) }).catch(() => null);
    const out = r ? await r.json().catch(() => null) : null;
    setRes(out ?? { error: "Couldn't reach the server.", name: "", blurb: "", legs: [], source: "keyword", preview: null });
    setBusy(false);
  }
  // Arriving from the home page with a thesis runs it straight away.
  useEffect(() => {
    if (params.get("q")) run(params.get("q")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reasons = Object.fromEntries((res?.legs ?? []).filter((l) => l.reason).map((l) => [l.symbol, l.reason!]));
  const story = res?.preview ?? null;

  function edit() {
    if (!res) return;
    writeDraft({
      name: res.name,
      blurb: res.blurb,
      thesis: text,
      legs: res.legs.map((l) => {
        const leg = story?.legs.find((x) => x.symbol === l.symbol);
        return { ...l, label: leg?.label ?? l.symbol, eventTitle: leg?.eventTitle ?? l.eventTicker, mid: leg ? (leg.side === "yes" ? leg.price : 1 - leg.price) : 0.5 };
      }),
    });
    router.push("/build");
  }

  return (
    <>
      <PageHead eyebrow="Thesis" title="Say what happens next." rest="We'll find the markets and price it." />
      <form
        className="thesis-form big rise"
        style={{ "--d": "220ms" } as React.CSSProperties}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <textarea className="field" rows={2} maxLength={300} placeholder="AI spending slows and rates stay high" aria-label="Your thesis" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" disabled={busy || text.trim().length < 8} data-busy={busy}>
          <span className="btn-label">{busy ? "Finding markets" : "Build my basket"}</span>
        </button>
      </form>
      <div className="filters left rise" style={{ "--d": "300ms" } as React.CSSProperties}>
        {EXAMPLES.map((x) => (
          <button
            key={x}
            className="chip"
            onClick={() => {
              setText(x);
              run(x);
            }}
          >
            {x}
          </button>
        ))}
      </div>

      {res?.error && <p className="err" style={{ textAlign: "left" }}>{res.error}</p>}
      {res && !res.error && (
        <div className="cols result-cols rise">
          <section>
            <div className="panel open-top">
              <span className="eyebrow">{res.source === "ai" ? "Picked by Claude" : res.source === "jev" ? "Judged by Jev" : res.source === "rule" ? "Matched by team name" : "Keyword match"}</span>
              <h2 className="result-name">{res.name}</h2>
              <p className="sub">{res.blurb}</p>
              {res.note && <p className="note">{res.note}</p>}
              {res.legs.length > 0 && res.legs.length < 5 && (
                <p className="err" style={{ textAlign: "left" }}>
                  Only {res.legs.length} market{res.legs.length > 1 ? "s" : ""} fit. A basket needs five, so add more in the builder.
                </p>
              )}
              {res.legs.length > 0 && (
                <button className="btn ghost" onClick={edit} style={{ marginTop: 8 }}>
                  Edit in the builder
                </button>
              )}
            </div>
          </section>
          <aside className="sticky">
            <StoryPreview story={story} reasons={reasons} />
            <div className="aside-gap" />
            <Publish name={res.name} blurb={res.blurb} thesis={text} legs={res.legs} ready={!!story} />
          </aside>
        </div>
      )}
    </>
  );
}

export default function Thesis() {
  return (
    <Suspense>
      <ThesisInner />
    </Suspense>
  );
}
