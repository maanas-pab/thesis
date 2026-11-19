import { getCategory, getEvent, yesQuote, type GEvent } from "./gemini";
import type { CatalogEntry } from "./types";

/**
 * Every contract worth putting in a basket: quoted, not already decided, and not a
 * player prop or a quarter line. Built from the same cached category pages the stories use.
 */
const CATEGORIES = ["Economics", "Politics", "Tech", "Business", "Culture", "Commodities", "Crypto", "Sports", "Weather"];
const WEEK = 7 * 86_400_000;
const NOISE = /-(PP[A-Z]*|1QM|2QM|3QM|4QM|1HM|2HM|1HS|1HT|TT)$/;

type Cached = { at: number; list: CatalogEntry[] };
const g = globalThis as unknown as { __catalog?: Cached };

function keep(e: GEvent, now: number) {
  if (NOISE.test(e.ticker)) return false;
  // Crypto markets that settle within the hour are gone before a basket could matter.
  if (e.category === "Crypto" && (/^[A-Z]+\d+M\d+$/.test(e.ticker) || /today at/i.test(e.title))) return false;
  const start = Date.parse(e.startTime ?? "");
  // Games: only ones that have not started and are within a week.
  if (Number.isFinite(start)) return start > now && start - now < WEEK;
  return true;
}

export async function getCatalog(): Promise<CatalogEntry[]> {
  if (g.__catalog && Date.now() - g.__catalog.at < 60_000) return g.__catalog.list;
  const now = Date.now();
  const pages = await Promise.all(CATEGORIES.map((c) => getCategory(c).catch(() => [] as GEvent[])));
  // Season markets can fall off the end of the Sports listing, so add them by ticker.
  const { SEASON_TICKERS } = await import("./stories");
  const listed = new Set(pages.flat().map((e) => e.ticker));
  const extra = await Promise.all(SEASON_TICKERS.filter((t) => !listed.has(t)).map((t) => getEvent(t)));
  const list: CatalogEntry[] = [];
  for (const e of [...pages.flat(), ...extra.filter((x): x is GEvent => !!x)]) {
    if (!keep(e, now)) continue;
    for (const c of e.contracts) {
      const q = yesQuote(c);
      if (!q || q.mid < 0.02 || q.mid > 0.98) continue;
      list.push({
        eventTicker: e.ticker,
        eventTitle: e.title,
        category: e.category,
        symbol: c.instrumentSymbol,
        label: c.label,
        mid: q.mid,
        bid: q.bid,
        ask: q.ask,
        indicative: q.indicative,
        expiry: e.expiryDate,
      });
    }
  }
  g.__catalog = { at: Date.now(), list };
  return list;
}

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s.]/g, " ").split(/\s+/).filter(Boolean);

/** Plain search for the story builder: every word must appear somewhere in the market. */
export async function searchCatalog(q: string, limit = 40) {
  const want = words(q);
  const list = await getCatalog();
  if (!want.length) return list.filter((c) => !c.indicative && c.category !== "Sports").slice(0, limit);
  return list
    .filter((c) => {
      const hay = `${c.eventTitle} ${c.label} ${c.category}`.toLowerCase();
      return want.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(a.indicative) - Number(b.indicative))
    .slice(0, limit);
}
