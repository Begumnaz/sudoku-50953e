import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readBlitzSettings, writeBlitzSettings } from '@/lib/blitzSettings';
import { BlitzSettings, sanitizeSettings } from '@/lib/models';

export const dynamic = 'force-dynamic';

/** A password is accepted if it matches EITHER registered player. */
function passwordValid(db: ReturnType<typeof getDb>, password: string): boolean {
  if (!password) return false;
  const match = db
    .prepare('SELECT 1 FROM blitz_users WHERE password = ? LIMIT 1')
    .get(password);
  return !!match;
}

/* GET — current settings (read-only; safe to expose for display). */
export async function GET() {
  const db = getDb();
  return NextResponse.json(readBlitzSettings(db));
}

/* POST — { action: 'verify' | 'save', password, settings? }.
   Both actions require a password matching either player. */
export async function POST(req: NextRequest) {
  let body: { action?: string; password?: string; settings?: Partial<BlitzSettings> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const db = getDb();
  const { action, password, settings } = body;

  if (!passwordValid(db, password ?? '')) {
    return NextResponse.json({ error: 'invalid admin password' }, { status: 401 });
  }

  if (action === 'verify') {
    return NextResponse.json({ ok: true, settings: readBlitzSettings(db) });
  }

  if (action === 'save') {
    const clean = sanitizeSettings(settings);
    writeBlitzSettings(db, clean);
    return NextResponse.json({ ok: true, settings: clean });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
