import { markLeg } from "@/lib/stories";
import type { Mark, Side } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ask = { symbol: string; eventTicker: string; side: Side };

/** Live quotes for the exact contracts a set of positions holds. */
export async function POST(req: Request) {
  let legs: Ask[];
  try {
    legs = (await req.json()).legs;
  } catch {
    return Response.json({}, { status: 400 });
  }
  if (!Array.isArray(legs) || legs.length > 400) return Response.json({}, { status: 400 });
  const out: Record<string, Mark> = {};
  await Promise.all(
    legs.map(async (l) => {
      if (typeof l?.symbol !== "string" || typeof l?.eventTicker !== "string") return;
      out[`${l.symbol}:${l.side}`] = await markLeg(l.eventTicker, l.symbol, l.side === "no" ? "no" : "yes");
    }),
  );
  return Response.json(out);
}
