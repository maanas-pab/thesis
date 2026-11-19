import { getPool, poolFor, view } from "@/lib/pools";

export const dynamic = "force-dynamic";

/** ?story=id gives the open pool for a story; ?ids=a,b gives specific pools. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const account = u.searchParams.get("account") ?? undefined;
  const amount = Math.min(Math.max(Number(u.searchParams.get("amount")) || 20, 1), 100_000);
  const story = u.searchParams.get("story");
  if (story) {
    const pool = await poolFor(story);
    return Response.json(pool ? await view(pool, account, amount) : null);
  }
  const ids = (u.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 50);
  const out = await Promise.all(ids.map((id) => getPool(id)).filter((p) => !!p).map((p) => view(p!, account, amount)));
  return Response.json(out);
}
