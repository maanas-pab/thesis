import { ImageResponse } from "next/og";
import { getStory } from "@/lib/stories";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Thesis story and its live index";

/** The card that shows when a story link is shared. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = await getStory(id);
  const name = story?.name ?? "Thesis";
  const legs = story?.legs.slice(0, 4) ?? [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#12110d", color: "#f5f3ee", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#a29f93" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#3ecf8e" }} />
          Thesis
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>{name}</div>
          <div style={{ fontSize: 30, color: "#a29f93", maxWidth: 980 }}>{story?.blurb ?? ""}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 24, color: "#a29f93" }}>Story Index</div>
            <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1 }}>{story ? story.index.toFixed(1) : "–"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 24, color: "#d8d5ca", maxWidth: 620 }}>
            {legs.map((l) => (
              <div key={l.symbol} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: l.side === "yes" ? "#3ecf8e" : "#ef6a4c" }}>{l.side === "yes" ? "Yes" : "No"}</span>
                <span>{`${l.label} · ${Math.round(l.price * 100)}¢`.slice(0, 48)}</span>
              </div>
            ))}
            {story && story.legs.length > 4 && <div style={{ color: "#a29f93" }}>{`and ${story.legs.length - 4} more market${story.legs.length - 4 > 1 ? "s" : ""}`}</div>}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
