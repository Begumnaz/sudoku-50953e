// Settings — admin-tunable knobs for the Blitz challenge. Shared by both
// players (one row in blitz_settings) and applied from the next round on, so
// tweaks never disrupt a round already in progress.

import type { Difficulty } from '../sudoku';

/** Board sizes we can actually generate today (4×4 and 9×9). 6×6 would need a
 *  dedicated generator + non-square box rendering — tracked as a future ticket. */
export type NormalBoardSize = 4 | 9;

export interface BlitzSettings {
  /** Board size for ordinary (non-bonus) rounds. */
  normalBoardSize: NormalBoardSize;
  /** Timer for ordinary rounds, seconds. */
  normalSeconds: number;
  /** Timer for 9×9 bonus rounds, seconds. */
  bonusSeconds: number;
  /** A 9×9 bonus round occurs every Nth cumulative round. 0 disables bonuses. */
  bonusEvery: number;
  /** Generator difficulty for the 9×9 bonus round. */
  bonusDifficulty: Difficulty;
  /** Generator difficulty for ordinary rounds when they are 9×9. */
  normalDifficulty: Difficulty;
}

export const DEFAULT_SETTINGS: BlitzSettings = {
  normalBoardSize: 4,
  normalSeconds: 90,
  bonusSeconds: 240,
  bonusEvery: 10,
  bonusDifficulty: 'easy',
  normalDifficulty: 'easy',
};

const DIFFICULTIES: Difficulty[] = ['extra-easy', 'easy', 'medium', 'hard'];

/** Clamp/sanitise an untrusted settings object into a valid BlitzSettings. */
export function sanitizeSettings(input: Partial<BlitzSettings> | null | undefined): BlitzSettings {
  const s = input ?? {};
  const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const diff = (v: unknown, fallback: Difficulty): Difficulty =>
    DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : fallback;

  return {
    normalBoardSize: s.normalBoardSize === 9 ? 9 : 4,
    normalSeconds: clampInt(s.normalSeconds, 20, 600, DEFAULT_SETTINGS.normalSeconds),
    bonusSeconds: clampInt(s.bonusSeconds, 30, 900, DEFAULT_SETTINGS.bonusSeconds),
    bonusEvery: clampInt(s.bonusEvery, 0, 100, DEFAULT_SETTINGS.bonusEvery),
    bonusDifficulty: diff(s.bonusDifficulty, DEFAULT_SETTINGS.bonusDifficulty),
    normalDifficulty: diff(s.normalDifficulty, DEFAULT_SETTINGS.normalDifficulty),
  };
}

/** True when this cumulative round is a 9×9 bonus round under these settings. */
export function isBonusFor(round: number, s: BlitzSettings): boolean {
  return round > 0 && s.bonusEvery > 0 && round % s.bonusEvery === 0;
}

export interface ResolvedRound {
  isBonus: boolean;
  boardSize: NormalBoardSize;
  durationSeconds: number;
  /** Generator difficulty to use (only relevant for a 9×9 board). */
  difficulty: Difficulty;
}

/** Resolve everything a round needs from the cumulative round number + settings. */
export function resolveRound(round: number, s: BlitzSettings): ResolvedRound {
  const isBonus = isBonusFor(round, s);
  return {
    isBonus,
    boardSize: isBonus ? 9 : s.normalBoardSize,
    durationSeconds: isBonus ? s.bonusSeconds : s.normalSeconds,
    difficulty: isBonus ? s.bonusDifficulty : s.normalDifficulty,
  };
}
