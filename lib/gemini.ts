// Read-only client for Gemini's public prediction-market data. No key needed.
const BASE = "https://api.gemini.com";

export type GContract = {
  label: string;
  instrumentSymbol: string;
  expiryDate?: string;
  sortOrder?: number;
  prices?: {
    bestBid?: string | null;
    bestAsk?: string | null;
    lastTradePrice?: string | null;
    buy?: { yes?: string | null; no?: string | null };
  };
};
export type GEvent = {
  ticker: string;
  title: string;
  category: string;
  contracts: GContract[];
};

type Entry = { at: number; value: unknown; refreshing?: Promise<unknown> };
const g = globalThis as unknown as { __gemCache2?: Map<string, Entry> };
const cache = (g.__gemCache2 ??= new Map<string, Entry>());

// Keep well under Gemini's public rate limit.
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 6) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const inflight = new Map<string, Promise<unknown>>();

async function load(path: string) {
  return slot(async () => {
    const res = await fetch(BASE + path, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Gemini ${res.status} for ${path}`);
    return res.json();
  });
}

/**
 * Serve what we have and refresh in the background once it is older than ttlMs,
 * so one slow Gemini response never holds up a page.
 */
async function get<T>(path: string, ttlMs: number): Promise<T> {
  const hit = cache.get(path);
  if (hit) {
    if (Date.now() - hit.at > ttlMs && !hit.refreshing) {
      hit.refreshing = load(path)
        .then((value) => cache.set(path, { at: Date.now(), value }))
        .catch(() => {
          hit.refreshing = undefined;
        });
    }
    return hit.value as T;
  }
  // First request for this path: share one fetch between everyone asking.
  let first = inflight.get(path);
  if (!first) {
    first = load(path)
      .then((value) => (cache.set(path, { at: Date.now(), value }), value))
      .finally(() => inflight.delete(path));
    inflight.set(path, first);
  }
  return first as Promise<T>;
}

export async function getEvent(ticker: string): Promise<GEvent | null> {
  try {
    const d = await get<{ data?: GEvent } & GEvent>(
      `/v1/prediction-markets/events/${encodeURIComponent(ticker)}`,
      30_000,
    );
    const e = d.data ?? d;
    return e?.contracts ? e : null;
  } catch {
    return null;
  }
}

export async function getCategory(category: string): Promise<GEvent[]> {
  const out: GEvent[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    let page: { data?: GEvent[] };
    try {
      page = await get(
        `/v1/prediction-markets/events?status=active&limit=100&offset=${offset}&category=${encodeURIComponent(category)}`,
        120_000,
      );
    } catch {
      break;
    }
    const rows = page.data ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

/** Hourly closes, oldest first. */
export async function getCandles(symbol: string): Promise<[number, number][]> {
  try {
    const rows = await get<number[][]>(`/v2/candles/${encodeURIComponent(symbol)}/1hr`, 300_000);
    return rows.map((r) => [r[0], r[4]] as [number, number]).sort((a, b) => a[0] - b[0]);
  } catch {
    return [];
  }
}

const num = (s?: string | null) => {
  const n = s == null ? NaN : parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/** Yes-side price of a contract, with a fallback when the book is one-sided. */
export function yesQuote(c: GContract) {
  const bid = num(c.prices?.bestBid);
  const ask = num(c.prices?.bestAsk);
  const last = num(c.prices?.lastTradePrice);
  if (bid != null && ask != null)
    return { mid: (bid + ask) / 2, bid, ask, spread: ask - bid, indicative: ask - bid > 0.1 };
  const one = last ?? bid ?? ask;
  if (one == null) return null;
  return { mid: one, bid: bid ?? one, ask: ask ?? one, spread: 1, indicative: true };
}
