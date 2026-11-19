import { burnTx, submit } from "@/lib/solana";

export const dynamic = "force-dynamic";

/** Step one returns a burn for the owner to sign; step two (with `signed`) sends it. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  try {
    if (typeof b?.signed === "string") return Response.json(await submit(b.signed));
    if (typeof b?.owner !== "string" || typeof b?.mint !== "string") return Response.json({ error: "Bad request" }, { status: 400 });
    return Response.json({ tx: await burnTx(b.owner, b.mint, Number(b.units)) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Burn failed" }, { status: 502 });
  }
}
