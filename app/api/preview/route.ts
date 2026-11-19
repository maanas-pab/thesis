import { preview } from "@/lib/community";
import type { LegPick } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const legs: LegPick[] = Array.isArray(body?.legs) ? body.legs.slice(0, 8) : [];
  return Response.json(await preview(legs));
}
