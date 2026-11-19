import { getCandles, getCategory, getEvent, yesQuote, type Frame, type GContract, type GEvent } from "./gemini";
import { corrNow, refreshCorr } from "./corr";
import { priceTranches } from "./math";
import { keepRecording, record, recorded } from "./recorder";
import type { History, Leg, Mover, Point, Range, Side, Story } from "./types";

/** A story never shows with fewer legs than this. */
export const MIN_LEGS = 5;
/** Generated baskets stop at this many legs so each one still matters. */
const MAX_LEGS = 8;

type Pick =
  | { event: string; label: string; side: Side } // contract whose label contains this text
  | { event: string; atm: true; side: Side } // contract priced closest to 50¢
  | { event: string; top: number; side: Side } // the most likely contracts that are still open questions
  | { event: string; fav: true; side: Side } // the single most likely contract
  | { event: string; near: number; side: Side }; // the contracts closest to a coin flip

type Def = {
  id: string;
  name: string;
  blurb: string;
  group: Story["group"];
  settles: string;
  /** How strongly the legs are expected to move together before any measurement, 0 to 1. */
  prior?: number;
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
  {
    id: "melt-up",
    name: "Melt-Up",
    blurb: "Stocks keep climbing into year-end and never look back.",
    group: "Economy",
    settles: "Year-end 2026",
    picks: [
      { event: "SPXHIGH26", label: "8,000 or above", side: "yes" },
      { event: "SPXHIGH26", label: "8,200 or above", side: "yes" },
      { event: "SPXEND26", label: "7,800 to 7,999", side: "yes" },
      { event: "SPXLOW26", label: "6,300 or below", side: "no" },
      { event: "NASDAQ2026", top: 2, side: "yes" },
      { event: "GDP2026", label: "2.1 to 2.5", side: "yes" },
    ],
  },
  {
    id: "indictment-season",
    name: "Indictment Season",
    blurb: "The people the market thinks are most likely to face federal charges all do.",
    group: "Politics",
    settles: "Year-end 2026",
    picks: [{ event: "FEDCRIME26", top: 6, side: "yes" }],
  },
  {
    id: "nobody-gets-charged",
    name: "Nobody Gets Charged",
    blurb: "The headlines come and go, and none of the big names is charged.",
    group: "Politics",
    settles: "Year-end 2026",
    picks: [{ event: "FEDCRIME26", top: 6, side: "no" }],
  },
  {
    id: "steady-administration",
    name: "Steady Administration",
    blurb: "Everyone the market expects to leave the administration stays put.",
    group: "Politics",
    settles: "Year-end 2026",
    picks: [{ event: "CABINET-26", top: 6, side: "no" }],
  },
  {
    id: "leaders-hold-on",
    name: "Leaders Hold On",
    blurb: "The world leaders on the edge all survive the year.",
    group: "Politics",
    settles: "Year-end 2026",
    picks: [{ event: "LEAVE2026", top: 6, side: "no" }],
  },
  {
    id: "establishment-holds",
    name: "Establishment Holds",
    blurb: "Le Pen, Reform and Vance all fall short, and Israel changes leaders.",
    group: "Politics",
    settles: "2027 and later",
    picks: [
      { event: "FRA2027", label: "Le Pen", side: "no" },
      { event: "UKGEN2029", label: "Reform", side: "no" },
      { event: "REPNOM2028", label: "Vance", side: "no" },
      { event: "LEAVE2026", label: "Netanyahu", side: "yes" },
      { event: "ILPM26", label: "Eizenkot", side: "yes" },
      { event: "UKGEN2029", label: "Labour", side: "yes" },
    ],
  },
  {
    id: "new-ticket-2028",
    name: "Fresh Faces in 2028",
    blurb: "Ossoff tops the Democratic ticket, Rubio rises, and the front-runners of today fade.",
    group: "Politics",
    settles: "2028",
    picks: [
      { event: "DEMNOM2028", label: "Ossoff", side: "yes" },
      { event: "PRES2028", label: "Ossoff", side: "yes" },
      { event: "REPNOM2028", label: "Rubio", side: "yes" },
      { event: "REPNOM2028", label: "Vance", side: "no" },
      { event: "DEMNOM2028", label: "Newsom", side: "no" },
      { event: "DEMVP28", fav: true, side: "yes" },
    ],
  },
  {
    id: "division-leaders",
    name: "Division Leaders Hold On",
    blurb: "Every NFL division is won by the team leading it today.",
    group: "Sports",
    settles: "January 2027",
    picks: ["AFCNORTH", "AFCSOUTH", "AFCEAST", "AFCWEST", "NFCNORTH", "NFCSOUTH", "NFCEAST", "NFCWEST"].map((d) => ({
      event: `NFL${d}26`,
      fav: true as const,
      side: "yes" as const,
    })),
  },
  {
    id: "division-chaos",
    name: "Division Chaos",
    blurb: "Every NFL division leader gets caught from behind.",
    group: "Sports",
    settles: "January 2027",
    picks: ["AFCNORTH", "AFCSOUTH", "AFCEAST", "AFCWEST", "NFCNORTH", "NFCSOUTH", "NFCEAST", "NFCWEST"].map((d) => ({
      event: `NFL${d}26`,
      fav: true as const,
      side: "no" as const,
    })),
  },
  {
    id: "conference-chalk",
    name: "Conference Chalk",
    blurb: "The favorite wins every major college football conference.",
    group: "Sports",
    settles: "December 2026",
    picks: ["CFBSEC26", "CFBBIGTEN26", "CFBBIG1226", "CFBACC26", "CFBAAC26", "CFBMWC26", "CFBMAC26", "CFBSUNBELT26"].map(
      (event) => ({ event, fav: true as const, side: "yes" as const }),
    ),
  },
  {
    id: "conference-upsets",
    name: "Conference Upsets",
    blurb: "Not one college football conference favorite takes its title.",
    group: "Sports",
    settles: "December 2026",
    picks: ["CFBSEC26", "CFBBIGTEN26", "CFBBIG1226", "CFBACC26", "CFBAAC26", "CFBMWC26", "CFBMAC26", "CFBSUNBELT26"].map(
      (event) => ({ event, fav: true as const, side: "no" as const }),
    ),
  },
  {
    id: "nba-bubble",
    name: "Bubble Teams Get In",
    blurb: "The NBA teams sitting on the playoff line all make it.",
    group: "Sports",
    settles: "April 2027",
    picks: [{ event: "NBAPLAYOFFS26-27", near: 6, side: "yes" }],
  },
  {
    id: "cfp-bubble",
    name: "Playoff Bubble",
    blurb: "The college football teams on the playoff line all get a spot.",
    group: "Sports",
    settles: "December 2026",
    picks: [{ event: "CFBPLAYOFF2627", near: 6, side: "yes" }],
  },
  {
    id: "vegas-podium",
    name: "Vegas Podium Chalk",
    blurb: "The drivers most likely to reach the Las Vegas podium all get there.",
    group: "Sports",
    settles: "Nov 22",
    picks: [{ event: "F1-LASGP-POD-20261122", top: 5, side: "yes" }],
  },
  {
    id: "vegas-chaos",
    name: "Vegas Chaos",
    blurb: "The Las Vegas front-runners all miss the podium.",
    group: "Sports",
    settles: "Nov 22",
    picks: [{ event: "F1-LASGP-POD-20261122", top: 5, side: "no" }],
  },
];

