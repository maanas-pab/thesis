"use client";
import { useState } from "react";
import { toast } from "sonner";
import { addAlert, removeAlert, useAccount } from "@/lib/store";
import type { Story } from "@/lib/types";

/** Price alerts and sharing for one story. */
export default function StoryTools({ story }: { story: Story }) {
  const account = useAccount();
  const [dir, setDir] = useState<"above" | "below">("above");
  const [level, setLevel] = useState(() => (story.index + 2).toFixed(1));
  const mine = (account?.alerts ?? []).filter((a) => a.storyId === story.id);

  async function share() {
    const url = window.location.href;
    const text = `${story.name} is at ${story.index.toFixed(1)} on Thesis. ${story.blurb}`;
    try {
      if (navigator.share) await navigator.share({ title: story.name, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast("Link copied", { description: "It shows a card with the live index when you paste it." });
      }
    } catch {}
  }

  function save() {
    const n = parseFloat(level);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) return toast.error("Pick a level between 0 and 100.");
    addAlert({ storyId: story.id, storyName: story.name, dir, level: n });
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch {}
    toast(`Alert set for ${story.name}`, { description: `You'll hear when the index goes ${dir} ${n.toFixed(1)} while Thesis is open.` });
  }

  return (
    <div className="panel tools">
      <div className="tools-row">
        <h2 style={{ margin: 0 }}>Alerts.</h2>
        <button className="btn sm ghost" onClick={share}>
          Share
        </button>
      </div>
      {account ? (
        <div className="alert-form">
          <span>When the index goes</span>
          <select className="field select sm" aria-label="Direction" value={dir} onChange={(e) => setDir(e.target.value as "above" | "below")}>
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <input className="field sm num" inputMode="decimal" aria-label="Alert level" value={level} onChange={(e) => setLevel(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} />
          <button className="btn sm" onClick={save}>
            Set
          </button>
        </div>
      ) : (
        <p className="sub">Sign in to set price alerts.</p>
      )}
      {mine.map((a) => (
        <div className="kv" key={a.id}>
          <span>
            {a.dir === "above" ? "Above" : "Below"} {a.level.toFixed(1)}
          </span>
          <button className="linkish" onClick={() => removeAlert(a.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
