import { getCandles, getCategory, getEvent, yesQuote, type GContract, type GEvent } from "./gemini";
import { priceTranches } from "./math";
import type { Leg, Point, Side, Story } from "./types";

/** A story never shows with fewer legs than this. */
export const MIN_LEGS = 5;

type Pick =
  | { event: string; label: string; side: Side } // contract whose label contains this text
  | { event: string; atm: true; side: Side } // contract priced closest to 50¢
  | { event: string; top: number; side: Side }; // the most likely contracts that are still open questions

type Def = {
  id: string;
  name: string;
  blurb: string;
  group: Story["group"];
  settles: string;
  picks: Pick[];
};

const COMMODITIES = ["XAU2611302200", "XAG2611302200", "COPPER2611302200", "BRENT2611302200", "NGAS2611302200"];

const DEFS: Def[] = [
  {
    id: "soft-landing",
    name: "Soft Landing",
    blurb: "Growth holds up, stocks finish the year calm, and nothing breaks on the way.",
    group: "Economy",
    settles: "Year-end 2026",
    picks: [
      { event: "GDP2026", label: "2.1 to 2.5", side: "yes" },
      { event: "SPXEND26", atm: true, side: "yes" },
      { event: "SPXLOW26", label: "6,300 or below", side: "no" },
      { event: "SPXHIGH26", label: "8,000 or above", side: "no" },
      { event: "FED261211", label: "Hike 25bps", side: "yes" },
    ],
  },
  {
    id: "hard-landing",
    name: "Hard Landing",
    blurb: "Stocks sell off, growth misses, and money runs to gold.",
    group: "Economy",
    settles: "Year-end 2026",
    picks: [
      { event: "SPXLOW26", label: "6,300 or below", side: "yes" },
      { event: "GDP2026", label: "2.1 to 2.5", side: "no" },
      { event: "SPXHIGH26", label: "8,000 or above", side: "no" },
      { event: "XAU2611302200", atm: true, side: "yes" },
      { event: "COPPER2611302200", atm: true, side: "no" },
      { event: "BRENT2611302200", atm: true, side: "no" },
    ],
  },
  {
    id: "inflation-is-back",
    name: "Inflation Is Back",
    blurb: "Metals and energy all finish the month higher, and the Fed hikes again.",
    group: "Economy",
    settles: "Nov 30",
    picks: [
      ...COMMODITIES.map((event) => ({ event, atm: true as const, side: "yes" as const })),
      { event: "FED261211", label: "Hike 25bps", side: "yes" },
    ],
  },
  {
    id: "cheap-everything",
    name: "Prices Cool Off",
    blurb: "Metals and energy all slip by month-end.",
    group: "Economy",
    settles: "Nov 30",
    picks: COMMODITIES.map((event) => ({ event, atm: true as const, side: "no" as const })),
  },
  {
    id: "ai-bubble-pops",
    name: "AI Bubble Pops",
    blurb: "Stocks drop, the robots slip, and the big AI deals don't happen.",
    group: "Tech",
    settles: "Year-end 2026",
    picks: [
      { event: "SPXLOW26", label: "6,300 or below", side: "yes" },
      { event: "SPXHIGH26", label: "8,000 or above", side: "no" },
      { event: "OPTIMUSRELEASE", top: 1, side: "no" },
      { event: "USSTAKE", label: "OpenAI", side: "no" },
      { event: "STRIPEPYPL", label: "Before 2027", side: "no" },
    ],
  },
  {
    id: "cabinet-shake-up",
    name: "Cabinet Shake-Up",
    blurb: "The names most likely to leave the administration this year all go.",
    group: "Politics",
    settles: "Year-end 2026",
    picks: [{ event: "CABINET-26", top: 6, side: "yes" }],
  },
  {
    id: "changing-of-the-guard",
    name: "Changing of the Guard",
    blurb: "World leaders on the edge lose their jobs before the year is out.",
    group: "Politics",
    settles: "Year-end 2026",
    picks: [{ event: "LEAVE2026", top: 6, side: "yes" }],
  },
  {
    id: "populist-wave",
    name: "Populist Wave",
    blurb: "Le Pen, Reform, Netanyahu and Vance all come out on top.",
    group: "Politics",
    settles: "2027 and later",
    picks: [
      { event: "FRA2027", label: "Le Pen", side: "yes" },
      { event: "UKGEN2029", label: "Reform", side: "yes" },
      { event: "ILPM26", label: "Netanyahu", side: "yes" },
      { event: "REPNOM2028", label: "Vance", side: "yes" },
      { event: "LEAVE2026", label: "Sánchez", side: "yes" },
    ],
  },
  {
    id: "chalk",
    name: "Favorites Win It All",
    blurb: "The current favorite takes the title in every major league.",
    group: "Sports",
    settles: "2027 seasons",
    picks: ["PROFB2027", "NBAF-2627CHAMP", "CFBCHAMP2627", "NHLSTANLEYCUP27", "MLSCUP26", "EPLCHAMP27", "NCAAMCHAMP27"].map(
      (event) => ({ event, top: 1, side: "yes" as const }),
    ),
  },
  {
    id: "year-of-the-upset",
    name: "Year of the Upset",
    blurb: "Not one of the title favorites finishes the job.",
    group: "Sports",
    settles: "2027 seasons",
    picks: ["PROFB2027", "NBAF-2627CHAMP", "CFBCHAMP2627", "NHLSTANLEYCUP27", "MLSCUP26", "EPLCHAMP27", "NCAAMCHAMP27"].map(
      (event) => ({ event, top: 1, side: "no" as const }),
    ),
  },
];

