import { Fragment } from "react";
import HeroCard from "@/components/HeroCard";
import HowItWorks from "@/components/HowItWorks";
import Live from "@/components/Live";
import StoryBrowser from "@/components/StoryBrowser";
import { getStories } from "@/lib/stories";

export const dynamic = "force-dynamic";

const HEADLINE = ["What", "does", "the", "market", "*charge", "for", "your", "story?"];

export default async function Home() {
  const stories = await getStories();
  const markets = new Set(stories.flatMap((s) => s.legs.map((l) => l.symbol))).size;
  const lead = stories.find((s) => s.group === "Economy") ?? stories[0];

  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <div className="hero-copy">
          <span className="pill-tag rise" style={{ "--d": "0ms" } as React.CSSProperties}>
            <i className="live-dot" />
            Live on Gemini · {stories.length} stories · {markets} markets
          </span>
          <h1 aria-label="What does the market charge for your story?">
            {HEADLINE.map((w, i) => (
              <Fragment key={i}>
                <span className="word" style={{ "--i": i } as React.CSSProperties} aria-hidden>
                  {w.startsWith("*") ? <em>{w.slice(1)}</em> : w}
                </span>{" "}
              </Fragment>
            ))}
          </h1>
          <p className="rise" style={{ "--d": "520ms" } as React.CSSProperties}>
            Turn a view of the future into one trade. Every story is a basket of prediction markets, priced live as a
            single index.
          </p>
          <form action="/thesis" className="hero-form rise" style={{ "--d": "640ms" } as React.CSSProperties}>
            <input name="q" placeholder="Type your thesis, like “AI spending slows”" aria-label="Your thesis" minLength={8} required autoComplete="off" />
            <button className="btn">
              Build it <span className="arrow">→</span>
            </button>
          </form>
        </div>
        {lead && (
          <div className="hero-stage">
            <HeroCard story={lead} />
          </div>
        )}
      </section>

      {lead && <HowItWorks story={lead} />}

      {stories.length ? (
        <StoryBrowser stories={stories} />
      ) : (
        <p className="empty-state">No stories could be priced right now. Try again in a minute.</p>
      )}
      <Live every={30} />
    </>
  );
}
