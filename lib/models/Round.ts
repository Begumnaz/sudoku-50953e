// Round — a single Blitz round. Rounds are numbered cumulatively (1-based) and
// never reset except by an explicit score reset. Every 10th round is a 9×9
// bonus round; all other rounds are 4×4.

import type { Grid, PuzzleSize } from './Puzzle';

export type RoundStatus = 'waiting' | 'playing' | 'round_end' | 'match_end';

/** A 9×9 bonus round occurs on every Nth cumulative round. */
export const BONUS_EVERY = 10;

/** Round durations (seconds). The 9×9 bonus gets more time. */
export const ROUND_DURATION_4 = 90;
export const ROUND_DURATION_9 = 240;

/** True when this cumulative round number is a 9×9 bonus round. */
export function isBonusRound(round: number): boolean {
  return round > 0 && round % BONUS_EVERY === 0;
}

/** Board size for a cumulative round number. */
export function boardSizeForRound(round: number): PuzzleSize {
  return isBonusRound(round) ? 9 : 4;
}

/** Round duration (seconds) for a cumulative round number. */
export function durationForRound(round: number): number {
  return isBonusRound(round) ? ROUND_DURATION_9 : ROUND_DURATION_4;
}

export interface Round {
  /** Cumulative round counter (1-based). */
  number: number;
  boardSize: PuzzleSize;
  /** True on the 9×9 bonus round. */
  isBonus: boolean;
  durationSeconds: number;
  puzzle: Grid | null;
  solution: Grid | null;
  /** ISO timestamp the round started, or null while not playing. */
  startedAt: string | null;
}