export function toLeg(e: GEvent, c: GContract, side: Side): Leg | null {
  const q = yesQuote(c);
  if (!q) return null;
  const price = side === "yes" ? q.mid : 1 - q.mid;
  if (!(price > 0.005 && price < 0.995)) return null;
  // A No is bought at Gemini's No price when it gives one, else at 1 minus the Yes bid.
  const noAsk = c.prices?.buy?.no && !q.indicative ? parseFloat(c.prices.buy.no) : 1 - q.bid;
  const ask = side === "yes" ? q.ask : noAsk;
  const bid = side === "yes" ? q.bid : 1 - q.ask;
  return {
    symbol: c.instrumentSymbol,
    eventTicker: e.ticker,
    eventTitle: e.title,
    label: c.label,
    side,
    price,
    buy: Math.min(Math.max(ask, price), 0.99),
    sell: Math.max(Math.min(bid, price), 0),
    indicative: q.indicative,
    weight: 0,
    start: Number.isFinite(Date.parse(e.startTime ?? "")) ? Date.parse(e.startTime!) : undefined,
    expiry: Number.isFinite(Date.parse(e.expiryDate ?? "")) ? Date.parse(e.expiryDate!) : undefined,
    vol24h: parseFloat(e.volume24h ?? "") || 0,
    vol: parseFloat(e.volume ?? "") || 0,
    image: c.imageUrl || e.imageUrl || undefined,
  };
}

