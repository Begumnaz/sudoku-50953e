import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const { username, password } = body;
  if (!username || !password)
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });

  const db = getDb();
  const user = db
    .prepare('SELECT * FROM blitz_users WHERE username = ?')
    .get(username) as { username: string; password: string; total_score: number; wins: number; losses: number } | undefined;

  if (!user || user.password !== password)
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });

  return NextResponse.json({
    ok: true,
    username: user.username,
    total_score: user.total_score,
    wins: user.wins,
    losses: user.losses,
  });
}
