import { getHistory, getStory } from "@/lib/stories";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) return Response.json([], { status: 404 });
  return Response.json(await getHistory(story));
}
