import { defs, publish, stats } from "@/lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(defs().map((d) => ({ ...d, stats: stats(d.id) })));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.legs)) return Response.json({ error: "Bad request" }, { status: 400 });
  const out = await publish(body);
  return Response.json(out, { status: "error" in out ? 400 : 200 });
}
