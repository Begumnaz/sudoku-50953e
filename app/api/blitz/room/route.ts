import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generate4x4 } from '@/lib/sudoku4';

export const dynamic = 'force-dynamic';

const ROOM_ID = 'edin-vs-begus';
const ROUND_DURATION = 90; // seconds
const READY_SENTINEL = '__ready__';

type RoomRow = {
  id: string;
  status: string;
  current_round: number;
  puzzle: string | null;
  solution: string | null;
  round_started_at: string | null;
  round_duration: number;
  updated_at: string;
};

type PlayerStateRow = {
  room_id: string;
  round: number;
  username: string;
  cells: string | null;
  submitted: number;
  score: number;
  finished_at: string | null;
};

type UserRow = {
  username: string;
  total_score: number;
  wins: number;
  losses: number;
};

function ensureRoom(db: ReturnType<typeof getDb>): RoomRow {
  const existing = db
    .prepare('SELECT * FROM blitz_rooms WHERE id = ?')
    .get(ROOM_ID) as RoomRow | undefined;
  if (existing) return existing;
  db.prepare(`
    INSERT INTO blitz_rooms (id, status, current_round, round_duration, updated_at)
    VALUES (?, 'waiting', 0, ?, datetime('now'))
  `).run(ROOM_ID, ROUND_DURATION);
  return db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
}

