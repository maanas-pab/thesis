# Thesis

Pick a story about the future, see what the market charges for it, and buy the whole basket in one tap.

Built for the University Blockchain Conference 2026 hackathon on Gemini Prediction Markets data.

## What it does

- **Stories.** Each story is a basket of at least five live Gemini prediction markets that all move on the same idea (Soft Landing, AI Bubble Pops, Cold Snap Out West).
- **Story Index.** The price of the whole basket, from 0 to 100: the sum of each market's weight times its price. "No" legs use 1 minus the price.
- **Safe and Bold.** Every basket can be bought whole or split in two. Safe is paid first, up to a cap set per story. Bold gets everything above that. The cap is chosen so Safe can still gain about 15% in the best case after the spread: on a likely story the cap is higher, so Safe carries enough risk to earn a return. Both are claims on the same pool of contracts.

## Current state

This is a working demo, not a finished product.

| Part | State |
|---|---|
| Market data, index, history chart | Live, from Gemini's public API |
| Buy, sell, portfolio | Simulated in the browser with practice money |
| Email sign-in and wallet | Placeholder; no real wallet is created |
| Story tokens on Solana | Not built |
| Orders on Gemini | Not built |

## How it works

- `lib/gemini.ts` reads Gemini's public prediction-market endpoints (events by ticker, events by category, hourly candles). No API key. Responses are cached in memory and refreshed in the background.
- `lib/stories.ts` defines the stories. Hand-written stories pick contracts by label, by closest to 50¢, or by most likely. Weather stories are generated each day from whatever city markets Gemini lists. A story with fewer than five priced legs is hidden.
- `lib/math.ts` prices the Safe and Bold sides from the chance of each number of legs hitting.
- `lib/store.ts` keeps the demo account in `localStorage`.

## Assumptions and risks

- **Trust.** In the intended design the app holds the Gemini positions and the story token is a receipt for a share of them. Holders trust the app, not the exchange.
- **Independence.** Safe and Bold prices treat the legs as independent. Legs in one story tend to move together, so all-or-nothing outcomes are more likely than the model shows.
- **Thin markets.** When a contract has no two-sided quote, its price falls back to the last trade or the one quoted side and is marked with an asterisk.
- **History.** The chart is rebuilt from hourly trade prices; the headline index uses live quotes.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Stack

Next.js (App Router, TypeScript), Vaul for the buy sheet, Sonner for toasts, hand-written CSS and SVG charts.

## Development record

See [the development record](development/README.md) for the activity log and its date conventions.
