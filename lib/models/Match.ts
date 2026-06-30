// Match — a short group of consecutive rounds. A Blitz match is 2 rounds; when
// it finishes the players see a match-end summary, then start the next match.
// Matches are derived from the cumulative round counter, so they need no
// dedicated storage: match k covers rounds (2k-1, 2k).

/** Rounds played per match before the match-end summary. */
export const ROUNDS_PER_MATCH = 2;

/** 1-based match number containing a given cumulative round. */
export function matchNumberForRound(round: number): number {
  return Math.ceil(round / ROUNDS_PER_MATCH);
}

/** Position (1..ROUNDS_PER_MATCH) of a cumulative round within its match. */
export function roundInMatch(round: number): number {
  return ((round - 1) % ROUNDS_PER_MATCH) + 1;
}

/** True when this cumulative round is the final round of its match. */
export function isMatchEndingRound(round: number): boolean {
  return roundInMatch(round) === ROUNDS_PER_MATCH;
}

export interface Match {
  /** 1-based match counter. */
  number: number;
  roundsPerMatch: number;
  /** Position of the current round within the match (1..roundsPerMatch). */
  roundInMatch: number;
}
