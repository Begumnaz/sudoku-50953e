// Player — one of the two fixed Blitz players. Mirrors the `blitz_users` table.
// `wins` is the persistent head-to-head tally of total ROUNDS won (Edin vs Begus).

export type PlayerName = 'Edin' | 'Begus';

export const PLAYERS: readonly PlayerName[] = ['Edin', 'Begus'] as const;

export interface Player {
  username: PlayerName;
  /** Cumulative points across every round ever played. */
  totalScore: number;
  /** Total rounds won (head-to-head tally). */
  wins: number;
  /** Total rounds lost. */
  losses: number;
}

/** The opponent of a given player in the 2-person app. */
export function opponentOf(name: PlayerName): PlayerName {
  return name === 'Edin' ? 'Begus' : 'Edin';
}
