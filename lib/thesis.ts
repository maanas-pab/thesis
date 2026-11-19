import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCatalog } from "./catalog";
import { decide, jevEnabled, prob, yes, type JevQuestion } from "./jev";
import { isMoodWord, mood } from "./mood";
import type { CatalogEntry, LegPick } from "./types";

export type ThesisResult = {
  name: string;
  blurb: string;
  legs: LegPick[];
  note?: string;
  source: "ai" | "jev" | "rule" | "keyword";
};

const MODEL = "claude-opus-5-5";
const PER_EVENT = 12;

const Answer = z.object({
  name: z.string(),
  blurb: z.string(),
  legs: z.array(
    z.object({
      id: z.string(),
      side: z.enum(["yes", "no"]),
      weight: z.number(),
      reason: z.string(),
    }),
  ),
  note: z.string(),
});

// The API takes a plain JSON schema; drop the draft marker Zod adds.
const { $schema: _draft, ...SCHEMA } = z.toJSONSchema(Answer) as Record<string, unknown>;

const SYSTEM = `You turn a person's view of the future into a basket of live prediction-market contracts from Gemini.

The basket pays out for each contract that resolves the way the person expects, so every pick should be a contract whose outcome is likely to go their way if their view is right. For each pick, choose the side (yes or no) that wins under their view, a weight from 1 to 3 for how central it is to the view, and a reason of at most 15 words in plain language.

Pick 5 to 8 contracts, using only ids from the catalog. Contracts from different events make a better basket than several ranges of one event, so use at most two contracts per event. If fewer than five contracts truly fit the view, return the ones that do and explain the gap in note rather than padding with unrelated markets; otherwise leave note empty.

name: a short title of 2 to 4 words. blurb: one sentence that restates the view as an outcome.`;