/** Volume across a basket's markets, counting each event once (several legs can share one). */
function volumes(legs: Leg[]) {
  const byEvent = new Map<string, Leg>();
  for (const l of legs) byEvent.set(l.eventTicker, l);
  let day = 0;
  let all = 0;
  for (const l of byEvent.values()) {
    day += l.vol24h ?? 0;
    all += l.vol ?? 0;
  }
  return { volume24h: day, volume: all };
}

const mid = (c: GContract) => yesQuote(c)!.mid;
/** Contracts with a tight two-sided book, or every quoted one if none are tight. */
function firmOnes(e: GEvent) {
  const quoted = e.contracts.filter((c) => yesQuote(c));
  const firm = quoted.filter((c) => !yesQuote(c)!.indicative);
  return firm.length ? firm : quoted;
}
const atm = (e: GEvent) => [...firmOnes(e)].sort((a, b) => Math.abs(mid(a) - 0.5) - Math.abs(mid(b) - 0.5))[0];

function choose(e: GEvent, pick: Pick): GContract[] {
  if ("label" in pick) {
    const want = pick.label.toLowerCase();
    return e.contracts.filter((c) => yesQuote(c) && c.label.toLowerCase().includes(want)).slice(0, 1);
  }
  const pool = firmOnes(e);
  if ("atm" in pick) return [atm(e)].filter(Boolean);
  if ("fav" in pick) return [...pool].sort((a, b) => mid(b) - mid(a)).slice(0, 1);
  if ("near" in pick) return [...pool].sort((a, b) => Math.abs(mid(a) - 0.5) - Math.abs(mid(b) - 0.5)).slice(0, pick.near);
  return [...pool].filter((c) => mid(c) < 0.95).sort((a, b) => mid(b) - mid(a)).slice(0, pick.top);
}

/** Turn priced legs into a story. `weights` are relative; equal when left out. */
export function finish(def: Omit<Def, "picks">, legs: Leg[], weights?: number[]): Story | null {
  const seen = new Set<string>();
  const keep = legs.map((l, i) => ({ l, w: weights?.[i] ?? 1 })).filter(({ l }) => !seen.has(l.symbol) && seen.add(l.symbol)).slice(0, MAX_LEGS);
  if (keep.length < MIN_LEGS) return null;
  const total = keep.reduce((s, k) => s + k.w, 0);
  legs = keep.map(({ l, w }) => ({ ...l, weight: w / total }));
  const sum = (f: (l: Leg) => number) => legs.reduce((s, l) => s + l.weight * f(l), 0);
  const index = sum((l) => l.price) * 100;
  const buyPrice = sum((l) => l.buy);
  const sellPrice = sum((l) => l.sell);
  const { prior = 0, ...rest } = def;
  return {
    ...rest,
    legs,
    index,
    buyPrice,
    sellPrice,
    ...volumes(legs),
    tranches: priceTranches(
      legs.map((l) => l.price),
      legs.map((l) => l.weight),
      Math.max(buyPrice - index / 100, 0),
      corrNow(legs, prior),
    ),
  };
}

/** Priors by story id, so a story found by id can have its correlations measured. */
const priors = new Map<string, number>();
const remember = (s: Story | null, prior = 0) => (s && priors.set(s.id, prior), s);
export const priorOf = (id: string) => priors.get(id) ?? 0;
/** Legs someone picked for one idea are assumed to lean the same way, a little. */
export const COMMUNITY_PRIOR = 0.2;

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
  return remember(finish(rest, legs), def.prior);
}

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const span = (a: number, b: number) => (day.format(a) === day.format(b) ? day.format(a) : `${day.format(a)} to ${day.format(b)}`);

// ---- Commodities: one price ladder per metal or fuel per expiry date. ----
const BASKETS = [
  { id: "metals", name: "Metals", what: "Gold, silver and copper", codes: ["XAU", "XAG", "COPPER"] },
  { id: "energy", name: "Energy", what: "Oil and natural gas", codes: ["BRENT", "WTI", "NGAS"] },
];

