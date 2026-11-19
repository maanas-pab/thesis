import { recordTrade } from "@/lib/community";

export const dynamic = "force-dynamic";

/** A buy of a community story: adds to its volume and its creator's fees. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const s = recordTrade(id, Number(body?.amount));
  return s ? Response.json(s) : Response.json({ error: "Unknown story" }, { status: 404 });
}
