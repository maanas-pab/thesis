import { getExchangeVolume } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getExchangeVolume());
  } catch (e) {
    console.error("volume", e);
    return Response.json({ error: "Volume unavailable" }, { status: 502 });
  }
}