async function buildCommodities(): Promise<Story[]> {
  const events = await getCategory("Commodities");
  const out: Story[] = [];
  for (const b of BASKETS) {
    const mine = events
      .filter((e) => b.codes.includes(e.ticker.replace(/\d+$/, "")))
      .sort((x, y) => x.ticker.replace(/^\D+/, "").localeCompare(y.ticker.replace(/^\D+/, "")));
    for (const up of [true, false]) {
      const legs: Leg[] = [];
      for (const e of mine) {
        const c = atm(e);
        const leg = c && !yesQuote(c)!.indicative && toLeg(e, c, up ? "yes" : "no");
        if (leg) legs.push(leg);
      }
      const ends = mine.map((e) => Date.parse(e.expiryDate ?? "")).filter(Number.isFinite);
      const s = finish(
        {
          id: `com-${b.id}-${up ? "up" : "down"}`,
          name: up ? `${b.name} ${b.id === "metals" ? "Rally" : "Spike"}` : `${b.name} ${b.id === "metals" ? "Slide" : "Slump"}`,
          blurb: `${b.what} finish ${up ? "above" : "below"} the market's line on every date this month.`,
          group: "Economy",
          settles: ends.length ? span(Math.min(...ends), Math.max(...ends)) : "This month",
          prior: 0.3,
        },
        legs,
      );
      if (remember(s, 0.3)) out.push(s!);
    }
  }
  return out;
}

// ---- Sports: game slates and team baskets, rebuilt from whatever is listed. ----
const LEAGUES = [
  { id: "nfl", prefix: "NFL", name: "NFL", total: "T" },
  { id: "nba", prefix: "NBA", name: "NBA", total: "T" },
  { id: "nhl", prefix: "NHL", name: "NHL", total: "T" },
  { id: "cfb", prefix: "NCAAF", name: "College Football", total: "T" },
  { id: "cbb", prefix: "NCAAM", name: "College Hoops", total: "T" },
  { id: "epl", prefix: "EPL", name: "Premier League", total: "REGT" },
  { id: "ucl", prefix: "UCL", name: "Champions League", total: "" },
  { id: "laliga", prefix: "LALIGA", name: "La Liga", total: "" },
];
const WEEK = 7 * 86_400_000;

function buildSlates(sports: GEvent[]): Story[] {
  const now = Date.now();
  const out: Story[] = [];
  for (const lg of LEAGUES) {
    // Games that have not started, soonest first, within a week of the first one.
    const games = (suffix: string) => {
      const list = sports
        .filter((e) => {
          const p = e.ticker.split("-");
          return p.length >= 4 && p[0] === lg.prefix && p[p.length - 1] === suffix && Date.parse(e.startTime ?? "") > now;
        })
        .sort((a, b) => Date.parse(a.startTime!) - Date.parse(b.startTime!));
      return list.filter((e) => Date.parse(e.startTime!) - Date.parse(list[0].startTime!) < WEEK);
    };
    const make = (id: string, name: string, blurb: (n: number) => string, pool: GEvent[], pick: (e: GEvent) => Leg | null) => {
      const legs: Leg[] = [];
      const starts: number[] = [];
      for (const e of pool) {
        if (legs.length >= MAX_LEGS) break;
        const leg = pick(e);
        if (!leg) continue;
        legs.push(leg);
        starts.push(Date.parse(e.startTime!));
      }
      if (legs.length < MIN_LEGS) return;
      const s = finish({ id, name, blurb: blurb(legs.length), group: "Games", settles: span(Math.min(...starts), Math.max(...starts)) }, legs);
      if (s) out.push(s);
    };
    // The favorite is the likeliest side that is not a draw, and only counts with a tight book.
    const favorite = (e: GEvent) => {
      const c = e.contracts
        .filter((x) => yesQuote(x) && !/^(tie|draw)$/i.test(x.label))
        .sort((a, b) => mid(b) - mid(a))[0];
      return c && !yesQuote(c)!.indicative ? c : null;
    };
    const line = (e: GEvent) => {
      const c = atm(e);
      return c && !yesQuote(c)!.indicative && Math.abs(mid(c) - 0.5) < 0.2 ? c : null;
    };
    const wins = games("M");
    make(`sl-${lg.id}-fav`, `${lg.name} Favorites`, (n) => `The favorite wins each of the next ${n} games.`, wins, (e) => {
      const c = favorite(e);
      return c ? toLeg(e, c, "yes") : null;
    });
    make(`sl-${lg.id}-dog`, `${lg.name} Upsets`, (n) => `The favorite fails to win in each of the next ${n} games.`, wins, (e) => {
      const c = favorite(e);
      return c ? toLeg(e, c, "no") : null;
    });
    if (!lg.total) continue;
    const totals = games(lg.total);
    make(`sl-${lg.id}-over`, `${lg.name} Shootouts`, (n) => `Each of the next ${n} games scores more than the market expects.`, totals, (e) => {
      const c = line(e);
      return c ? toLeg(e, c, "yes") : null;
    });
    make(`sl-${lg.id}-under`, `${lg.name} Grinders`, (n) => `Each of the next ${n} games scores less than the market expects.`, totals, (e) => {
      const c = line(e);
      return c ? toLeg(e, c, "no") : null;
    });
  }
  return out;
}

