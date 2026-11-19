import { getStories } from "@/lib/stories";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getStories());
}
