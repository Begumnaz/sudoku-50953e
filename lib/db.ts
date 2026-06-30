import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.env.DB_DIR || path.join(process.cwd(), 'data'), 'sudoku.db');

const DB_DIR = path.dirname(DB_PATH);

let _db: Database.Database | null = null;

/** Add a column to an existing table only if it isn't already there (SQLite has
 *  no ADD COLUMN IF NOT EXISTS), so prod volumes created before the column get
 *  migrated in place without wiping data. */
function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

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

  // Seed the two hard-coded players (INSERT OR IGNORE so we never overwrite
  // an existing row's score/wins on the deployed Railway volume).
  const insertUser = _db.prepare(`
    INSERT OR IGNORE INTO blitz_users (username, password, total_score, wins, losses)
    VALUES (?, ?, 0, 0, 0)
  `);
  insertUser.run('Edin',  'edin123');
  insertUser.run('Begus', 'begus123');

  // Force-reset passwords from Railway env vars when present. The prod volume
  // already holds seeded users whose passwords we don't know, and INSERT OR
  // IGNORE never overwrites them — so this is the supported way to (re)set a
  // known password without putting secrets in the repo. Set BLITZ_EDIN_PASSWORD
  // / BLITZ_BEGUS_PASSWORD in Railway and redeploy.
  const setPassword = _db.prepare('UPDATE blitz_users SET password = ? WHERE username = ?');
  if (process.env.BLITZ_EDIN_PASSWORD)  setPassword.run(process.env.BLITZ_EDIN_PASSWORD,  'Edin');
  if (process.env.BLITZ_BEGUS_PASSWORD) setPassword.run(process.env.BLITZ_BEGUS_PASSWORD, 'Begus');

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
      board_size    INTEGER NOT NULL DEFAULT 4,
      is_bonus      INTEGER NOT NULL DEFAULT 0,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrate existing prod rooms tables that predate board_size / is_bonus.
  addColumnIfMissing(_db, 'blitz_rooms', 'board_size', 'INTEGER NOT NULL DEFAULT 4');
  addColumnIfMissing(_db, 'blitz_rooms', 'is_bonus',   'INTEGER NOT NULL DEFAULT 0');

  // ── Blitz: admin-tunable settings (single shared row) ──
  _db.exec(`
    CREATE TABLE IF NOT EXISTS blitz_settings (
      id                TEXT PRIMARY KEY,
      normal_board_size INTEGER NOT NULL DEFAULT 4,
      normal_seconds    INTEGER NOT NULL DEFAULT 90,
      bonus_seconds     INTEGER NOT NULL DEFAULT 240,
      bonus_every       INTEGER NOT NULL DEFAULT 10,
      bonus_difficulty  TEXT NOT NULL DEFAULT 'easy',
      normal_difficulty TEXT NOT NULL DEFAULT 'easy'
    )
  `);
  _db.prepare(`INSERT OR IGNORE INTO blitz_settings (id) VALUES ('global')`).run();

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
