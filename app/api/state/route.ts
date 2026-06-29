import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Difficulty } from '@/lib/sudoku';

export const dynamic = 'force-dynamic';

const VALID: Difficulty[] = ['extra-easy', 'easy', 'medium', 'hard'];

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

/* ─── GET /api/state?difficulty=easy ─── */
export async function GET(req: NextRequest) {
  const diff = req.nextUrl.searchParams.get('difficulty') as Difficulty | null;
  if (!diff || !VALID.includes(diff)) return bad('invalid difficulty');

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM game_state WHERE difficulty = ?')
    .get(diff) as Record<string, unknown> | undefined;

  if (!row) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    puzzle:     JSON.parse(row.puzzle as string),
    solution:   JSON.parse(row.solution as string),
    cells:      JSON.parse(row.cells as string),
    selected:   row.selected_r != null ? [Number(row.selected_r), Number(row.selected_c)] : null,
    won:        row.won === '1' || row.won === 1,
  });
}

/* ─── POST /api/state ─── */
export async function POST(req: NextRequest) {
  let body: {
    difficulty: Difficulty;
    puzzle: unknown;
    solution: unknown;
    cells: unknown;
    selected: [number, number] | null;
    won: boolean;
  };

  try { body = await req.json(); }
  catch { return bad('invalid JSON'); }

  const { difficulty, puzzle, solution, cells, selected, won } = body;
  if (!difficulty || !VALID.includes(difficulty)) return bad('invalid difficulty');

  const db = getDb();
  db.prepare(`
    INSERT INTO game_state (difficulty, puzzle, solution, cells, selected_r, selected_c, won, updated_at)
    VALUES (@difficulty, @puzzle, @solution, @cells, @selected_r, @selected_c, @won, datetime('now'))
    ON CONFLICT(difficulty) DO UPDATE SET
      puzzle     = excluded.puzzle,
      solution   = excluded.solution,
      cells      = excluded.cells,
      selected_r = excluded.selected_r,
      selected_c = excluded.selected_c,
      won        = excluded.won,
      updated_at = excluded.updated_at
  `).run({
    difficulty,
    puzzle:     JSON.stringify(puzzle),
    solution:   JSON.stringify(solution),
    cells:      JSON.stringify(cells),
    selected_r: selected ? selected[0] : null,
    selected_c: selected ? selected[1] : null,
    won:        won ? 1 : 0,
  });

  return NextResponse.json({ ok: true });
}
