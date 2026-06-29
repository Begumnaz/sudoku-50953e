import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'sudoku.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Make sure the data directory exists (important for Railway volume mounts)
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');

  // One row per difficulty stores the full game state as JSON
  _db.exec(`
    CREATE TABLE IF NOT EXISTS game_state (
      difficulty  TEXT PRIMARY KEY,
      puzzle      TEXT NOT NULL,
      solution    TEXT NOT NULL,
      cells       TEXT NOT NULL,
      selected_r  INTEGER,
      selected_c  INTEGER,
      won         INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return _db;
}