const DIVISIONS = ["AFCNORTH", "AFCSOUTH", "AFCEAST", "AFCWEST", "NFCNORTH", "NFCSOUTH", "NFCEAST", "NFCWEST"].map((d) => `NFL${d}26`);
const NFL_TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAC", "KC", "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS"];
/**
 * Season-long sports markets. Gemini's category listing stops at 1,000 events and game
 * markets fill it, so these are always fetched by ticker.
 */
export const SEASON_TICKERS = [
  "PROFB2027", "AFCCHAMP27", "NFCCHAMP27", "NFLBESTRECORD26-27", "NFLMVP2026",
  "NBAF-2627CHAMP", "NBAF-2627CONF-EAST", "NBAF-2627CONF-WEST", "NBAPLAYOFFS26-27", "NBABESTRECORD26-27", "NBAWORSTRECORD26-27",
  "CFBCHAMP2627", "CFBPLAYOFF2627", "CFBHEISMAN2627", "NHLSTANLEYCUP27", "MLSCUP26", "EPLCHAMP27", "NCAAMCHAMP27",
  ...DIVISIONS,
  ...NFL_TEAMS.map((t) => `NFL${t}WINS26`),
];

async function seasonEvents() {
  const got = await Promise.all(SEASON_TICKERS.map((t) => getEvent(t)));
  return got.filter((e): e is GEvent => !!e);
}

/** One team across every market it appears in: title, conference, division, record, wins, next game. */
async function buildTeams(sports: GEvent[]): Promise<Story[]> {
  const by = new Map([...sports, ...(await seasonEvents())].map((e) => [e.ticker, e]));
  const now = Date.now();
  const find = (e: GEvent | undefined, team: string) => e?.contracts.find((c) => c.label === team && yesQuote(c));
  const nextGame = (prefix: string, team: string) =>
    sports
      .filter((e) => e.ticker.startsWith(prefix + "-") && e.ticker.endsWith("-M") && Date.parse(e.startTime ?? "") > now)
      .sort((a, b) => Date.parse(a.startTime!) - Date.parse(b.startTime!))
      .find((e) => find(e, team));
  const out: Story[] = [];
  const add = (id: string, team: string, settles: string, parts: [GEvent | undefined, GContract | undefined][]) => {
    const legs = parts.map(([e, c]) => (e && c ? toLeg(e, c, "yes") : null)).filter((l): l is Leg => !!l);
    const s = finish(
      {
        id,
        name: `All In on ${team}`,
        blurb: `${team} wins its next game, its division or conference, and the title.`,
        group: "Sports",
        settles,
        // One team across markets: these rise and fall together.
        prior: 0.6,
      },
      legs,
    );
    if (remember(s, 0.6)) out.push(s!);
  };
  const top = (ticker: string, n: number) => {
    const e = by.get(ticker);
    return e ? [...firmOnes(e)].sort((a, b) => mid(b) - mid(a)).slice(0, n).map((c) => c.label) : [];
  };

  const divisions = DIVISIONS.map((t) => by.get(t)).filter((e): e is GEvent => !!e);
  for (const team of top("PROFB2027", 6)) {
    const div = divisions.find((e) => find(e, team));
    const abbr = div && find(div, team)!.instrumentSymbol.split("-").pop();
    const winsEvent = abbr ? by.get(`NFL${abbr}WINS26`) : undefined;
    const conf = [by.get("AFCCHAMP27"), by.get("NFCCHAMP27")].find((e) => find(e, team));
    const game = nextGame("NFL", team);
    add(`team-nfl-${team.toLowerCase().replace(/\W+/g, "-")}`, team, "2026 season", [
      [game, find(game, team)],
      [winsEvent, winsEvent && atm(winsEvent)],
      [div, find(div, team)],
      [by.get("NFLBESTRECORD26-27"), find(by.get("NFLBESTRECORD26-27"), team)],
      [conf, find(conf, team)],
      [by.get("PROFB2027"), find(by.get("PROFB2027"), team)],
    ]);
  }
  for (const team of top("NBAF-2627CHAMP", 6)) {
    const conf = [by.get("NBAF-2627CONF-EAST"), by.get("NBAF-2627CONF-WEST")].find((e) => find(e, team));
    const game = nextGame("NBA", team);
    add(`team-nba-${team.toLowerCase().replace(/\W+/g, "-")}`, team, "2026-27 season", [
      [game, find(game, team)],
      [by.get("NBAPLAYOFFS26-27"), find(by.get("NBAPLAYOFFS26-27"), team)],
      [by.get("NBABESTRECORD26-27"), find(by.get("NBABESTRECORD26-27"), team)],
      [conf, find(conf, team)],
      [by.get("NBAF-2627CHAMP"), find(by.get("NBAF-2627CHAMP"), team)],
    ]);
  }
  return out;
}

