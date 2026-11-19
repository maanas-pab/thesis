"use client";
import { useEffect, useState } from "react";
import type { LegPick, Story } from "@/lib/types";

/** Prices a set of picks on the server, a moment after they stop changing. */
export function usePreview(legs: LegPick[]) {
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(legs.map((l) => [l.symbol, l.side, l.weight]));
  useEffect(() => {
    if (legs.length < 5) {
      setStory(null);
      return;
    }
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch("/api/preview", { method: "POST", body: JSON.stringify({ legs }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => live && setStory(s))
        .catch(() => live && setStory(null))
        .finally(() => live && setLoading(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The key captures everything about the legs that changes the price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { story, loading };
}

export type Draft = { name: string; blurb: string; thesis?: string; legs: (LegPick & { label: string; eventTitle: string; mid: number })[] };
export const DRAFT_KEY = "thesis.draft";

export function readDraft(): Draft | null {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
  } catch {
    return null;
  }
}
export function writeDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {}
}
