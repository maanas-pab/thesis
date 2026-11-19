// Client for Jev, TypeSafe AI's decision model: it answers typed questions about a piece of text or JSON
// with probabilities instead of writing prose.
//
// Reached through AI/ML API by default (POST /v1/decisions, model typesafe/jev-1.14), which is the only
// contract we found documented. TYPESAFE_API_KEY points it at TypeSafe's own endpoint instead, and
// JEV_URL / JEV_MODEL override either; check those against TypeSafe's docs before relying on them.

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

function config() {
  const aiml = process.env.AIMLAPI_KEY;
  const own = process.env.TYPESAFE_API_KEY;
  const key = aiml || own;
  if (!key) return null;
  return {
    key,
    url: process.env.JEV_URL || (aiml ? "https://api.aimlapi.com/v1/decisions" : "https://api.typesafe.ai/v1/systemone"),
    model: process.env.JEV_MODEL || (aiml ? "typesafe/jev-1.14" : "jev-latest"),
  };
}

export const jevEnabled = () => !!config();

/** Ask Jev every question about one state. Answers come back keyed the same way as the questions. */
export async function decide(state: string | Record<string, unknown>, questions: Record<string, JevQuestion>) {
  const c = config();
  if (!c) throw new Error("Jev is not configured.");
  const t0 = Date.now();
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: c.model, state, questions }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(res.status === 401 || res.status === 403 ? "The Jev API key was rejected." : `Jev request failed (${res.status}) ${body.slice(0, 160)}`);
  }
  const out = (await res.json()) as { model?: string; answers?: Record<string, JevAnswer> };
  if (!out.answers) throw new Error("Jev sent no answers.");
  return { answers: out.answers, model: out.model ?? c.model, ms: Date.now() - t0 };
}

/** Probability of one option of a choice answer, 0 when missing. */
export const prob = (a: JevAnswer | undefined, key: string) => (a?.type === "choice" ? (a.probabilities[key] ?? (a.choice === key ? a.confidence : 0)) : 0);
/** Probability of yes for a yes/no answer. */
export const yes = (a: JevAnswer | undefined) => (a?.type === "noul" ? a.noul : 0);
