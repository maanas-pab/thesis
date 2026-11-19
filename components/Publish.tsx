"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { LegPick } from "@/lib/types";

/** Name, creator and publish button, shared by the builder and the thesis page. */
export default function Publish({ name, blurb, thesis, legs, ready }: { name: string; blurb: string; thesis?: string; legs: LegPick[]; ready: boolean }) {
  const router = useRouter();
  const [creator, setCreator] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!ready || busy) return;
    setBusy(true);
    const res = await fetch("/api/community", {
      method: "POST",
      body: JSON.stringify({ name, blurb, thesis, creator, legs }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !out.id) return toast.error(out.error ?? "Couldn't publish that. Try again.");
    toast.success(`Published ${name}`, { description: "Anyone can buy it now. You earn 1% of every buy." });
    router.push(`/s/${out.id}`);
  }
  return (
    <div className="publish panel tile">
      <input className="field" placeholder="Your name or handle" aria-label="Creator name" value={creator} maxLength={30} onChange={(e) => setCreator(e.target.value)} />
      <button className="btn" disabled={!ready || !name.trim() || !creator.trim()} data-busy={busy} onClick={go}>
        <span className="btn-label">{busy ? "Publishing" : "Publish story"}</span>
      </button>
      <p className="note">Published stories show on the home page and the leaderboard. As creator you earn 1% of every buy.</p>
    </div>
  );
}
