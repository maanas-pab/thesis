// Read-only client for Gemini's public prediction-market data. No key needed.
const BASE = "https://api.gemini.com";

export type GContract = {
  label: string;
  instrumentSymbol: string;
  status?: string;
  /** Set once the contract has resolved: which side won. */
  resolutionSide?: "yes" | "no" | null;
  expiryDate?: string;
  sortOrder?: number;
  imageUrl?: string;
  color?: string;
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
  startTime?: string;
  expiryDate?: string;
  /** Traded volume, all time and over the last day. */
  volume?: string;
  volume24h?: string;
  imageUrl?: string;
  contracts: GContract[];
};

type Entry = { at: number; value: unknown; refreshing?: Promise<unknown> };
const g = globalThis as unknown as { __gemCache2?: Map<string, Entry> };
const cache = (g.__gemCache2 ??= new Map<string, Entry>());

// Keep well under Gemini's public rate limit. The whole-exchange volume crawl gets its own small lane,
// so its slow 500-row listings never hold up the requests a page is waiting on.
const lanes = { page: { max: 6, active: 0, waiting: [] as (() => void)[] }, bulk: { max: 3, active: 0, waiting: [] as (() => void)[] } };
async function slot<T>(fn: () => Promise<T>, lane: keyof typeof lanes = "page"): Promise<T> {
  const l = lanes[lane];
  if (l.active >= l.max) await new Promise<void>((r) => l.waiting.push(r));
  l.active++;
  try {
    return await fn();
  } finally {
    l.active--;
    l.waiting.shift()?.();
  }
}

const inflight = new Map<string, Promise<unknown>>();

async function load(path: string) {
  // Listings can take tens of seconds when Gemini is busy; candles are many and small, so they give up sooner.
  const bulk = path.includes("limit=500");
  return slot(
    async () => {
      const res = await fetch(BASE + path, { cache: "no-store", signal: AbortSignal.timeout(bulk ? 60_000 : path.startsWith("/v2/candles") ? 8000 : 45_000) });
      if (!res.ok) throw new Error(`Gemini ${res.status} for ${path}`);
      return res.json();
    },
    bulk ? "bulk" : "page",
  );
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

export type Frame = "5m" | "15m" | "1hr";
const FRAME_TTL: Record<Frame, number> = { "5m": 60_000, "15m": 120_000, "1hr": 300_000 };
// Contracts that have never traded have no candles. Remember that for a while instead of asking again.
const noCandles = new Map<string, number>();

/** Candle closes for one contract, oldest first. Empty when it has never traded. */
export async function getCandles(symbol: string, frame: Frame = "1hr"): Promise<[number, number][]> {
  const key = `${symbol}/${frame}`;
  if ((noCandles.get(key) ?? 0) > Date.now()) return [];
  try {
    const rows = await get<number[][]>(`/v2/candles/${encodeURIComponent(symbol)}/${frame}`, FRAME_TTL[frame]);
    if (!Array.isArray(rows)) throw new Error("no candles");
    return rows.map((r) => [r[0], r[4]] as [number, number]).sort((a, b) => a[0] - b[0]);
  } catch {
    noCandles.set(key, Date.now() + 10 * 60_000);
    return [];
  }
}

const num = (s?: string | null) => {
  const n = s == null ? NaN : parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/** Spread assumed around the last price when one side of the book is empty. */
const GUESS = 0.05;
const clamp = (n: number) => Math.min(Math.max(n, 0.01), 0.99);

/**
 * Yes-side bid, ask and mid for a contract.
 * Two-sided book: mid of best bid and best ask.
 * One-sided or empty book: the last trade (or the one quote there is) is the mid, and the
 * missing side is estimated 5 cents away. Those are marked indicative.
 */
export function yesQuote(c: GContract) {
  const bid = num(c.prices?.bestBid);
  const ask = num(c.prices?.bestAsk);
  const last = num(c.prices?.lastTradePrice);
  if (bid != null && ask != null && ask >= bid)
    return { mid: (bid + ask) / 2, bid, ask, spread: ask - bid, indicative: ask - bid > 0.1 };
  const one = last ?? bid ?? ask;
  if (one == null) return null;
  const b = bid ?? clamp(Math.min(one, ask ?? 1) - GUESS);
  const a = ask ?? clamp(Math.max(one, bid ?? 0) + GUESS);
  const mid = Math.min(Math.max(one, b), a);
  return { mid, bid: b, ask: a, spread: a - b, indicative: true };
}

// ---------- Whole-exchange volume ----------

type Page = { data?: (GEvent & { status?: string; resolvedAt?: string })[] };
export type ExchangeVolume = {
  /** Contracts traded in the last 24 hours across every Gemini market, at $1 each. */
  day: number;
  /** Of that, on markets still open and on markets that finished in the last day. */
  live: number;
  finished: number;
  events: number;
  byCategory: { name: string; day: number }[];
  at: number;
};

/** Every row of one listing, up to Gemini's cap of 1,000 per query. */
async function rows(query: string) {
  const out: NonNullable<Page["data"]> = [];
  for (let offset = 0; offset < 1000; offset += 500) {
    const path = `/v1/prediction-markets/events?${query}&limit=500&offset=${offset}`;
    let page: Page;
    try {
      page = await get<Page>(path, 300_000).catch(() => get<Page>(path, 300_000));
    } catch {
      break;
    }
    const d = page.data ?? [];
    out.push(...d);
    if (d.length < 500) break;
  }
  return out;
}

/**
 * Volume across all of Gemini's prediction markets, not just the ones inside stories.
 * Most of it is in 5-minute and hourly crypto markets and in games that have already finished, so it adds
 * finished markets from the last day to the open ones. Gemini lists at most 1,000 finished markets per query,
 * which a day of 5-minute markets passes, so finished markets are also fetched per category and per series.
 */
export async function getExchangeVolume(): Promise<ExchangeVolume> {
  const [open, recent] = await Promise.all([rows("status=active"), rows("status=settled")]);
  const all = new Map<string, (typeof open)[number]>();
  for (const e of [...open, ...recent]) all.set(e.ticker, e);
  const series = new Set<string>();
  const categories = new Set(["Economics", "Politics", "Tech", "Culture"]);
  for (const e of all.values()) {
    categories.add(e.category);
    const s = e.ticker.replace(/\d+$/, "");
    // Repeating series have short tickers like BTC05M2611171435; one-off events carry dashes.
    if (s && !s.includes("-") && s.length <= 8 && s !== e.ticker) series.add(s);
  }
  const more = await Promise.all([
    ...[...categories].map((c) => rows(`status=settled&category=${encodeURIComponent(c)}`)),
    ...[...series].map((s) => rows(`status=settled&search=${encodeURIComponent(s)}`)),
  ]);
  for (const list of more) for (const e of list) all.set(e.ticker, e);

  const since = Date.now() - 86_400_000;
  let live = 0;
  let finished = 0;
  let events = 0;
  const cats = new Map<string, number>();
  for (const e of all.values()) {
    const v = parseFloat(e.volume24h ?? "") || 0;
    if (e.status === "settled") {
      const t = Date.parse(e.resolvedAt ?? e.expiryDate ?? "");
      if (!(t >= since)) continue;
      finished += v;
    } else live += v;
    if (v > 0) events++;
    cats.set(e.category, (cats.get(e.category) ?? 0) + v);
  }
  return {
    day: live + finished,
    live,
    finished,
    events,
    byCategory: [...cats].map(([name, day]) => ({ name, day })).filter((c) => c.day >= 1).sort((a, b) => b.day - a.day),
    at: Date.now(),
  };
}
