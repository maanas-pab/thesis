export type Side = "yes" | "no";

export type Leg = {
  symbol: string;
  eventTicker: string;
  eventTitle: string;
  label: string;
  side: Side;
  /** Price of this leg, 0 to 1, after applying the side. */
  price: number;
  /** What a buyer would pay right now, 0 to 1. */
  buy: number;
  /** True when the price is not a two-sided midpoint. */
  indicative: boolean;
  weight: number;
};

export type Tranches = {
  attach: number;
  safePrice: number;
  boldPrice: number;
  safeLoss: number;
  boldLoss: number;
  /** payoff[h] = pool payout per unit when h legs hit */
  dist: number[];
};

export type Story = {
  id: string;
  name: string;
  blurb: string;
  group: "Economy" | "Tech" | "Politics" | "Sports" | "Weather";
  settles: string;
  legs: Leg[];
  /** 0 to 100 */
  index: number;
  /** Cost to buy one unit today, 0 to 1 */
  buyPrice: number;
  tranches: Tranches;
};

export type Point = { t: number; v: number };

export type TrancheKind = "whole" | "safe" | "bold";

export type Position = {
  id: string;
  storyId: string;
  storyName: string;
  kind: TrancheKind;
  units: number;
  cost: number;
  ts: number;
};
