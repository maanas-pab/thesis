import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** For the host's health check: the server is up and the database opens. */
export async function GET() {
  try {
    db().prepare("select 1").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }
}
