export type Side = "yes" | "no";

export type Leg = {
  symbol: string;
  eventTicker: string;
  eventTitle: string;
  label: string;
  side: Side;
  /** Price of this leg, 0 to 1, after applying the side. */
  price: number;
  /** What a buyer would pay right now, 0 to 1 (the ask, after applying the side). */
  buy: number;
  /** What a seller would get right now, 0 to 1 (the bid, after applying the side). */
  sell: number;
  /** True when the price is not a two-sided midpoint. */
  indicative: boolean;
  weight: number;
  /** When the event starts (games) and when it settles, as timestamps. */
  start?: number;
  expiry?: number;
  /** The event's traded volume in dollars: last 24 hours and all time. Shared by every leg on the same event. */
  vol24h?: number;
  vol?: number;
  /** A picture for the leg: the contract's own (team logos) or the event's. */
  image?: string;
};

/** One payout level of a unit: it pays `pay` with probability `p`. `hits` is how many legs hit. */
export type Level = { pay: number; p: number; hits: number };

export type Tranches = {
  attach: number;
  safePrice: number;
  boldPrice: number;
  safeLoss: number;
  boldLoss: number;
  /** Every payout the pool can make and its chance, highest first. */
  levels: Level[];
  /** Correlation between legs used for pricing, or null when treated as independent. */
  corr: number[][] | null;
  avgCorr: number;
  /** Chance every leg hits, with and without correlation. */
  allHit: number;
  allHitIndependent: number;
};

export type Story = {
  id: string;
  name: string;
  blurb: string;
  group: "Economy" | "Crypto" | "Tech" | "Politics" | "Sports" | "Games" | "Weather" | "Community";
  /** Set on stories people built themselves. */
  community?: { creator: string; createdAt: number; startIndex: number; thesis?: string; reasons?: Record<string, string> };
  settles: string;
  legs: Leg[];
  /** 0 to 100 */
  index: number;
  /** Cost to buy one unit today, 0 to 1: every leg at its ask. */
  buyPrice: number;
  /** What one unit sells for today, 0 to 1: every leg at its bid. */
  sellPrice: number;
  tranches: Tranches;
  /** Dollars traded on the markets inside, counting each event once: last 24 hours and all time. */
  volume24h: number;
  volume: number;
};

export type Point = { t: number; v: number };

export type TrancheKind = "whole" | "safe" | "bold";

/** delta is index points; from and to are the leg's own price, 0 to 1. */
export type Mover = { label: string; side: Side; delta: number; from: number; to: number };
export type History = { points: Point[]; movers: Mover[] };
export type Range = "1d" | "1w" | "1m";

/** The exact contracts a position was bought with. Stories re-pick their legs, positions don't. */
export type HeldLeg = { symbol: string; eventTicker: string; label: string; side: Side; weight: number; entry: number };
/** Live quote for one held leg, after applying its side. null when it can no longer be priced. */
export type Mark = { price: number; bid: number; ask: number; settled?: boolean } | null;

export type Position = {
  id: string;
  storyId: string;
  storyName: string;
  kind: TrancheKind;
  units: number;
  cost: number;
  ts: number;
  /** Safe cap and leg correlations locked in at purchase. */
  attach: number;
  corr?: number[][] | null;
  legs: HeldLeg[];
  /** The devnet token minted for this position, when the chain was reachable. */
  chain?: { mint: string; signature: string; url: string };
};

/** A leg as chosen by a person or by the thesis matcher, before it is priced. */
export type LegPick = { eventTicker: string; symbol: string; side: Side; weight: number; reason?: string };

/** One quotable contract, for search and for the thesis matcher. */
export type CatalogEntry = {
  eventTicker: string;
  eventTitle: string;
  category: string;
  symbol: string;
  label: string;
  mid: number;
  bid: number;
  ask: number;
  indicative: boolean;
  expiry?: string;
};

export type Alert = { id: string; storyId: string; storyName: string; dir: "above" | "below"; level: number; ts: number };
/** A resting buy: fills when the side's ask is at or below `limit`. Cash is set aside when placed. */
export type Order = { id: string; storyId: string; storyName: string; kind: TrancheKind; limit: number; dollars: number; ts: number };
/** A finished position, kept for the record. */
export type Closed = { id: string; storyName: string; kind: TrancheKind; cost: number; proceeds: number; how: "sold" | "settled"; ts: number };

/** A deposit into a tiered pool, as this browser remembers it. */
export type PoolHolding = {
  poolId: string;
  depositId: string;
  storyId: string;
  storyName: string;
  amount: number;
  tier: "t1" | "t2" | "t3" | "t4" | "u";
  lockAt: number;
  ts: number;
  /** Set once the money has come back: refunded (late deposit), withdrawn or collected. */
  done?: "refunded" | "withdrawn" | "collected";
  payout?: number;
};