// ---- Weather: one market per city per day, split into temperature ranges. ----
const REGIONS: { id: string; name: string; cities: string[] }[] = [
  { id: "north", name: "Up North", cities: ["MSP", "CHI", "DTW", "MKE", "CLE", "BUF", "PIT", "CMH", "IND", "CVG"] },
  { id: "northeast", name: "in the Northeast", cities: ["BOS", "NYC", "PHL", "BWI", "DCA", "RIC"] },
  { id: "south", name: "in the South", cities: ["ATL", "BNA", "BHM", "MEM", "MSY", "JAX", "RDU", "SDF"] },
  { id: "texas", name: "in Texas and the Plains", cities: ["DFW", "HOU", "AUS", "SAT", "OKC", "TUL", "MCI", "OMA"] },
  { id: "west", name: "Out West", cities: ["LA", "SAN", "SFO", "SAC", "SEA", "PDX", "LAS", "PHX", "TUS", "SLC"] },
  { id: "florida", name: "in the Sun Belt", cities: ["MIA", "TPA", "MCO", "JAX", "MSY", "HOU", "PHX"] },
  { id: "bigcities", name: "in the Big Cities", cities: ["NYC", "LA", "CHI", "HOU", "PHX", "PHL", "DFW", "MIA", "ATL", "BOS", "SFO", "SEA"] },
];

async function buildWeather(): Promise<Story[]> {
  const events = (await getCategory("Weather")).filter((e) => e.ticker.startsWith("WXHIGH-"));
  // Ticker looks like WXHIGH-ATL-2611180459: city code, then the settle time.
  const byDay = new Map<string, Map<string, GEvent>>();
  for (const e of events) {
    const [, city, stamp] = e.ticker.split("-");
    const d = stamp?.slice(0, 6);
    if (!city || !d) continue;
    if (!byDay.has(d)) byDay.set(d, new Map());
    byDay.get(d)!.set(city, e);
  }
  const latest = [...byDay.keys()].sort().pop();
  if (!latest) return [];
  const cities = byDay.get(latest)!;
  const when = [...cities.values()][0]?.title.match(/on (\w+ \d+)/)?.[1] ?? "Tomorrow";
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
        const mids = ranges.map(mid);
        const modal = mids.indexOf(Math.max(...mids));
        const side = mode === "cold" ? ranges.slice(0, Math.max(modal, 1)) : ranges.slice(Math.min(modal + 1, ranges.length - 1));
        const edge = [...side].sort((a, b) => mid(b) - mid(a))[0];
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
          // Neighbouring cities share the same weather system.
          prior: 0.3,
        },
        legs,
      );
      if (remember(s, 0.3)) out.push(s!);
    }
  }
  return out;
}

// ---- Crypto: each coin's price ladder at the same settle time, rebuilt as the dates roll on. ----
const COINS: Record<string, string> = { BTC: "Bitcoin", ETH: "Ether", SOL: "Solana", XRP: "XRP", ZEC: "Zcash", HYPE: "Hyperliquid" };
/** Coins move together far more than most markets, so the prior is strong until it's measured. */
const CRYPTO_PRIOR = 0.6;
const etTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "America/New_York" });
const lastOfMonth = (t: number) => new Date(t + 86_400_000).getUTCDate() === 1;
const names = (codes: string[]) => {
  const n = codes.map((c) => COINS[c] ?? c);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n[0] ?? "";
};

