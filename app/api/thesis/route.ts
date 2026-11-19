import Anthropic from "@anthropic-ai/sdk";
import { preview } from "@/lib/community";
import { matchThesis } from "@/lib/thesis";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 300);
  if (text.length < 8) return Response.json({ error: "Say a little more about what you think will happen." }, { status: 400 });
  try {
    const match = await matchThesis(text);
    return Response.json({ ...match, preview: match.legs.length ? await preview(match.legs) : null });
  } catch (e) {
    const msg =
      e instanceof Anthropic.AuthenticationError
        ? "The Anthropic API key was rejected."
        : e instanceof Anthropic.RateLimitError
          ? "Too many requests right now. Try again in a minute."
          : e instanceof Anthropic.APIError
            ? `The model request failed (${e.status}).`
            : e instanceof Error
              ? e.message
              : "Something went wrong.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
