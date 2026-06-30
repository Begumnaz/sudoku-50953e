import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.env.DB_DIR || path.join(process.cwd(), 'data'), 'sudoku.db');

const DB_DIR = path.dirname(DB_PATH);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');

  // ── legacy single-player table (kept for backward compat) ──
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

  // ── Blitz: two fixed users ──
  _db.exec(`
    CREATE TABLE IF NOT EXISTS blitz_users (
      username    TEXT PRIMARY KEY,
      password    TEXT NOT NULL,
      total_score INTEGER NOT NULL DEFAULT 0,
      wins        INTEGER NOT NULL DEFAULT 0,
      losses      INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Seed the two hard-coded players (INSERT OR IGNORE so we never overwrite)
  const insertUser = _db.prepare(`
    INSERT OR IGNORE INTO blitz_users (username, password, total_score, wins, losses)
    VALUES (?, ?, 0, 0, 0)
  `);
  insertUser.run('Edin',  'edin123');
  insertUser.run('Begus', 'begus123');

  // ── Blitz: rooms (one shared room for the pair) ──
  _db.exec(`
    CREATE TABLE IF NOT EXISTS blitz_rooms (
      id            TEXT PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'waiting',
      current_round INTEGER NOT NULL DEFAULT 0,
      puzzle        TEXT,
      solution      TEXT,
      round_started_at TEXT,
      round_duration   INTEGER NOT NULL DEFAULT 90,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Blitz: per-player per-round state ──
  _db.exec(`
    CREATE TABLE IF NOT EXISTS blitz_player_state (
      room_id     TEXT NOT NULL,
      round       INTEGER NOT NULL,
      username    TEXT NOT NULL,
      cells       TEXT,
      submitted   INTEGER NOT NULL DEFAULT 0,
      score       INTEGER NOT NULL DEFAULT 0,
      finished_at TEXT,
      PRIMARY KEY (room_id, round, username)
    )
  `);

  return _db;
}
