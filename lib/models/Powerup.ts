// Powerups — each player is granted one random powerup (from the admin-enabled
// pool) at the start of every Blitz round, usable once during that round.

export type PowerupId = 'reveal' | 'freeze' | 'fog' | 'scramble' | 'shield' | 'double';

export type PowerupKind = 'help' | 'sabotage' | 'risk';

export interface PowerupMeta {
  id: PowerupId;
  icon: string;
  label: string;
  kind: PowerupKind;
  /** Short description shown on the use button / admin toggle. */
  blurb: string;
}

export const ALL_POWERUPS: PowerupMeta[] = [
  { id: 'reveal',   icon: '✨', label: 'Reveal',          kind: 'help',     blurb: 'Fill one correct cell on your board.' },
  { id: 'freeze',   icon: '🧊', label: 'Freeze',          kind: 'sabotage', blurb: "Lock your opponent's board for 5s." },
  { id: 'fog',      icon: '🌫️', label: 'Fog',             kind: 'sabotage', blurb: "Blur your opponent's board for 5s." },
  { id: 'scramble', icon: '💣', label: 'Scramble',        kind: 'sabotage', blurb: 'Wipe 2 cells your opponent filled in.' },
  { id: 'shield',   icon: '🛡️', label: 'Shield',          kind: 'risk',     blurb: 'Block the next sabotage against you.' },
  { id: 'double',   icon: '🎲', label: 'Double or Nothing', kind: 'risk',   blurb: 'Win = 2× points, lose = 0 this round.' },
];

export const POWERUP_IDS: PowerupId[] = ALL_POWERUPS.map(p => p.id);

export function isPowerupId(v: unknown): v is PowerupId {
  return typeof v === 'string' && (POWERUP_IDS as string[]).includes(v);
}

export function powerupMeta(id: PowerupId): PowerupMeta {
  return ALL_POWERUPS.find(p => p.id === id)!;
}

/** Effect tuning. */
export const FREEZE_SECONDS = 5;
export const FOG_SECONDS = 5;
export const SCRAMBLE_CELLS = 2;

/** Sabotages are the powerups a Shield can block. */
export const SABOTAGE_IDS: PowerupId[] = ['freeze', 'fog', 'scramble'];
