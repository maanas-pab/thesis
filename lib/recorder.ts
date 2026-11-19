import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATA_DIR } from "./data-dir";
import path from "node:path";
import type { Point, Story } from "./types";

/**
 * Records each story's index once a minute from live quotes.
 *
 * Gemini's candles only exist for contracts that have traded. Weather contracts
 * are quoted but rarely trade and live for a day or two, so they have no candles
 * and their history has to be recorded here instead.
 *
 * Stored in memory and in a local file so a restart keeps the series. On a host
 * with no writable disk the file write fails quietly and memory is used alone.
 */
const FILE = path.join(DATA_DIR, "snapshots.json");
const EVERY = 60_000;
const KEEP = 10 * 24 * 60; // ten days of minutes per story

type Book = Record<string, Point[]>;
const g = globalThis as unknown as { __snapshots?: Book; __recorder?: ReturnType<typeof setInterval> };

function book(): Book {
  if (!g.__snapshots) {
    try {
      g.__snapshots = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      g.__snapshots = {};
    }
  }
  return g.__snapshots!;
}

export function record(stories: Story[]) {
  const b = book();
  const now = Date.now();
  let changed = false;
  for (const s of stories) {
    const series = (b[s.id] ??= []);
    const last = series[series.length - 1];
    if (last && now - last.t < EVERY - 5_000) continue;
    series.push({ t: now, v: s.index });
    if (series.length > KEEP) series.splice(0, series.length - KEEP);
    changed = true;
  }
  if (!changed) return;
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(b));
  } catch {
    // No writable disk: keep recording in memory.
  }
}

export function recorded(id: string): Point[] {
  return book()[id] ?? [];
}

/** Keep recording while the server is up, even when nobody has a page open. */
export function keepRecording(load: () => Promise<Story[]>) {
  if (g.__recorder) return;
  g.__recorder = setInterval(() => {
    load().catch(() => {});
  }, EVERY);
  g.__recorder.unref?.();
}
