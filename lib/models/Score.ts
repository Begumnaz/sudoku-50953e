// Score — how a round is scored. A correct solve earns a base award plus a
// speed bonus proportional to the time left. The 9×9 bonus round pays a larger
// base and is skippable (skipping forfeits the points but costs nothing else).

import type { PuzzleSize } from './Puzzle';

export const BASE_4x4 = 100;
export const SPEED_BONUS_PER_SEC_4x4 = 10;

export const BASE_9x9_BONUS = 200;
export const SPEED_BONUS_PER_SEC_9x9 = 5;

export interface Score {
  base: number;
  speedBonus: number;
  total: number;
}

/** Score a submission. Incorrect (or skipped) solves earn 0. */
export function computeScore(
  size: PuzzleSize,
  correct: boolean,
  remainingSeconds: number,
): Score {
  if (!correct) return { base: 0, speedBonus: 0, total: 0 };
  const base = size === 9 ? BASE_9x9_BONUS : BASE_4x4;
  const perSec = size === 9 ? SPEED_BONUS_PER_SEC_9x9 : SPEED_BONUS_PER_SEC_4x4;
  const speedBonus = Math.max(0, remainingSeconds) * perSec;
  return { base, speedBonus, total: base + speedBonus };
}
