import { getLeaders } from "@/lib/leaders";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getLeaders());
}
