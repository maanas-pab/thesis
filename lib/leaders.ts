import { defs, stats } from "./community";
import { getHistory, getStories } from "./stories";

export type LeaderRow = { id: string; name: string; group: string; index: number; change: number | null; creator?: string };
export type Leaders = {
  at: number;
  week: LeaderRow[];
  community: (LeaderRow & { sinceLaunch: number; volume: number; fees: number; buys: number; createdAt: number })[];
  creators: { creator: string; stories: number; volume: number; fees: number; best: number }[];
};

const g = globalThis as unknown as { __leaders?: Leaders; __leadersBusy?: Promise<Leaders> };
const TTL = 5 * 60_000;

async function compute(): Promise<Leaders> {
  const stories = await getStories();
  // A week of 15-minute history per story, a few stories at a time to stay polite to Gemini.
  const week: LeaderRow[] = [];
  for (let i = 0; i < stories.length; i += 6) {
    const batch = await Promise.all(
      stories.slice(i, i + 6).map(async (s) => {
        const h = await getHistory(s, "1w").catch(() => null);
        const p = h?.points ?? [];
        return { id: s.id, name: s.name, group: s.group, index: s.index, change: p.length > 1 ? p[p.length - 1].v - p[0].v : null, creator: s.community?.creator };
      }),
    );
    week.push(...batch);
  }
  week.sort((a, b) => (b.change ?? -1e9) - (a.change ?? -1e9));

  const live = new Map(stories.map((s) => [s.id, s]));
  const community = defs().map((d) => {
    const s = live.get(d.id);
    const st = stats(d.id);
    const index = s?.index ?? d.startIndex;
    return { id: d.id, name: d.name, group: "Community", index, change: week.find((w) => w.id === d.id)?.change ?? null, creator: d.creator, sinceLaunch: index - d.startIndex, createdAt: d.createdAt, ...st };
  });
  community.sort((a, b) => b.sinceLaunch - a.sinceLaunch);

  const byCreator = new Map<string, Leaders["creators"][number]>();
  for (const c of community) {
    const at = byCreator.get(c.creator) ?? { creator: c.creator, stories: 0, volume: 0, fees: 0, best: -Infinity };
    at.stories++;
    at.volume += c.volume;
    at.fees += c.fees;
    at.best = Math.max(at.best, c.sinceLaunch);
    byCreator.set(c.creator, at);
  }
  const creators = [...byCreator.values()].sort((a, b) => b.fees - a.fees || b.best - a.best);
  return { at: Date.now(), week, community, creators };
}

/** Served from a five-minute cache and refreshed in the background. */
export async function getLeaders(): Promise<Leaders> {
  const have = g.__leaders;
  if (have && Date.now() - have.at < TTL) return have;
  if (!g.__leadersBusy)
    g.__leadersBusy = compute()
      .then((l) => (g.__leaders = l))
      .finally(() => (g.__leadersBusy = undefined));
  return have ?? g.__leadersBusy;
}