/** "$64,500 or above" means little without the coin, so put its name on the label. */
const coinLabel = (l: Leg): Leg => ({ ...l, label: `${COINS[l.eventTicker.replace(/\d+$/, "")]} ${l.label}` });

async function buildCrypto(): Promise<Story[]> {
  const now = Date.now();
  // Only the dated price ladders (BTC2611202200). The 5- and 15-minute and next-hour markets settle too fast to hold.
  const ladders = (await getCategory("Crypto")).filter((e) => {
    const code = e.ticker.replace(/\d+$/, "");
    const end = Date.parse(e.expiryDate ?? "");
    return COINS[code] && /\d{10}$/.test(e.ticker) && !/today at/i.test(e.title) && end - now > 20 * 60_000;
  });
  // Settle time -> coin -> event.
  const byTime = new Map<number, Map<string, GEvent>>();
  for (const e of ladders) {
    const t = Date.parse(e.expiryDate!);
    if (!byTime.has(t)) byTime.set(t, new Map());
    byTime.get(t)!.set(e.ticker.replace(/\d+$/, ""), e);
  }
  const times = [...byTime.keys()].filter((t) => byTime.get(t)!.size >= MIN_LEGS).sort((a, b) => a - b);
  if (!times.length) return [];
  const leg = (e: GEvent, side: Side) => {
    const c = atm(e);
    return c && !yesQuote(c)!.indicative ? toLeg(e, c, side) : null;
  };
  const when = (t: number) => `${day.format(t)}, ${etTime.format(t)} ET`;

  // Next settle, the one after, and the furthest out: today, this week, the month.
  const slots: { key: string; t: number; up: string; down: string }[] = [];
  const first = times[0];
  slots.push({ key: "day", t: first, up: "Green Close", down: "Red Close" });
  const week = times.find((t) => t > first && t - first < 8 * 86_400_000 && t !== times.at(-1));
  if (week) slots.push({ key: "week", t: week, up: "Green Week", down: "Red Week" });
  const last = times.at(-1)!;
  if (last !== first)
    slots.push(lastOfMonth(last) ? { key: "month", t: last, up: "Month-End Moon", down: "Crypto Winter" } : { key: "month", t: last, up: "Long Haul Up", down: "Long Haul Down" });

  const out: Story[] = [];
  for (const slot of slots) {
    const coins = byTime.get(slot.t)!;
    for (const up of [true, false]) {
      const legs = [...coins.entries()].map(([, e]) => leg(e, up ? "yes" : "no")).filter((l): l is Leg => !!l);
      const s = finish(
        {
          id: `cx-${slot.key}-${up ? "up" : "down"}`,
          name: up ? slot.up : slot.down,
          blurb: `${names([...coins.keys()])} all finish ${up ? "above" : "below"} the market's line at ${etTime.format(slot.t)} ET on ${day.format(slot.t)}.`,
          group: "Crypto",
          settles: when(slot.t),
          prior: CRYPTO_PRIOR,
        },
        legs.map(coinLabel),
      );
      if (remember(s, CRYPTO_PRIOR)) out.push(s!);
    }
  }

  // Bitcoin and Ether above the line at every date at once: one trade that holds through the month.
  const majors: Leg[] = [];
  for (const t of times)
    for (const code of ["BTC", "ETH"]) {
      const e = byTime.get(t)!.get(code);
      const l = e && leg(e, "yes");
      if (l) majors.push({ ...coinLabel(l), label: `${COINS[code]} ${l.label.replace(/ or above$/, "+")} on ${day.format(t)}` });
    }
  const m = finish(
    {
      id: "cx-majors",
      name: "Majors Climb",
      blurb: `Bitcoin and Ether finish above the market's line on every date from ${day.format(first)} to ${day.format(last)}.`,
      group: "Crypto",
      settles: span(first, last),
      prior: CRYPTO_PRIOR,
    },
    majors,
  );
  if (remember(m, CRYPTO_PRIOR)) out.push(m!);
  return out;
}

const safely = (p: Promise<Story[]>) => p.catch(() => [] as Story[]);

export async function getStories(): Promise<Story[]> {
  const sports = getCategory("Sports").catch(() => [] as GEvent[]);
  const [fixed, commodities, crypto, slates, teams, weather] = await Promise.all([
    Promise.all(DEFS.map(build)),
    safely(buildCommodities()),
    safely(buildCrypto()),
    safely(sports.then(buildSlates)),
    safely(sports.then(buildTeams)),
    safely(buildWeather()),
  ]);
  // Imported here, not at the top, because community stories are built with this file's helpers.
  const community = await import("./community").then((m) => m.buildAll()).catch(() => [] as Story[]);
  community.forEach((c) => remember(c, COMMUNITY_PRIOR));
  const all = [...fixed.filter((s): s is Story => !!s), ...commodities, ...crypto, ...teams, ...slates, ...weather, ...community];
  record(all);
  keepRecording(getStories);
  return all;
}

