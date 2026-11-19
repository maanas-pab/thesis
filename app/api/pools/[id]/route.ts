import { act, getPool, view } from "@/lib/pools";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getPool(id);
  if (!pool) return Response.json(null, { status: 404 });
  const u = new URL(req.url);
  return Response.json(await view(pool, u.searchParams.get("account") ?? undefined, Number(u.searchParams.get("amount")) || 20));
}

/** Deposit, move tiers or withdraw. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getPool(id);
  if (!pool) return Response.json({ error: "No such pool." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const out = act(pool, body);
  return Response.json(out, { status: "error" in out ? 400 : 200 });
}
