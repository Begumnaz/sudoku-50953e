import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generate4x4 } from '@/lib/sudoku4';
import { generate6x6 } from '@/lib/sudoku6';
import { generatePuzzle } from '@/lib/sudoku';
import {
  computeScore,
  ROUNDS_PER_MATCH,
  roundInMatch,
  matchNumberForRound,
  isMatchEndingRound,
  resolveRound,
  FREEZE_SECONDS,
  FOG_SECONDS,
  SCRAMBLE_CELLS,
  type PuzzleSize,
  type PowerupId,
} from '@/lib/models';
import { readBlitzSettings } from '@/lib/blitzSettings';

export const dynamic = 'force-dynamic';

const ROOM_ID = 'edin-vs-begus';
const DEFAULT_DURATION = 90; // seconds; the per-round value is stored on the room
const READY_SENTINEL = '__ready__';
// When both players are ready we set round_started_at this many seconds in the
// FUTURE, so both phones run a synchronized 3·2·1 countdown and the timer +
// input begin at the same wall-clock instant — no head start for whoever's poll
// happens to land first.
const COUNTDOWN_SECONDS = 3;

type RoomRow = {
  id: string;
  status: string;
  current_round: number;
  puzzle: string | null;
  solution: string | null;
  round_started_at: string | null;
  round_duration: number;
  board_size: number;
  is_bonus: number;
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
  powerup: string | null;
  powerup_used: number;
  frozen_until: string | null;
  fogged_until: string | null;
  shielded: number;
  wager: number;
  resync_token: string | null;
};

const PLAYER_NAMES = ['Edin', 'Begus'] as const;
const opponentOf = (u: string) => (u === 'Edin' ? 'Begus' : 'Edin');
const resyncToken = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

/** Whole seconds left until an ISO timestamp (stored as SQLite UTC), 0 if past. */
function secondsLeftUntil(ts: string | null): number {
  if (!ts) return 0;
  const ms = new Date(ts + 'Z').getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

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
  `).run(ROOM_ID, DEFAULT_DURATION);
  return db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
}

function safeParseCells(raw: string | null): (number | null)[][] | null {
  if (!raw || raw === READY_SENTINEL) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

/** Elapsed seconds since the round started; negative during the pre-round
 *  countdown (round_started_at is in the future). 0 if not started. */
function elapsedSeconds(room: RoomRow): number {
  if (!room.round_started_at) return 0;
  return (Date.now() - new Date(room.round_started_at + 'Z').getTime()) / 1000;
}

/** Whole seconds until the round actually begins (during the countdown), else 0. */
function startsInSeconds(room: RoomRow): number {
  if (!room.round_started_at || room.status !== 'playing') return 0;
  const ms = new Date(room.round_started_at + 'Z').getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** True once the countdown is over and the round is actually playable. */
function roundLive(room: RoomRow): boolean {
  return room.status === 'playing' && !!room.round_started_at && elapsedSeconds(room) >= 0;
}

/**
 * Overlay the puzzle's given clues onto a player's entered cells to produce a
 * complete board. The client only submits the cells it filled in — the puzzle's
 * pre-filled clue cells are left null — so they must be merged back before any
 * solution check, otherwise every given cell reads as a mismatch.
 */
function mergeGivens(
  puzzle: (number | null)[][] | null,
  cells: unknown,
): (number | null)[][] | null {
  if (!cells) return null;
  const board = cells as (number | null)[][];
  if (!puzzle) return board;
  return puzzle.map((row, r) =>
    row.map((val, c) =>
      val !== null && val !== undefined ? val : (board[r]?.[c] ?? null),
    ),
  );
}

/** True when the (givens-merged) board exactly matches the solution. */
function isSolved(cells: unknown, solution: number[][] | null): boolean {
  if (!cells || !solution) return false;
  const board = cells as (number | null)[][];
  const n = solution.length;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if ((board[r]?.[c] ?? null) !== solution[r][c]) return false;
  return true;
}

/**
 * Finalize the current round: award points, bump the head-to-head win/loss
 * tally, and move the room to 'match_end' (every ROUNDS_PER_MATCH rounds) or
 * 'round_end' otherwise. Non-submitters are recorded as 0.
 */
function finalizeRound(db: ReturnType<typeof getDb>, room: RoomRow): void {
  const players = db
    .prepare('SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ?')
    .all(ROOM_ID, room.current_round) as PlayerStateRow[];

  const nextStatus = isMatchEndingRound(room.current_round) ? 'match_end' : 'round_end';

  const tx = db.transaction(() => {
    for (const p of players) {
      if (!p.submitted) {
        db.prepare(`
          UPDATE blitz_player_state SET submitted = 1, score = 0
          WHERE room_id = ? AND round = ? AND username = ?
        `).run(ROOM_ID, room.current_round, p.username);
        p.submitted = 1;
        p.score = 0;
      }
    }

    db.prepare(`
      UPDATE blitz_rooms SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(nextStatus, ROOM_ID);

    // Double-or-Nothing: the round winner is decided by base (solve) scores;
    // then a wagering player doubles on a win or drops to 0 otherwise. The
    // adjusted score is persisted so the result screen and tally agree.
    if (players.length === 2) {
      const [a, b] = players;
      const aBase = a.score, bBase = b.score;
      const adjust = (base: number, otherBase: number, wager: number) =>
        wager ? (base > otherBase ? base * 2 : 0) : base;
      const aAdj = adjust(aBase, bBase, a.wager);
      const bAdj = adjust(bBase, aBase, b.wager);
      if (aAdj !== a.score) {
        db.prepare('UPDATE blitz_player_state SET score = ? WHERE room_id = ? AND round = ? AND username = ?')
          .run(aAdj, ROOM_ID, room.current_round, a.username);
        a.score = aAdj;
      }
      if (bAdj !== b.score) {
        db.prepare('UPDATE blitz_player_state SET score = ? WHERE room_id = ? AND round = ? AND username = ?')
          .run(bAdj, ROOM_ID, room.current_round, b.username);
        b.score = bAdj;
      }
    }

    for (const p of players) {
      db.prepare('UPDATE blitz_users SET total_score = total_score + ? WHERE username = ?')
        .run(p.score, p.username);
    }

    const sorted = [...players].sort((a, b) => b.score - a.score);
    if (sorted.length === 2 && sorted[0].score !== sorted[1].score) {
      db.prepare('UPDATE blitz_users SET wins = wins + 1 WHERE username = ?')
        .run(sorted[0].username);
      db.prepare('UPDATE blitz_users SET losses = losses + 1 WHERE username = ?')
        .run(sorted[1].username);
    }
  });
  tx();
}

