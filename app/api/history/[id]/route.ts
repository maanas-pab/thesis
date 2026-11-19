import { getHistory, getStory } from "@/lib/stories";
import type { Range } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES: Range[] = ["1d", "1w", "1m"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asked = new URL(req.url).searchParams.get("range") as Range;
  const story = await getStory(id);
  if (!story) return Response.json({ points: [], movers: [] }, { status: 404 });
  return Response.json(await getHistory(story, RANGES.includes(asked) ? asked : "1w"));
}