function safeParseCells(raw: string | null): (number | null)[][] | null {
  if (!raw || raw === READY_SENTINEL) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function buildRoomPayload(db: ReturnType<typeof getDb>, room: RoomRow) {
  const players = db
    .prepare('SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ?')
    .all(ROOM_ID, room.current_round) as PlayerStateRow[];

  const playerMap: Record<string, { cells: unknown; submitted: boolean; score: number; ready: boolean }> = {};
  for (const p of players) {
    playerMap[p.username] = {
      cells:     safeParseCells(p.cells),
      submitted: !!p.submitted,
      score:     p.score,
      ready:     p.cells === READY_SENTINEL,
    };
  }

  const users = db.prepare('SELECT * FROM blitz_users').all() as UserRow[];
  const scores: Record<string, { total_score: number; wins: number; losses: number }> = {};
  for (const u of users) {
    scores[u.username] = {
      total_score: u.total_score,
      wins:        u.wins,
      losses:      u.losses,
    };
  }

  let timeLeft = ROUND_DURATION;
  if (room.round_started_at && room.status === 'playing') {
    const elapsed = (Date.now() - new Date(room.round_started_at + 'Z').getTime()) / 1000;
    timeLeft = Math.max(0, ROUND_DURATION - Math.floor(elapsed));
  }

  return {
    roomId:         ROOM_ID,
    status:         room.status,
    currentRound:   room.current_round,
    puzzle:         room.puzzle  ? JSON.parse(room.puzzle)   : null,
    solution:       room.solution ? JSON.parse(room.solution) : null,
    roundDuration:  ROUND_DURATION,
    timeLeft,
    roundStartedAt: room.round_started_at,
    players:        playerMap,
    scores,
    updatedAt:      room.updated_at,
  };
}

/* ──────────────────────────────────────────────
   GET /api/blitz/room  — poll for state
────────────────────────────────────────────── */
export async function GET() {
  const db   = getDb();
  const room = ensureRoom(db);

  // Auto-end round when timer expires
  if (room.status === 'playing' && room.round_started_at) {
    const elapsed = (Date.now() - new Date(room.round_started_at + 'Z').getTime()) / 1000;
    if (elapsed >= ROUND_DURATION) {
      // Award 0 to anyone who didn't submit
      const players = db
        .prepare('SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ?')
        .all(ROOM_ID, room.current_round) as PlayerStateRow[];

      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE blitz_rooms
          SET status = 'round_end', updated_at = datetime('now')
          WHERE id = ?
        `).run(ROOM_ID);

        for (const p of players) {
          if (!p.submitted) {
            db.prepare(`
              UPDATE blitz_player_state
              SET submitted = 1, score = 0
              WHERE room_id = ? AND round = ? AND username = ?
            `).run(ROOM_ID, room.current_round, p.username);
          }
        }

        // Update cumulative scores (only for newly-ended round)
        for (const p of players) {
          db.prepare('UPDATE blitz_users SET total_score = total_score + ? WHERE username = ?')
            .run(p.score, p.username);
        }

        // Determine round winner
        const sorted = [...players].sort((a, b) => b.score - a.score);
        if (sorted.length === 2 && sorted[0].score !== sorted[1].score) {
          db.prepare('UPDATE blitz_users SET wins = wins + 1 WHERE username = ?')
            .run(sorted[0].username);
          db.prepare('UPDATE blitz_users SET losses = losses + 1 WHERE username = ?')
            .run(sorted[1].username);
        }
      });
      tx();

      const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
      return NextResponse.json(buildRoomPayload(db, updated));
    }
  }

  return NextResponse.json(buildRoomPayload(db, room));
}

/* ──────────────────────────────────────────────
   POST /api/blitz/room  — actions
────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  let body: { action: string; username?: string; cells?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const db   = getDb();
  const room = ensureRoom(db);
  const { action, username, cells } = body;

  /* ── ready ── */
  if (action === 'ready') {
    if (!username) return NextResponse.json({ error: 'missing username' }, { status: 400 });

    if (room.status === 'waiting' || room.status === 'round_end') {
      // Upsert ready marker
      const existing = db.prepare(
        'SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ? AND username = ?'
      ).get(ROOM_ID, room.current_round, username) as PlayerStateRow | undefined;

      if (!existing) {
        db.prepare(`
          INSERT INTO blitz_player_state (room_id, round, username, cells, submitted, score)
          VALUES (?, ?, ?, ?, 0, 0)
        `).run(ROOM_ID, room.current_round, username, READY_SENTINEL);
      } else {
        db.prepare(`
          UPDATE blitz_player_state
          SET cells = ?
          WHERE room_id = ? AND round = ? AND username = ?
        `).run(READY_SENTINEL, ROOM_ID, room.current_round, username);
      }

      // Count ready players
      const readyPlayers = db.prepare(`
        SELECT * FROM blitz_player_state
        WHERE room_id = ? AND round = ? AND cells = ?
      `).all(ROOM_ID, room.current_round, READY_SENTINEL) as PlayerStateRow[];

      if (readyPlayers.length >= 2) {
        // Both ready — start the round
        const { puzzle, solution } = generate4x4(8);
        const nextRound = room.status === 'round_end'
          ? room.current_round + 1
          : room.current_round === 0 ? 1 : room.current_round;

        const startTx = db.transaction(() => {
          db.prepare(`
            UPDATE blitz_rooms
            SET status = 'playing',
                current_round = ?,
                puzzle = ?,
                solution = ?,
                round_started_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(nextRound, JSON.stringify(puzzle), JSON.stringify(solution), ROOM_ID);

          // Fresh player state for the new round
          db.prepare('DELETE FROM blitz_player_state WHERE room_id = ? AND round = ?')
            .run(ROOM_ID, nextRound);

          for (const player of ['Edin', 'Begus']) {
            db.prepare(`
              INSERT INTO blitz_player_state (room_id, round, username, cells, submitted, score)
              VALUES (?, ?, ?, NULL, 0, 0)
            `).run(ROOM_ID, nextRound, player);
          }
        });
        startTx();
      }
    }

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  /* ── update_cells ── */
  if (action === 'update_cells') {
    if (!username || cells === undefined)
      return NextResponse.json({ error: 'missing fields' }, { status: 400 });
    if (room.status !== 'playing')
      return NextResponse.json({ error: 'not playing' }, { status: 400 });

    db.prepare(`
      UPDATE blitz_player_state
      SET cells = ?
      WHERE room_id = ? AND round = ? AND username = ?
    `).run(JSON.stringify(cells), ROOM_ID, room.current_round, username);

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  /* ── submit ── */
  if (action === 'submit') {
    if (!username || cells === undefined)
      return NextResponse.json({ error: 'missing fields' }, { status: 400 });
    if (room.status !== 'playing')
      return NextResponse.json({ error: 'not playing' }, { status: 400 });

    const pState = db.prepare(
      'SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ? AND username = ?'
    ).get(ROOM_ID, room.current_round, username) as PlayerStateRow | undefined;

    if (pState?.submitted) {
      const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
      return NextResponse.json(buildRoomPayload(db, updated));
    }

    // Score calculation
    const solution = room.solution ? JSON.parse(room.solution) : null;
    const elapsed = room.round_started_at
      ? (Date.now() - new Date(room.round_started_at + 'Z').getTime()) / 1000
      : ROUND_DURATION;
    const remaining = Math.max(0, ROUND_DURATION - Math.floor(elapsed));

    let score = 0;
    if (solution && cells) {
      const board = cells as (number | null)[][];
      let correct = true;
      outer:
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          if (board[r]?.[c] !== solution[r]?.[c]) { correct = false; break outer; }
      if (correct) score = 100 + remaining * 10;
    }

    db.prepare(`
      UPDATE blitz_player_state
      SET cells = ?, submitted = 1, score = ?, finished_at = datetime('now')
      WHERE room_id = ? AND round = ? AND username = ?
    `).run(JSON.stringify(cells), score, ROOM_ID, room.current_round, username);

    // Check if both submitted
    const allSubmitted = db.prepare(
      'SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ? AND submitted = 1'
    ).all(ROOM_ID, room.current_round) as PlayerStateRow[];

    if (allSubmitted.length >= 2) {
      const allPlayers = db.prepare(
        'SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ?'
      ).all(ROOM_ID, room.current_round) as PlayerStateRow[];

      const endTx = db.transaction(() => {
        db.prepare(`
          UPDATE blitz_rooms SET status = 'round_end', updated_at = datetime('now') WHERE id = ?
        `).run(ROOM_ID);

        for (const p of allPlayers) {
          db.prepare('UPDATE blitz_users SET total_score = total_score + ? WHERE username = ?')
            .run(p.score, p.username);
        }

        const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
        if (sorted.length === 2 && sorted[0].score !== sorted[1].score) {
          db.prepare('UPDATE blitz_users SET wins = wins + 1 WHERE username = ?')
            .run(sorted[0].username);
          db.prepare('UPDATE blitz_users SET losses = losses + 1 WHERE username = ?')
            .run(sorted[1].username);
        }
      });
      endTx();
    }

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  /* ── reset (wipe all scores + rounds) ── */
  if (action === 'reset') {
    const resetTx = db.transaction(() => {
      db.prepare(`
        UPDATE blitz_rooms
        SET status = 'waiting', current_round = 0,
            puzzle = NULL, solution = NULL,
            round_started_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(ROOM_ID);
      db.prepare('DELETE FROM blitz_player_state WHERE room_id = ?').run(ROOM_ID);
      db.prepare('UPDATE blitz_users SET total_score = 0, wins = 0, losses = 0').run();
    });
    resetTx();

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