/** Catalog trimmed for the prompt: tight books first, at most a dozen contracts per event. */
function shortlist(list: CatalogEntry[]) {
  const byEvent = new Map<string, CatalogEntry[]>();
  for (const c of list) (byEvent.get(c.eventTicker) ?? byEvent.set(c.eventTicker, []).get(c.eventTicker)!).push(c);
  const out: CatalogEntry[] = [];
  for (const cs of byEvent.values()) {
    const firm = cs.filter((c) => !c.indicative);
    const pool = firm.length ? firm : cs;
    out.push(...[...pool].sort((a, b) => Math.abs(a.mid - 0.5) - Math.abs(b.mid - 0.5)).slice(0, PER_EVENT));
  }
  // Stable order keeps the prompt cacheable between requests.
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function withClaude(text: string, list: CatalogEntry[]): Promise<ThesisResult> {
  const ids = new Map(list.map((c, i) => [`m${i}`, c]));
  const catalog = list.map((c, i) => `m${i} | ${c.category} | ${c.eventTitle} | ${c.label}`).join("\n");
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a policy decline the API retries on its default fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Catalog (id | category | event | contract):\n${catalog}`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `The view: ${text}` },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this one. Try wording the view differently.");
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No answer came back.");
  const answer = Answer.parse(JSON.parse(block.text));
  const legs: LegPick[] = [];
  for (const l of answer.legs) {
    const c = ids.get(l.id);
    if (!c || legs.some((x) => x.symbol === c.symbol)) continue;
    legs.push({ eventTicker: c.eventTicker, symbol: c.symbol, side: l.side, weight: Math.min(Math.max(Math.round(l.weight), 1), 3), reason: l.reason });
  }
  return { name: answer.name, blurb: answer.blurb, legs: legs.slice(0, 8), note: answer.note || undefined, source: "ai" };
}

// ---- Keyword fallback, used when no API key is configured. ----

const STOP = new Set(
  "a an the and or but of to in on at for by with will would be is are was it its this that than then if as from into over under more less about very much stay stays keep keeps get gets go goes big high higher low lower up down week year month next this all some any still even really think win wins winning won going take over".split(" "),
);
// Everyday words mapped to how Gemini titles its markets.
const ALIASES: Record<string, string[]> = {
  rates: ["fed decision"], rate: ["fed decision"], interest: ["fed decision"], fed: ["fed decision"], powell: ["fed decision"],
  stocks: ["s&p", "nasdaq"], stock: ["s&p", "nasdaq"], market: ["s&p", "nasdaq"], economy: ["gdp", "s&p"],
  recession: ["gdp", "unemployment"], growth: ["gdp"], jobs: ["unemployment"], unemployment: ["unemployment"],
  ai: ["best ai", "optimus", "openai", "nasdaq"], spending: ["nasdaq", "gdp"], tech: ["nasdaq", "best ai"],
  oil: ["oil"], energy: ["oil", "natural gas"], gas: ["natural gas"], gold: ["gold"], silver: ["silver"], copper: ["copper"],
  metals: ["gold", "silver", "copper"], inflation: ["gold", "oil", "fed decision"],
  trump: ["trump administration"], cabinet: ["trump administration"], democrats: ["democratic"], republicans: ["republican"],
  crypto: ["bitcoin", "ether", "solana"], btc: ["bitcoin"], bitcoin: ["bitcoin"], eth: ["ether"], ethereum: ["ether"], sol: ["solana"], coins: ["bitcoin", "ether"],
  election: ["election winner", "nominee"], france: ["french"], uk: ["uk general"], israel: ["israel"],
};
const SPORTS = /\b(nfl|nba|nhl|football|basketball|hockey|soccer|premier|champions|league|team|game|games|playoff|super bowl|title|season|f1|grand prix)\b/i;
const WEATHER = /\b(cold|colder|freeze|freezing|chilly|warm|warmer|hot|heat|weather|temperature)\b/i;
const REGION_WORDS: [RegExp, string][] = [
  [/\bnortheast|new york|boston|philly\b/i, "northeast"],
  [/\bnorth|midwest|chicago|minneapolis\b/i, "north"],
  [/\btexas|plains|dallas|houston\b/i, "texas"],
  [/\bsun ?belt|florida|miami\b/i, "florida"],
  [/\bsouth|atlanta|nashville\b/i, "south"],
  [/\bwest|california|seattle|phoenix\b/i, "west"],
];
/** Words in a story's name or blurb that mark it as the pessimistic one of a pair. */
const NEG_STORY = /\b(pops?|hard|slide|slump|upsets?|chaos|drop|falls?|cool|nobody|fails?|miss|cold|red close|red week|winter|down)\b/i;
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function withKeywords(text: string, list: CatalogEntry[]): Promise<ThesisResult> {
  const words = text.toLowerCase().replace(/[^\w\s&']/g, " ").split(/\s+/).filter(Boolean);
  // Short words still count when they mean something here, like "ai", "uk" or "oil".
  const terms = words.filter((w) => ALIASES[w] || (w.length > 2 && !STOP.has(w)));
  // Mood words set the sides; they are not what the view is about.
  const want = [...new Set(terms.filter((w) => !isMoodWord(w)).flatMap((w) => [w, ...(ALIASES[w] ?? [])]))];
  const tests = want.map((w) => ({ w, re: new RegExp(`\\b${esc(w)}\\b`, "i") }));
  const negative = mood(text) < 0;
  const sports = SPORTS.test(text);
  const legs: LegPick[] = [];
  const add = (l: LegPick) => legs.length < 8 && !legs.some((x) => x.symbol === l.symbol) && legs.push(l);

  // 1. A ready-made story that says the same thing: its sides are already right for the view.
  const { getStories } = await import("./stories");
  const stories = await getStories();
  let bestStory: { name: string; legs: LegPick[]; score: number; flipped: boolean } | null = null;
  for (const st of stories) {
    if (st.group === "Weather" || (st.group === "Games" && !sports)) continue;
    const head = `${st.name} ${st.blurb}`;
    let score = tests.reduce((n, t) => n + (t.re.test(head) ? 2 : 0) + (st.legs.some((l) => t.re.test(`${l.eventTitle} ${l.label}`)) ? 1 : 0), 0);
    if (!score) continue;
    // Sports stories only when the view is about sports or names a team they hold.
    if (st.group === "Sports" && !sports) score -= 1;
    // A view with the opposite mood to the story is the story with every side flipped.
    const flipped = NEG_STORY.test(head) !== negative;
    if (!bestStory || score > bestStory.score)
      bestStory = {
        name: flipped ? `Against ${st.name}` : st.name,
        score,
        flipped,
        legs: st.legs.map((l) => {
          const side = flipped ? (l.side === "yes" ? "no" : "yes") : l.side;
          return {
            eventTicker: l.eventTicker,
            symbol: l.symbol,
            side,
            weight: 1,
            // A plain yes/no market reads better by its question than by its label.
            reason: `${flipped ? "The opposite of" : "From"} the ${st.name} story: ${side === "yes" ? "Yes" : "No"} on ${/^(yes|no)$/i.test(l.label) ? l.eventTitle : l.label}`,
          };
        }),
      };
  }
  if (bestStory && bestStory.score >= 2) bestStory.legs.forEach(add);

  // 2. Single markets that mention the words, one per event, to top up.
  const side = negative ? "no" : "yes";
  const scored = new Map<string, { c: CatalogEntry; score: number; hit: string }>();
  for (const c of list) {
    if (c.category === "Weather") continue;
    // Game lines only when the view is about sports; season markets can match by team name.
    if (c.category === "Sports" && !sports && /\d{10}/.test(c.eventTicker)) continue;
    const hits = tests.filter((t) => t.re.test(`${c.eventTitle} ${c.label}`));
    if (!hits.length) continue;
    const at = scored.get(c.eventTicker);
    if (!at || hits.length > at.score || (hits.length === at.score && Math.abs(c.mid - 0.5) < Math.abs(at.c.mid - 0.5)))
      scored.set(c.eventTicker, { c, score: hits.length, hit: hits[0].w });
  }
  [...scored.values()]
    .sort((a, b) => b.score - a.score || Number(a.c.indicative) - Number(b.c.indicative))
    .forEach(({ c, hit }) => add({ eventTicker: c.eventTicker, symbol: c.symbol, side, weight: 1, reason: `Mentions "${hit}"` }));

  // 3. Weather views reuse the day's generated cold or warm basket for the region named.
  if (WEATHER.test(text)) {
    const mode = /\b(warm|warmer|hot|heat)\b/i.test(text) ? "warm" : "cold";
    const region = REGION_WORDS.find(([re]) => re.test(text))?.[1] ?? "bigcities";
    const wx = stories.find((st) => st.id === `wx-${mode}-${region}`) ?? stories.find((st) => st.id === `wx-${mode}-bigcities`);
    for (const l of wx?.legs ?? [])
      add({ eventTicker: l.eventTicker, symbol: l.symbol, side: "yes", weight: 1, reason: `${l.eventTitle} comes in ${mode === "cold" ? "colder" : "warmer"} than expected` });
  }

  const name = bestStory && bestStory.score >= 2 ? bestStory.name : text.split(/\s+/).slice(0, 4).join(" ").replace(/^\w/, (m) => m.toUpperCase());
  return {
    name,
    blurb: text.slice(0, 160),
    legs,
    note: legs.length
      ? "Matched by keywords because no Anthropic API key is set. Check each market and side, and edit before publishing."
      : "No markets matched those words. Without an Anthropic API key Thesis can only match words, so try naming what moves: rates, stocks, AI, oil, a team or a politician.",
    source: "keyword",
  };
}

// ---- Name rules: "every NFL team with an L in its name wins" is exact, so it's matched exactly. ----

const NFL_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills", CAR: "Carolina Panthers",
  CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys", DEN: "Denver Broncos",
  DET: "Detroit Lions", GB: "Green Bay Packers", HOU: "Houston Texans", IND: "Indianapolis Colts", JAC: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants", NYJ: "New York Jets",
  PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SF: "San Francisco 49ers", SEA: "Seattle Seahawks", TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans", WAS: "Washington Commanders",
};
/** "an L" but "a V": letters whose names start with a vowel sound take "an". */
const an = (letter: string) => ("AEFHILMNORSX".includes(letter.toUpperCase()) ? "an" : "a");
const Q = `["'\u201c\u201d\u2018\u2019]?`;

/** A rule on team names, if the view states one: contains, starts with or lacks a letter. */
function nameRule(text: string) {
  const t = text.toLowerCase();
  if (!/\b(nfl|football)\b/.test(t)) return null;
  const letter = t.match(new RegExp(`\\bletter\\s+${Q}([a-z])${Q}(?![a-z])`))?.[1] ?? t.match(new RegExp(`\\b(?:start|starts|starting|begin|begins|beginning)\\s+with\\s+(?:an?\\s+)?${Q}([a-z])${Q}(?![a-z])`))?.[1];
  if (!letter) return null;
  const mode = /\b(start|starts|starting|begin|begins|beginning)\s+with\b/.test(t) ? "starts" : /\b(without|no|lacking)\s+(?:the\s+|an?\s+)?letter\b/.test(t) ? "lacks" : "has";
  const lose = /\b(lose|loses|losing|lost|miss|misses|fail|fails)\b/.test(t);
  const test = (name: string) => {
    const n = name.toLowerCase();
    return mode === "starts" ? n.startsWith(letter) : mode === "lacks" ? !n.includes(letter) : n.includes(letter);
  };
  const what = mode === "starts" ? `start with ${letter.toUpperCase()}` : mode === "lacks" ? `have no ${letter.toUpperCase()}` : `have ${an(letter.toUpperCase())} ${letter.toUpperCase()}`;
  return { letter, mode, lose, test, what };
}

function withRule(text: string, list: CatalogEntry[], rule: NonNullable<ReturnType<typeof nameRule>>): ThesisResult {
  const teams = Object.entries(NFL_NAMES).filter(([, n]) => rule.test(n));
  const side: LegPick["side"] = rule.lose ? "no" : "yes";
  const picks: (LegPick & { firm: boolean; game: boolean })[] = [];
  const skipped: string[] = [];
  for (const [abbr, name] of teams) {
    // This week's game, when it's listed and the other team isn't on the list too (both can't win).
    const game = list.find((c) => {
      const m = c.eventTicker.match(/^NFL-\d{10}-([A-Z]+)-([A-Z]+)-M$/);
      return m && c.symbol.endsWith(`-M-${abbr}`);
    });
    const opp = game?.eventTicker.match(/^NFL-\d{10}-([A-Z]+)-([A-Z]+)-M$/)?.slice(1).find((x) => x !== abbr);
    if (game && !(opp && NFL_NAMES[opp] && rule.test(NFL_NAMES[opp]))) {
      picks.push({ eventTicker: game.eventTicker, symbol: game.symbol, side, weight: 2, firm: !game.indicative, game: true, reason: `${name} ${rule.lose ? "lose" : "win"} this week's game against the ${NFL_NAMES[opp ?? ""] ?? opp}` });
      continue;
    }
    // Otherwise their season: the win total the market thinks is a coin flip.
    const wins = list.filter((c) => c.eventTicker === `NFL${abbr}WINS26`).sort((a, b) => Math.abs(a.mid - 0.5) - Math.abs(b.mid - 0.5))[0];
    if (wins) picks.push({ eventTicker: wins.eventTicker, symbol: wins.symbol, side, weight: 1, firm: !wins.indicative, game: false, reason: `${name} ${rule.lose ? "fall short of" : "reach"} ${wins.label}, the market's line for their season` });
    else skipped.push(name);
  }
  picks.sort((a, b) => Number(b.game) - Number(a.game) || Number(b.firm) - Number(a.firm));
  const legs = picks.slice(0, 8).map(({ firm: _f, game: _g, ...l }) => l);
  const L = rule.letter.toUpperCase();
  const left = picks.length - legs.length;
  return {
    name: rule.mode === "starts" ? `${L} Teams ${rule.lose ? "Lose" : "Win"}` : rule.mode === "lacks" ? `No-${L} Teams ${rule.lose ? "Lose" : "Win"}` : `Teams With ${an(L)} ${L}`,
    blurb: text.slice(0, 160),
    legs,
    note: [
      `${teams.length} NFL teams ${rule.what} in their full name (city and nickname): ${teams.map(([, n]) => n).join(", ")}.`,
      `Each one ${rule.lose ? "loses" : "wins"} this week's game when Gemini lists it, otherwise ${rule.lose ? "misses" : "reaches"} the season win total the market prices as a coin flip.`,
      left > 0 ? `A basket holds 8 markets, so ${left} more ${left === 1 ? "team was" : "teams were"} left out; add or swap them in the builder.` : "",
      skipped.length ? `No live market for ${skipped.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    source: "rule",
  };
}

// ---- Jev: TypeSafe AI's decision model judges every candidate market against the view. ----

/** Most market questions sent to Jev in one request. */
const JEV_MARKETS = 160;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const keywordTests = (text: string) =>
  [...new Set(text.toLowerCase().replace(/[^\w\s&']/g, " ").split(/\s+/).filter((w) => ALIASES[w] || (w.length > 2 && !STOP.has(w))).flatMap((w) => [w, ...(ALIASES[w] ?? [])]))].map(
    (w) => new RegExp(`\\b${esc(w)}\\b`, "i"),
  );

async function withJev(text: string, list: CatalogEntry[]): Promise<ThesisResult> {
  const { getStories } = await import("./stories");
  const stories = (await getStories()).filter((s) => s.group !== "Weather").slice(0, 120);
  const categories = [...new Set(list.map((c) => c.category))];

  // 1. Which areas the view is about, and whether a ready-made story already says it (or its opposite).
  const first: Record<string, JevQuestion> = {};
  categories.forEach((c, i) => {
    first[`cat${i}`] = {
      type: "noul",
      instructions: `If this view of the future turns out right, would it decide prediction markets about ${c}?`,
      criteria: { true: `The view is about ${c}, or clearly moves it`, false: `The view has nothing to do with ${c}` },
    };
  });
  const storyOptions: Record<string, string> = { none: "No basket here says what the view says, or its opposite" };
  stories.forEach((s, i) => {
    storyOptions[`s${i}`] = `The view says the same as "${s.name}": ${s.blurb}`;
    storyOptions[`r${i}`] = `The view says the opposite of "${s.name}": ${s.blurb}`;
  });
  first.story = { type: "choice", instructions: "Which ready-made basket matches this view of the future?", criteria: storyOptions };
  const one = await decide({ view: text }, first);

  const catP = new Map(categories.map((c, i) => [c, yes(one.answers[`cat${i}`])]));
  const ranked = [...catP].sort((a, b) => b[1] - a[1]);
  const keep = new Set(ranked.filter(([, p], i) => p >= 0.35 || i < 2).map(([c]) => c));

  // 2. Candidate markets in those areas: up to three contracts per event, closest to a coin flip, words that match first.
  const tests = keywordTests(text);
  const byEvent = new Map<string, CatalogEntry[]>();
  for (const c of list) if (keep.has(c.category)) (byEvent.get(c.eventTicker) ?? byEvent.set(c.eventTicker, []).get(c.eventTicker)!).push(c);
  const pool = [...byEvent.values()]
    .map((cs) => {
      const hits = tests.filter((re) => re.test(`${cs[0].eventTitle} ${cs.map((c) => c.label).join(" ")}`)).length;
      return { cs: [...cs].sort((a, b) => Math.abs(a.mid - 0.5) - Math.abs(b.mid - 0.5)).slice(0, 3), score: hits + (catP.get(cs[0].category) ?? 0) };
    })
    .sort((a, b) => b.score - a.score)
    .flatMap((e) => e.cs)
    .slice(0, JEV_MARKETS);
  const second: Record<string, JevQuestion> = {};
  pool.forEach((c, i) => {
    second[`m${i}`] = {
      type: "choice",
      instructions: `If this view of the future turns out right, how does this prediction market resolve? Market: ${c.eventTitle} | ${c.label}`,
      criteria: { yes: "Yes: the view makes this happen", no: "No: the view makes this fail", neither: "The view does not bear on this market" },
    };
  });
  const two = pool.length ? await decide({ view: text }, second) : { answers: {}, ms: 0, model: one.model };

  const legs: LegPick[] = [];
  const add = (l: LegPick) => legs.length < 8 && !legs.some((x) => x.symbol === l.symbol) && legs.push(l);

  // A matching story first: its markets were picked to go together.
  const st = one.answers.story;
  const pick = st?.type === "choice" && st.choice !== "none" && st.confidence >= 0.5 ? st.choice : null;
  const story = pick ? stories[Number(pick.slice(1))] : null;
  const flipped = pick?.startsWith("r") ?? false;
  if (story)
    for (const l of story.legs.slice(0, 5)) {
      const side = flipped ? (l.side === "yes" ? "no" : "yes") : l.side;
      add({ eventTicker: l.eventTicker, symbol: l.symbol, side, weight: 2, reason: `Jev matched the ${story.name} story (${pct(st!.type === "choice" ? st!.confidence : 0)}): ${side === "yes" ? "Yes" : "No"} on ${/^(yes|no)$/i.test(l.label) ? l.eventTitle : l.label}` });
    }

  // Then the markets Jev is surest the view decides, at most two per event.
  const judged = pool
    .map((c, i) => {
      const a = two.answers[`m${i}`];
      const y = prob(a, "yes");
      const n = prob(a, "no");
      return { c, side: (y >= n ? "yes" : "no") as LegPick["side"], p: Math.max(y, n), off: prob(a, "neither") };
    })
    .filter((j) => j.p >= 0.6 && j.off < 0.4)
    .sort((a, b) => b.p - a.p);
  const perEvent = new Map<string, number>();
  for (const j of judged) {
    if ((perEvent.get(j.c.eventTicker) ?? 0) >= 2) continue;
    perEvent.set(j.c.eventTicker, (perEvent.get(j.c.eventTicker) ?? 0) + 1);
    add({ eventTicker: j.c.eventTicker, symbol: j.c.symbol, side: j.side, weight: j.p >= 0.85 ? 3 : j.p >= 0.7 ? 2 : 1, reason: `Jev: ${pct(j.p)} this goes ${j.side === "yes" ? "Yes" : "No"} if you're right` });
  }

  const name = story ? (flipped ? `Against ${story.name}` : story.name) : text.split(/\s+/).slice(0, 4).join(" ").replace(/^\w/, (m) => m.toUpperCase());
  const areas = ranked.filter(([c]) => keep.has(c)).map(([c]) => c).slice(0, 3).join(", ");
  return {
    name,
    blurb: text.slice(0, 160),
    legs,
    note: legs.length
      ? `Jev judged ${pool.length} markets in ${areas} against your view in ${((one.ms + two.ms) / 1000).toFixed(1)}s. Check each side before publishing.`
      : `Jev looked at ${pool.length} markets in ${areas} and found none your view clearly decides. Try naming what moves: rates, stocks, AI, oil, a coin, a team or a politician.`,
    source: "jev",
  };
}

// A light guard against runaway spend on the AI path.
const g = globalThis as unknown as { __thesisCalls?: number[] };
function allowAI() {
  const now = Date.now();
  g.__thesisCalls = (g.__thesisCalls ?? []).filter((t) => now - t < 3_600_000);
  if (g.__thesisCalls.length >= 60) return false;
  g.__thesisCalls.push(now);
  return true;
}

export const aiEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function matchThesis(text: string): Promise<ThesisResult> {
  const list = shortlist(await getCatalog());
  const rule = nameRule(text);
  if (rule) return withRule(text, list, rule);
  if (jevEnabled() && allowAI())
    try {
      return await withJev(text, list);
    } catch (e) {
      // Fall back rather than fail the page, and say why.
      const kw = await withKeywords(text, list);
      return { ...kw, note: `Jev couldn't answer (${e instanceof Error ? e.message : "unknown error"}), so these were matched by keywords.` };
    }
  if (aiEnabled() && allowAI()) return withClaude(text, list);
  return withKeywords(text, list);
}
