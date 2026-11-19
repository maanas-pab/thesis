import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuySheet from "@/components/BuySheet";
import IndexChart from "@/components/IndexChart";
import Live from "@/components/Live";
import PoolPanel from "@/components/PoolPanel";
import StoryTools from "@/components/StoryTools";
import { Faces } from "@/components/StoryCard";
import { cents, compactUsd, usd } from "@/lib/math";
import { getStory } from "@/lib/stories";

export const dynamic = "force-dynamic";

const pctOf = (p: number) => (p < 0.001 ? "under 0.1%" : p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) return { title: "Thesis" };
  return {
    title: `${story.name} · ${story.index.toFixed(1)} · Thesis`,
    description: `${story.blurb} A basket of ${story.legs.length} live prediction markets.`,
  };
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) notFound();
  const n = story.legs.length;
  const t = story.tranches;
  const indicative = story.legs.some((l) => l.indicative);
  const even = story.legs.every((l) => Math.abs(l.weight - 1 / n) < 1e-9);
  // Weighted baskets have many payout levels: show the likeliest ones, highest payout first.
  const rows = [...t.levels].sort((a, b) => b.p - a.p).slice(0, 9).sort((a, b) => b.pay - a.pay);
  const together = t.avgCorr > 0.05 ? "tend to move together" : t.avgCorr < -0.05 ? "tend to move against each other" : "move mostly on their own";

  return (
    <>
      <Link href="/" className="back">
        ← All stories
      </Link>
      <div className="story-head">
        <div className="story-eyebrow">
          <Faces story={story} />
          <span className="eyebrow">
            {story.group} · {n} markets · Settles {story.settles}
          </span>
        </div>
        <h1>{story.name}</h1>
        <p>{story.blurb}</p>
      </div>
      {story.community && (
        <div className="community-line">
          Built by <b>{story.community.creator}</b>, who earns 1% of every buy.{" "}
          <span className={story.index >= story.community.startIndex ? "up" : "down"}>
            {story.index >= story.community.startIndex ? "+" : "−"}
            {Math.abs(story.index - story.community.startIndex).toFixed(1)}
          </span>{" "}
          since it launched at {story.community.startIndex.toFixed(1)}.
          {story.community.thesis && <span className="muted"> Thesis: “{story.community.thesis}”</span>}
        </div>
      )}

      <IndexChart story={story} />

      <div className="specs story-specs reveal">
        <div>
          <span>Traded today</span>
          <b className="num">{story.volume24h > 0 ? compactUsd(story.volume24h) : "Quiet"}</b>
        </div>
        <div>
          <span>All-time volume</span>
          <b className="num">{compactUsd(story.volume)}</b>
        </div>
        <div>
          <span>Spread</span>
          <b className="num">{cents(story.buyPrice - story.sellPrice)}</b>
        </div>
        <div>
          <span>Every market hits</span>
          <b className="num">{pctOf(t.allHit)}</b>
        </div>
      </div>

      <div className="reveal" style={{ marginTop: 48 }}>
        <PoolPanel storyId={story.id} storyName={story.name} />
      </div>

      <div className="cols reveal">
        <section className="panel">
          <h2>
            What&apos;s inside. <span>{n} live markets.</span>
          </h2>
          <p className="sub">
            {n} markets{even ? `, ${Math.round(100 / n)}% each` : ", weighted as shown"}. One unit pays ${"1.00"} if every one hits, and {even ? `${usd(1 / n)} for each one that does` : "each market's share of $1 when it does"}.
          </p>
          <table className="legs">
            <thead>
              <tr>
                <th>Market</th>
                <th className="r hide-sm">24h vol</th>
                <th className="r">Bid</th>
                <th className="r">Ask</th>
                <th className="r">Mid</th>
              </tr>
            </thead>
            <tbody>
              {story.legs.map((l) => (
                <tr key={l.symbol}>
                  <td>
                    <div className="leg-line">
                      {l.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="leg-img" src={l.image} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="leg-img blank" />
                      )}
                      <span className={`tag ${l.side}`}>{l.side === "yes" ? "Yes" : "No"}</span>{" "}
                      {l.label}
                    </div>
                    <div className="q">
                      {l.eventTitle}
                      {!even && ` · ${Math.round(l.weight * 100)}% of the basket`}
                    </div>
                    {story.community?.reasons?.[l.symbol] && <div className="q reason">{story.community.reasons[l.symbol]}</div>}
                  </td>
                  <td className="r num muted hide-sm">{l.vol24h ? compactUsd(l.vol24h) : "–"}</td>
                  <td className="r num muted">{cents(l.sell)}</td>
                  <td className="r num muted">{cents(l.buy)}</td>
                  <td className="r num">
                    {cents(l.price)}
                    {l.indicative && <span className="muted">*</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {indicative && (
            <p className="note">
              * Thinly traded right now. The mid is the last trade or the one quote there is, and a missing bid or ask is
              estimated 5¢ away.
            </p>
          )}
        </section>

        <aside className="sticky">
          <div className="panel tile">
            <h2>Buy it now</h2>
            <p className="sub">The whole basket at today&apos;s price, no waiting for a pool. Sell any time at the bid.</p>
            <div className="quote-pair num">
              <div>
                <span>Sell</span>
                <b>{cents(story.sellPrice)}</b>
              </div>
              <div>
                <span>Buy</span>
                <b>{cents(story.buyPrice)}</b>
              </div>
              <div>
                <span>Pays up to</span>
                <b>$1.00</b>
              </div>
            </div>
            <BuySheet story={story} />
            <p className="note">Buy is every market at its ask, sell is every market at its bid. A round trip costs {cents(story.buyPrice - story.sellPrice)} a unit.</p>
          </div>

          <div className="aside-gap">
            <StoryTools story={story} />
          </div>

          <div className="panel aside-gap">
            <h2>
              Odds. <span>How many will hit.</span>
            </h2>
            <div className="payoff">
              {rows.map((l) => (
                <div className="payoff-row num" key={l.pay}>
                  <span>{even ? `${l.hits} of ${n}` : usd(l.pay)}</span>
                  <div className="bar">
                    <b className="bold" style={{ width: `${Math.max(l.p * 100, 0.5)}%` }} />
                  </div>
                  <span style={{ textAlign: "right" }}>{l.p < 0.005 ? "<1%" : `${Math.round(l.p * 100)}%`}</span>
                </div>
              ))}
            </div>
            <p className="note">
              These markets {together} (average correlation {t.avgCorr.toFixed(2)}, from two weeks of hourly prices and the kind of story it is). Every market
              hitting is a {pctOf(t.allHit)} chance, against {pctOf(t.allHitIndependent)} if they were unrelated.
            </p>
          </div>
        </aside>
      </div>
      <Live every={20} />
    </>
  );
}
