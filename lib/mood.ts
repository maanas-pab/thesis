/**
 * Whether a view is upbeat or gloomy, for the keyword matcher.
 *
 * Each mood word counts +1 or -1. A negator a few words before it flips it, so
 * "not gonna do that bad" is upbeat and "won't win" is gloomy.
 */
const GLOOMY = new Set(
  "bad worse worst bubble pop pops popping burst bursts crash crashes crashing collapse collapses tank tanks tanking fall falls falling fail fails failing flop flops drop drops dropping slow slows slowing slump slumps decline declines weak weaker lose loses losing lost bearish overhyped hype dies dead dying cut cuts below recession down sink sinks miss misses fade fades struggle struggles".split(" "),
);
const UPBEAT = new Set(
  "good great fine better best strong stronger boom booms booming rally rallies rise rises rising grow grows growing win wins winning beat beats bullish moon moons soar soars surge surges up above thrive thrives hold holds succeed succeeds work works climb climbs".split(" "),
);
const NEGATORS = new Set("not no never nothing hardly isn't isnt won't wont don't dont doesn't doesnt didn't didnt ain't aint can't cant cannot without wouldn't wouldnt shouldn't shouldnt aren't arent".split(" "));
const REACH = 4;

export const isMoodWord = (w: string) => GLOOMY.has(w) || UPBEAT.has(w) || NEGATORS.has(w);

/** Below zero is gloomy, above zero upbeat, zero says nothing either way. */
export function mood(text: string) {
  const words = text.toLowerCase().replace(/[’]/g, "'").replace(/[^\w\s']/g, " ").split(/\s+/).filter(Boolean);
  let score = 0;
  words.forEach((w, i) => {
    let pol = GLOOMY.has(w) ? -1 : UPBEAT.has(w) ? 1 : 0;
    if (!pol) return;
    if (words.slice(Math.max(0, i - REACH), i).some((x) => NEGATORS.has(x))) pol = -pol;
    score += pol;
  });
  return score;
}
