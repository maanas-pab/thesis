/** Start counting Gemini's volume when the server boots, so the first visitor doesn't wait for the crawl. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getExchangeVolume } = await import("./lib/gemini");
  getExchangeVolume().catch(() => {});
}
