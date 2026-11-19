"use client";
import { cents } from "@/lib/math";
import type { Story } from "@/lib/types";

const pctOf = (p: number) => (p < 0.001 ? "under 0.1%" : p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

/** Live numbers for a basket that has not been published yet. */
export default function StoryPreview({ story, reasons, loading }: { story: Story | null; reasons?: Record<string, string>; loading?: boolean }) {
  if (!story)
    return <div className="panel tile preview-empty muted">{loading ? "Pricing the basket" : "Add at least five markets to see the price."}</div>;
  const t = story.tranches;
  return (
    <div className="panel tile preview" data-loading={loading || undefined}>
      <div className="preview-top">
        <div>
          <div className="muted" style={{ fontSize: 13 }}>Story Index</div>
          <div className="idx num">{story.index.toFixed(1)}</div>
        </div>
        <div className="preview-quote num">
          <span>Sell {cents(story.sellPrice)}</span>
          <span>Buy {cents(story.buyPrice)}</span>
        </div>
      </div>
      <div className="kv">
        <span>At least half the markets hit</span>
        <span className="num">{pctOf(t.levels.filter((l) => l.pay >= 0.5 - 1e-9).reduce((x, l) => x + l.p, 0))}</span>
      </div>
      <div className="kv">
        <span>Every market hits</span>
        <span className="num">{pctOf(t.allHit)}</span>
      </div>
      <table className="legs" style={{ marginTop: 10 }}>
        <tbody>
          {story.legs.map((l) => (
            <tr key={l.symbol}>
              <td>
                <div>
                  <span className={`tag ${l.side}`}>{l.side === "yes" ? "Yes" : "No"}</span>{" "}
                  {l.label}
                </div>
                <div className="q">{l.eventTitle}</div>
                {reasons?.[l.symbol] && <div className="q reason">{reasons[l.symbol]}</div>}
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
    </div>
  );
}