function toLeg(e: GEvent, c: GContract, side: Side): Leg | null {
  const q = yesQuote(c);
  if (!q) return null;
  const price = side === "yes" ? q.mid : 1 - q.mid;
  const buyNo = c.prices?.buy?.no ? parseFloat(c.prices.buy.no) : 1 - q.bid;
  const buy = side === "yes" ? q.ask : buyNo;
  if (!(price > 0.005 && price < 0.995)) return null;
  return {
    symbol: c.instrumentSymbol,
    eventTicker: e.ticker,
    eventTitle: e.title,
    label: c.label,
    side,
    price,
    buy: Math.min(Math.max(buy, price), 0.99),
    indicative: q.indicative,
    weight: 0,
  };
}

function choose(e: GEvent, pick: Pick): GContract[] {
  const quoted = e.contracts.filter((c) => yesQuote(c));
  if ("label" in pick) {
    const want = pick.label.toLowerCase();
    return quoted.filter((c) => c.label.toLowerCase().includes(want)).slice(0, 1);
  }
  const mid = (c: GContract) => yesQuote(c)!.mid;
  const firm = quoted.filter((c) => !yesQuote(c)!.indicative);
  const pool = firm.length ? firm : quoted;
  if ("atm" in pick) return [...pool].sort((a, b) => Math.abs(mid(a) - 0.5) - Math.abs(mid(b) - 0.5)).slice(0, 1);
  return [...pool].filter((c) => mid(c) < 0.95).sort((a, b) => mid(b) - mid(a)).slice(0, pick.top);
}

function finish(def: Omit<Def, "picks">, legs: Leg[]): Story | null {
  const seen = new Set<string>();
  legs = legs.filter((l) => !seen.has(l.symbol) && seen.add(l.symbol));
  if (legs.length < MIN_LEGS) return null;
  const w = 1 / legs.length;
  legs.forEach((l) => (l.weight = w));
  const index = legs.reduce((s, l) => s + l.weight * l.price, 0) * 100;
  const buyPrice = legs.reduce((s, l) => s + l.weight * l.buy, 0);
  return { ...def, legs, index, buyPrice, tranches: priceTranches(legs.map((l) => l.price), Math.max(buyPrice - index / 100, 0)) };
}

async function build(def: Def): Promise<Story | null> {
  const tickers = [...new Set(def.picks.map((p) => p.event))];
  const events = new Map<string, GEvent | null>();
  await Promise.all(tickers.map(async (t) => events.set(t, await getEvent(t))));
  const legs: Leg[] = [];
  for (const pick of def.picks) {
    const e = events.get(pick.event);
    if (!e) continue;
    for (const c of choose(e, pick)) {
      const leg = toLeg(e, c, pick.side);
      if (leg) legs.push(leg);
    }
  }
  const { picks: _picks, ...rest } = def;
  return finish(rest, legs);
}

// Weather: one market per city per day, split into temperature ranges.
const REGIONS: { id: string; name: string; cities: string[] }[] = [
  { id: "north", name: "Up North", cities: ["MSP", "CHI", "DTW", "MKE", "CLE", "BUF", "PIT", "CMH", "IND", "CVG"] },
  { id: "northeast", name: "in the Northeast", cities: ["BOS", "NYC", "PHL", "BWI", "DCA", "RIC"] },
  { id: "south", name: "in the South", cities: ["ATL", "BNA", "BHM", "MEM", "MSY", "JAX", "RDU", "SDF"] },
  { id: "texas", name: "in Texas and the Plains", cities: ["DFW", "HOU", "AUS", "SAT", "OKC", "TUL", "MCI", "OMA"] },
  { id: "west", name: "Out West", cities: ["LA", "SAN", "SFO", "SAC", "SEA", "PDX", "LAS", "PHX", "TUS", "SLC"] },
  { id: "florida", name: "in the Sun Belt", cities: ["MIA", "TPA", "MCO", "JAX", "MSY", "HOU", "PHX"] },
];

