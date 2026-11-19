import type { Position, Story, TrancheKind } from "./types";

/** A new position that locks in the story's exact contracts, Safe cap and correlations. */
export function positionFrom(story: Story, kind: TrancheKind, units: number, cost: number): Omit<Position, "id" | "ts"> {
  return {
    storyId: story.id,
    storyName: story.name,
    kind,
    units,
    cost,
    attach: story.tranches.attach,
    corr: story.tranches.corr,
    legs: story.legs.map((l) => ({
      symbol: l.symbol,
      eventTicker: l.eventTicker,
      label: `${l.eventTitle}: ${l.label}`,
      side: l.side,
      weight: l.weight,
      entry: l.price,
    })),
  };
}
