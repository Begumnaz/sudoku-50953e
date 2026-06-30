// Shared reader for the single blitz_settings row, used by both the settings
// API (read/update) and the room engine (to size/time each round).

import type Database from 'better-sqlite3';
import { BlitzSettings, DEFAULT_SETTINGS, sanitizeSettings } from './models';

const SETTINGS_ID = 'global';

type SettingsRow = {
  id: string;
  normal_board_size: number;
  normal_seconds: number;
  bonus_seconds: number;
  bonus_every: number;
  bonus_difficulty: string;
  normal_difficulty: string;
};

export function readBlitzSettings(db: Database.Database): BlitzSettings {
  const row = db
    .prepare('SELECT * FROM blitz_settings WHERE id = ?')
    .get(SETTINGS_ID) as SettingsRow | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  return sanitizeSettings({
    normalBoardSize: row.normal_board_size as 4 | 9,
    normalSeconds: row.normal_seconds,
    bonusSeconds: row.bonus_seconds,
    bonusEvery: row.bonus_every,
    bonusDifficulty: row.bonus_difficulty as BlitzSettings['bonusDifficulty'],
    normalDifficulty: row.normal_difficulty as BlitzSettings['normalDifficulty'],
  });
}

export function writeBlitzSettings(db: Database.Database, clean: BlitzSettings): void {
  db.prepare(`
    UPDATE blitz_settings
    SET normal_board_size = ?, normal_seconds = ?, bonus_seconds = ?,
        bonus_every = ?, bonus_difficulty = ?, normal_difficulty = ?
    WHERE id = ?
  `).run(
    clean.normalBoardSize,
    clean.normalSeconds,
    clean.bonusSeconds,
    clean.bonusEvery,
    clean.bonusDifficulty,
    clean.normalDifficulty,
    SETTINGS_ID,
  );
}
