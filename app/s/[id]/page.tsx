import Link from "next/link";
import { notFound } from "next/navigation";
import BuySheet from "@/components/BuySheet";
import IndexChart from "@/components/IndexChart";
import { cents, payout, quote, usd } from "@/lib/math";
import { getStory } from "@/lib/stories";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) notFound();
  const n = story.legs.length;
  const t = story.tranches;
  const safe = quote(story, "safe");
  const bold = quote(story, "bold");
  const indicative = story.legs.some((l) => l.indicative);

  return (
    <>
      <Link href="/" className="back">
        ← All stories
      </Link>
      <div className="story-head">
        <div>
          <h1>{story.name}</h1>
          <p>{story.blurb}</p>
        </div>
        <span className="meta">
          {story.group} · Settles {story.settles}
        </span>
      </div>

      <IndexChart story={story} />

      <div className="cols">
        <section className="panel">
          <h2>What's inside</h2>
          <p className="sub">
            {n} markets, equal weight. One unit pays ${"1.00"} if every one hits, and {usd(1 / n)} for each one that does.
          </p>
          <table className="legs">
            <thead>
              <tr>
                <th>Market</th>
                <th className="r">Weight</th>
                <th className="r">Price</th>
              </tr>
            </thead>
            <tbody>
              {story.legs.map((l) => (
                <tr key={l.symbol}>
                  <td>
                    <div>
                      <span className={`tag ${l.side}`}>{l.side === "yes" ? "Yes" : "No"}</span>
                      {l.label}
                    </div>
                    <div className="q">{l.eventTitle}</div>
                  </td>
                  <td className="r num muted">{Math.round(l.weight * 100)}%</td>
                  <td className="r num">
                    {cents(l.price)}
                    {l.indicative && <span className="muted">*</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {indicative && <p className="note">* Thinly traded right now, so this price is a last trade or a one-sided quote.</p>}
        </section>

        <aside className="sticky">
          <div className="panel">
            <BuySheet story={story} />
            <div style={{ height: 14 }} />
            <div className="kv">
              <span>Whole basket</span>
              <span className="num">{usd(story.buyPrice)} → up to $1.00</span>
            </div>
            <div className="kv">
              <span>Safe side</span>
              <span className="num">
                {usd(safe.price)} → up to {usd(safe.max)}
              </span>
            </div>
            <div className="kv">
              <span>Bold side</span>
              <span className="num">
                {usd(bold.price)} → up to {usd(bold.max)}
              </span>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <h2>Who gets paid</h2>
            <p className="sub">Safe is paid first, up to {cents(t.attach)} per unit. Bold gets the rest.</p>
            <div className="payoff">
              {Array.from({ length: n + 1 }, (_, h) => n - h).map((h) => (
                <div className="payoff-row num" key={h}>
                  <span>
                    {h} of {n}
                  </span>
                  <div className="bar">
                    <b className="safe" style={{ width: `${payout("safe", h, n, t.attach) * 100}%` }} />
                    <b className="bold" style={{ width: `${payout("bold", h, n, t.attach) * 100}%` }} />
                  </div>
                  <span style={{ textAlign: "right" }}>{Math.round(t.dist[h] * 100)}%</span>
                </div>
              ))}
            </div>
            <div className="legend">
              <span>
                <i style={{ background: "var(--faint)" }} />
                Safe
              </span>
              <span>
                <i style={{ background: "var(--up)" }} />
                Bold
              </span>
              <span style={{ marginLeft: "auto" }}>Chance</span>
            </div>
            <p className="note">
              Chances and side prices treat the markets as independent. Markets in one story tend to move together, so
              all-or-nothing results are more likely than shown.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