/** Start the given round: generate a board sized for it (per admin settings)
 *  and begin the timer. */
function startRound(db: ReturnType<typeof getDb>, nextRound: number): void {
  const settings = readBlitzSettings(db);
  const { isBonus, boardSize, durationSeconds, difficulty } = resolveRound(nextRound, settings);
  const { puzzle, solution } =
    boardSize === 9 ? generatePuzzle(difficulty)
    : boardSize === 6 ? generate6x6(18)
    : generate4x4(8);

  const startTx = db.transaction(() => {
    db.prepare(`
      UPDATE blitz_rooms
      SET status = 'playing',
          current_round = ?,
          puzzle = ?,
          solution = ?,
          round_duration = ?,
          board_size = ?,
          is_bonus = ?,
          round_started_at = datetime('now', ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextRound,
      JSON.stringify(puzzle),
      JSON.stringify(solution),
      durationSeconds,
      boardSize,
      isBonus ? 1 : 0,
      `+${COUNTDOWN_SECONDS} seconds`,
      ROOM_ID,
    );

    db.prepare('DELETE FROM blitz_player_state WHERE room_id = ? AND round = ?')
      .run(ROOM_ID, nextRound);

    const pool = settings.powerupsEnabled;
    const grant = (): PowerupId | null =>
      pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;

    for (const player of PLAYER_NAMES) {
      db.prepare(`
        INSERT INTO blitz_player_state
          (room_id, round, username, cells, submitted, score, powerup, powerup_used, shielded, wager)
        VALUES (?, ?, ?, NULL, 0, 0, ?, 0, 0, 0)
      `).run(ROOM_ID, nextRound, player, grant());
    }
  });
  startTx();
}

function buildRoomPayload(db: ReturnType<typeof getDb>, room: RoomRow) {
  const players = db
    .prepare('SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ?')
    .all(ROOM_ID, room.current_round) as PlayerStateRow[];

  type PlayerPayload = {
    cells: unknown; submitted: boolean; score: number; ready: boolean; solved: boolean;
    powerup: PowerupId | null; powerupUsed: boolean;
    frozenSecondsLeft: number; foggedSecondsLeft: number;
    shielded: boolean; wager: boolean; resyncToken: string | null;
  };
  const playerMap: Record<string, PlayerPayload> = {};
  for (const p of players) {
    playerMap[p.username] = {
      cells:     safeParseCells(p.cells),
      submitted: !!p.submitted,
      score:     p.score,
      ready:     p.cells === READY_SENTINEL,
      // A correct solve always scores > 0 (base 100/200 + speed bonus); an
      // incorrect or skipped submission scores 0. Lets the submitter see their
      // own verdict immediately without revealing it to the opponent's UI.
      solved:    !!p.submitted && p.score > 0,
      powerup:     (p.powerup as PowerupId | null) ?? null,
      powerupUsed: !!p.powerup_used,
      frozenSecondsLeft: room.status === 'playing' ? secondsLeftUntil(p.frozen_until) : 0,
      foggedSecondsLeft: room.status === 'playing' ? secondsLeftUntil(p.fogged_until) : 0,
      shielded:    !!p.shielded,
      wager:       !!p.wager,
      resyncToken: p.resync_token ?? null,
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

  // Clamp to the round duration so the pre-round countdown (negative elapsed)
  // doesn't show more than a full clock.
  let timeLeft = room.round_duration;
  if (room.round_started_at && room.status === 'playing') {
    timeLeft = Math.min(
      room.round_duration,
      Math.max(0, room.round_duration - Math.floor(elapsedSeconds(room))),
    );
  }

  // The live puzzle is the source of truth for board size; is_bonus is stored
  // on the room when the round starts (can't be inferred from size alone, since
  // a normal round may now also be 9×9).
  const parsedPuzzle = room.puzzle ? JSON.parse(room.puzzle) : null;
  const boardSize = parsedPuzzle ? parsedPuzzle.length : room.board_size;

  return {
    roomId:         ROOM_ID,
    status:         room.status,
    currentRound:   room.current_round,
    boardSize,
    isBonus:        !!room.is_bonus,
    matchNumber:    matchNumberForRound(room.current_round),
    roundInMatch:   roundInMatch(room.current_round),
    roundsPerMatch: ROUNDS_PER_MATCH,
    puzzle:         parsedPuzzle,
    solution:       room.solution ? JSON.parse(room.solution) : null,
    roundDuration:  room.round_duration,
    timeLeft,
    startsInSeconds: startsInSeconds(room),
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

  // Auto-end round when the timer expires.
  if (room.status === 'playing' && room.round_started_at) {
    if (elapsedSeconds(room) >= room.round_duration) {
      finalizeRound(db, room);
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

    if (room.status === 'waiting' || room.status === 'round_end' || room.status === 'match_end') {
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
          UPDATE blitz_player_state SET cells = ?
          WHERE room_id = ? AND round = ? AND username = ?
        `).run(READY_SENTINEL, ROOM_ID, room.current_round, username);
      }

      const readyPlayers = db.prepare(`
        SELECT * FROM blitz_player_state
        WHERE room_id = ? AND round = ? AND cells = ?
      `).all(ROOM_ID, room.current_round, READY_SENTINEL) as PlayerStateRow[];

      if (readyPlayers.length >= 2) {
        const advancing = room.status === 'round_end' || room.status === 'match_end';
        const nextRound = advancing
          ? room.current_round + 1
          : room.current_round === 0 ? 1 : room.current_round;
        startRound(db, nextRound);
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
      UPDATE blitz_player_state SET cells = ?
      WHERE room_id = ? AND round = ? AND username = ?
    `).run(JSON.stringify(cells), ROOM_ID, room.current_round, username);

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  /* ── submit / skip ── */
  if (action === 'submit' || action === 'skip') {
    if (!username) return NextResponse.json({ error: 'missing username' }, { status: 400 });
    if (room.status !== 'playing')
      return NextResponse.json({ error: 'not playing' }, { status: 400 });
    if (!roundLive(room))
      return NextResponse.json({ error: 'round has not started' }, { status: 400 });
    if (action === 'skip' && !room.is_bonus)
      return NextResponse.json({ error: 'not a bonus round' }, { status: 400 });
    if (action === 'submit' && cells === undefined)
      return NextResponse.json({ error: 'missing fields' }, { status: 400 });

    const pState = db.prepare(
      'SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ? AND username = ?'
    ).get(ROOM_ID, room.current_round, username) as PlayerStateRow | undefined;

    if (pState?.submitted) {
      const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
      return NextResponse.json(buildRoomPayload(db, updated));
    }

    let score = 0;
    let savedCells: string | null = pState?.cells ?? null;
    if (action === 'submit') {
      const solution = room.solution ? JSON.parse(room.solution) : null;
      const puzzle   = room.puzzle   ? JSON.parse(room.puzzle)   : null;
      const remaining = Math.max(0, Math.min(room.round_duration, room.round_duration - Math.floor(elapsedSeconds(room))));
      const size: PuzzleSize =
        puzzle && puzzle.length === 9 ? 9 : puzzle && puzzle.length === 6 ? 6 : 4;
      const solved = isSolved(mergeGivens(puzzle, cells), solution);
      score = computeScore(size, solved, remaining).total;
      savedCells = JSON.stringify(cells);
    }
    // 'skip' → score stays 0, keep whatever cells were already synced.

    db.prepare(`
      UPDATE blitz_player_state
      SET cells = ?, submitted = 1, score = ?, finished_at = datetime('now')
      WHERE room_id = ? AND round = ? AND username = ?
    `).run(savedCells, score, ROOM_ID, room.current_round, username);

    const allSubmitted = db.prepare(
      'SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ? AND submitted = 1'
    ).all(ROOM_ID, room.current_round) as PlayerStateRow[];

    if (allSubmitted.length >= 2) {
      finalizeRound(db, room);
    }

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  /* ── powerup (use the round's granted powerup) ── */
  if (action === 'powerup') {
    if (!username) return NextResponse.json({ error: 'missing username' }, { status: 400 });
    if (room.status !== 'playing')
      return NextResponse.json({ error: 'not playing' }, { status: 400 });
    if (!roundLive(room))
      return NextResponse.json({ error: 'round has not started' }, { status: 400 });

    const getPS = (u: string) =>
      db.prepare('SELECT * FROM blitz_player_state WHERE room_id = ? AND round = ? AND username = ?')
        .get(ROOM_ID, room.current_round, u) as PlayerStateRow | undefined;

    const me = getPS(username);
    if (!me || !me.powerup)
      return NextResponse.json({ error: 'no powerup to use' }, { status: 400 });
    if (me.powerup_used)
      return NextResponse.json({ error: 'powerup already used' }, { status: 400 });
    if (me.submitted)
      return NextResponse.json({ error: 'already submitted' }, { status: 400 });

    const oppName  = opponentOf(username);
    const opp      = getPS(oppName);
    const type     = me.powerup as PowerupId;
    const solution = room.solution ? JSON.parse(room.solution) : null;
    const puzzle   = room.puzzle   ? JSON.parse(room.puzzle)   : null;
    const n = solution ? solution.length : puzzle ? puzzle.length : room.board_size;
    const isGivenCell = (r: number, c: number) =>
      !!puzzle && puzzle[r] != null && (puzzle[r][c] ?? null) !== null;

    const setCol = (user: string, sql: string, ...params: unknown[]) =>
      db.prepare(`UPDATE blitz_player_state SET ${sql} WHERE room_id = ? AND round = ? AND username = ?`)
        .run(...params, ROOM_ID, room.current_round, user);

    const tx = db.transaction(() => {
      setCol(username, 'powerup_used = 1');

      if (type === 'reveal') {
        const myCells: (number | null)[][] =
          safeParseCells(me.cells) ?? Array.from({ length: n }, () => Array(n).fill(null));
        const candidates: [number, number][] = [];
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++)
            if (!isGivenCell(r, c) && (myCells[r]?.[c] ?? null) === null) candidates.push([r, c]);
        if (candidates.length && solution) {
          const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
          if (!myCells[r]) myCells[r] = Array(n).fill(null);
          myCells[r][c] = solution[r][c];
          setCol(username, 'cells = ?, resync_token = ?', JSON.stringify(myCells), resyncToken());
        }
      } else if (type === 'shield') {
        setCol(username, 'shielded = 1');
      } else if (type === 'double') {
        setCol(username, 'wager = 1');
      } else if (opp) {
        // sabotage — a shield negates it (and is consumed)
        if (opp.shielded) {
          setCol(oppName, 'shielded = 0');
        } else if (type === 'freeze') {
          setCol(oppName, "frozen_until = datetime('now', ?)", `+${FREEZE_SECONDS} seconds`);
        } else if (type === 'fog') {
          setCol(oppName, "fogged_until = datetime('now', ?)", `+${FOG_SECONDS} seconds`);
        } else if (type === 'scramble') {
          const oc = safeParseCells(opp.cells);
          if (oc) {
            const filled: [number, number][] = [];
            for (let r = 0; r < n; r++)
              for (let c = 0; c < n; c++)
                if (!isGivenCell(r, c) && (oc[r]?.[c] ?? null) !== null) filled.push([r, c]);
            for (let i = filled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [filled[i], filled[j]] = [filled[j], filled[i]];
            }
            for (const [r, c] of filled.slice(0, SCRAMBLE_CELLS)) oc[r][c] = null;
            setCol(oppName, 'cells = ?, resync_token = ?', JSON.stringify(oc), resyncToken());
          }
        }
      }
    });
    tx();

    const fresh = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, fresh));
  }

  /* ── reset (wipe all scores + rounds) ── */
  if (action === 'reset') {
    const resetTx = db.transaction(() => {
      db.prepare(`
        UPDATE blitz_rooms
        SET status = 'waiting', current_round = 0,
            puzzle = NULL, solution = NULL,
            round_started_at = NULL, round_duration = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(DEFAULT_DURATION, ROOM_ID);
      db.prepare('DELETE FROM blitz_player_state WHERE room_id = ?').run(ROOM_ID);
      db.prepare('UPDATE blitz_users SET total_score = 0, wins = 0, losses = 0').run();
    });
    resetTx();

    const updated = db.prepare('SELECT * FROM blitz_rooms WHERE id = ?').get(ROOM_ID) as RoomRow;
    return NextResponse.json(buildRoomPayload(db, updated));
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
