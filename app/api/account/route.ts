import { currentUser, getAccount, sameOrigin, saveAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The signed-in user's practice account. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const a = getAccount(user.id);
  return a ? Response.json(a) : Response.json({ error: "No account." }, { status: 404 });
}

/** Save it. Send the version you started from; a 409 hands back the newer copy. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Wrong origin." }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => null);
  const { status, ...r } = saveAccount(user.id, user.email, b?.account, Number(b?.version));
  return Response.json(r, { status });
}
