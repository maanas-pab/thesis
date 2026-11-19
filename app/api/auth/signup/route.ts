import { sameOrigin, signUp } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Create an account. `local` is the practice account this browser had before accounts existed. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
  const b = await req.json().catch(() => null);
  const r = await signUp(b?.email, b?.password, b?.local);
  return Response.json(r, { status: "error" in r ? 400 : 201 });
}
