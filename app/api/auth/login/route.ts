import { logIn, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
  const b = await req.json().catch(() => null);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const { status, ...r } = await logIn(b?.email, b?.password, ip);
  return Response.json(r, { status });
}
