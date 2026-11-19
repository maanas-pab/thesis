import { status } from "@/lib/solana";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await status());
}
