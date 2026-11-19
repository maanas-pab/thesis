import { mintUnits } from "@/lib/solana";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const kind = ["whole", "safe", "bold"].includes(b?.kind) ? b.kind : null;
  if (!b || typeof b.owner !== "string" || typeof b.storyId !== "string" || !kind) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    return Response.json(await mintUnits(b.owner, b.storyId, kind, String(b.storyName ?? b.storyId).slice(0, 60), Number(b.units)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Mint failed" }, { status: 502 });
  }
}