async function buildWeather(): Promise<Story[]> {
  const events = (await getCategory("Weather")).filter((e) => e.ticker.startsWith("WXHIGH-"));
  // Ticker looks like WXHIGH-ATL-2611180459: city code, then the settle time.
  const byDay = new Map<string, Map<string, GEvent>>();
  for (const e of events) {
    const [, city, stamp] = e.ticker.split("-");
    const day = stamp?.slice(0, 6);
    if (!city || !day) continue;
    if (!byDay.has(day)) byDay.set(day, new Map());
    byDay.get(day)!.set(city, e);
  }
  const day = [...byDay.keys()].sort().pop();
  if (!day) return [];
  const cities = byDay.get(day)!;
  const when = events.find((e) => e.ticker.endsWith(day + e.ticker.slice(-4)))?.title.match(/on (\w+ \d+)/)?.[1] ?? "Tomorrow";
  const out: Story[] = [];
  for (const r of REGIONS) {
    for (const mode of ["cold", "warm"] as const) {
      const legs: Leg[] = [];
      for (const code of r.cities) {
        const e = cities.get(code);
        if (!e) continue;
        // Pick the likeliest range on the cold (or warm) side of the range the market expects most.
        const ranges = e.contracts
          .filter((c) => yesQuote(c))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || parseInt(a.label) - parseInt(b.label));
        if (!ranges.length) continue;
        const mids = ranges.map((c) => yesQuote(c)!.mid);
        const modal = mids.indexOf(Math.max(...mids));
        const side = mode === "cold" ? ranges.slice(0, Math.max(modal, 1)) : ranges.slice(Math.min(modal + 1, ranges.length - 1));
        const edge = [...side].sort((a, b) => yesQuote(b)!.mid - yesQuote(a)!.mid)[0];
        const leg = edge && toLeg(e, edge, "yes");
        if (leg) legs.push({ ...leg, eventTitle: e.title.replace(/^Highest temperature in /, "").replace(/ on .*/, "") });
      }
      const s = finish(
        {
          id: `wx-${mode}-${r.id}`,
          name: mode === "cold" ? `Cold Snap ${r.name}` : `Warm Spell ${r.name}`,
          blurb:
            mode === "cold"
              ? "Every city comes in colder than the market expects."
              : "Every city comes in warmer than the market expects.",
          group: "Weather",
          settles: when,
        },
        legs,
      );
      if (s) out.push(s);
    }
  }
  return out;
}

export async function getStories(): Promise<Story[]> {
  const [fixed, weather] = await Promise.all([
    Promise.all(DEFS.map(build)),
    buildWeather().catch(() => [] as Story[]),
  ]);
  return [...fixed.filter((s): s is Story => !!s), ...weather];
}

export async function getStory(id: string): Promise<Story | null> {
  if (id.startsWith("wx-")) return (await buildWeather()).find((s) => s.id === id) ?? null;
  const def = DEFS.find((d) => d.id === id);
  return def ? build(def) : null;
}

/** Index history rebuilt from each leg's hourly closes. */
export async function getHistory(story: Story, days = 10): Promise<Point[]> {
  const series = await Promise.all(story.legs.map((l) => getCandles(l.symbol)));
  const since = Date.now() - days * 86_400_000;
  const stamps = [...new Set(series.flat().map(([t]) => t))].filter((t) => t >= since).sort((a, b) => a - b);
  const cursor = series.map(() => 0);
  const last: (number | null)[] = series.map((s) => {
    // Start each leg at its latest close before the window, if it has one.
    const before = s.filter(([t]) => t < since).pop();
    return before ? before[1] : null;
  });
  const points: Point[] = [];
  for (const t of stamps) {
    let v = 0;
    story.legs.forEach((leg, i) => {
      const s = series[i];
      while (cursor[i] < s.length && s[cursor[i]][0] <= t) {
        if (s[cursor[i]][0] >= since) last[i] = s[cursor[i]][1];
        cursor[i]++;
      }
      const yes = last[i] ?? (leg.side === "yes" ? leg.price : 1 - leg.price);
      v += leg.weight * (leg.side === "yes" ? yes : 1 - yes);
    });
    points.push({ t, v: v * 100 });
  }
  // Carry the last traded level through to now. History is built from trades and the
  // headline index from live quotes, so the two are kept on separate footing here.
  if (points.length) points.push({ t: Date.now(), v: points[points.length - 1].v });
  return points;
}