async function find(id: string): Promise<Story | null> {
  const def = DEFS.find((d) => d.id === id);
  if (def) return build(def);
  return (await getStories()).find((s) => s.id === id) ?? null;
}

/** One story, with its leg correlations measured from price history before it is priced. */
export async function getStory(id: string): Promise<Story | null> {
  const first = await find(id);
  if (!first) return null;
  await refreshCorr(first.legs, priors.get(id) ?? 0);
  return find(id);
}

/** Quote for one exact contract, for valuing a position on the legs it was bought with. */
export async function markLeg(eventTicker: string, symbol: string, side: Side) {
  const e = await getEvent(eventTicker);
  const c = e?.contracts.find((x) => x.instrumentSymbol === symbol);
  // A resolved contract pays $1 to the winning side and nothing to the other.
  if (c?.resolutionSide === "yes" || c?.resolutionSide === "no") {
    const won = c.resolutionSide === side ? 1 : 0;
    return { price: won, bid: won, ask: won, settled: true };
  }
  const q = c && yesQuote(c);
  if (!q) return null;
  return side === "yes" ? { price: q.mid, bid: q.bid, ask: q.ask } : { price: 1 - q.mid, bid: 1 - q.ask, ask: 1 - q.bid };
}

const FRAMES: Record<Range, { frame: Frame; days: number }> = {
  "1d": { frame: "5m", days: 1 },
  "1w": { frame: "15m", days: 7 },
  "1m": { frame: "1hr", days: 30 },
};

/**
 * Index history: 5-minute bars for a day, 15-minute for a week, hourly for a month.
 *
 * The shape comes from each leg's traded closes. Trades can be hours old on a thin
 * contract, so every leg's line is shifted by a constant so that it ends at today's
 * live mid. That keeps each traded move as it happened and makes the line end exactly
 * at the headline index. Also returns how much of the change came from each leg.
 */
export async function getHistory(story: Story, range: Range = "1w"): Promise<History> {
  const { frame, days } = FRAMES[range];
  const series = await Promise.all(story.legs.map((l) => getCandles(l.symbol, frame)));
  const now = Date.now();
  const since = now - days * 86_400_000;
  const stamps = [...new Set(series.flat().map(([t]) => t))].filter((t) => t >= since).sort((a, b) => a - b);
  // No trades means no candles (weather and most game lines): use the index recorded from live quotes.
  if (stamps.length < 2) return { points: recorded(story.id).filter((p) => p.t >= since), movers: [] };

  const clamp = (n: number) => Math.min(Math.max(n, 0), 1);
  // rows[i][k] is leg i's price at stamp k, on its own side, before anchoring.
  const rows = story.legs.map((leg, i) => {
    const s = series[i];
    let at = 0;
    // Start at the latest close before the window, if there is one.
    let last: number | null = s.filter(([t]) => t < since).pop()?.[1] ?? null;
    return stamps.map((t) => {
      while (at < s.length && s[at][0] <= t) last = s[at++][1];
      return last == null ? null : leg.side === "yes" ? last : 1 - last;
    });
  });
  const anchored = story.legs.map((leg, i) => {
    const row = rows[i];
    const end = row[row.length - 1];
    // A leg that never traded is flat at its live mid.
    if (end == null) return row.map(() => leg.price);
    const shift = leg.price - end;
    const firstKnown = row.find((v) => v != null)!;
    return row.map((v) => clamp((v ?? firstKnown) + shift));
  });
  const points: Point[] = stamps.map((t, k) => ({
    t,
    v: story.legs.reduce((sum, leg, i) => sum + leg.weight * anchored[i][k], 0) * 100,
  }));
  points.push({ t: now, v: story.index });
  const movers: Mover[] = story.legs
    .map((leg, i) => ({
      label: `${leg.eventTitle}: ${leg.label}`,
      side: leg.side,
      delta: leg.weight * (leg.price - anchored[i][0]) * 100,
      from: anchored[i][0],
      to: leg.price,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { points, movers };
}
