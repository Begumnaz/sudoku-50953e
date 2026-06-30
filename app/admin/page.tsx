'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BlitzSettings, NormalBoardSize } from '@/lib/models';
import type { Difficulty } from '@/lib/sudoku';
import styles from '../admin.module.css';

const NORMAL_TIMES = [60, 90, 120, 180];
const BONUS_TIMES  = [120, 180, 240, 300];
const BONUS_FREQS: { label: string; value: number }[] = [
  { label: 'Off', value: 0 },
  { label: 'Every 5', value: 5 },
  { label: 'Every 10', value: 10 },
];
const DIFFICULTIES: Difficulty[] = ['extra-easy', 'easy', 'medium', 'hard'];
const diffLabel = (d: Difficulty) => (d === 'extra-easy' ? '★ Easy' : d.charAt(0).toUpperCase() + d.slice(1));

/* ── small segmented control ── */
function Segmented<T extends string | number>({
  options, value, onChange, render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => React.ReactNode;
}) {
  return (
    <div className={styles.segmented}>
      {options.map(opt => (
        <button
          key={String(opt)}
          type="button"
          className={`${styles.segBtn} ${value === opt ? styles.segActive : ''}`}
          onClick={() => onChange(opt)}
        >
          {render(opt)}
        </button>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<BlitzSettings | null>(null);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [saved, setSaved]       = useState(false);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Enter an admin password'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/blitz/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Wrong password'); setBusy(false); return; }
      setSettings(data.settings as BlitzSettings);
      setUnlocked(true);
    } catch { setError('Network error'); }
    setBusy(false);
  };

  const patch = (p: Partial<BlitzSettings>) => {
    setSettings(prev => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/blitz/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', password, settings }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Save failed'); setBusy(false); return; }
      setSettings(data.settings as BlitzSettings);
      setSaved(true);
    } catch { setError('Network error'); }
    setBusy(false);
  };

  /* ── locked: password gate ── */
  if (!unlocked || !settings) {
    return (
      <div className={styles.page}>
        <div className={styles.gateCard}>
          <div className={styles.gateIcon}>🔒</div>
          <h1 className={styles.gateTitle}>Admin</h1>
          <p className={styles.gateSub}>Either player&apos;s password unlocks the controls.</p>
          <form onSubmit={unlock} className={styles.gateForm}>
            <input
              className={styles.input}
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryBtn} type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </form>
          <Link href="/" className={styles.backLink}>← Back to menu</Link>
        </div>
      </div>
    );
  }

  /* ── unlocked: settings form ── */
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>‹ Menu</Link>
        <div className={styles.logo}>⚙️ Admin &amp; Difficulty</div>
        <p className={styles.tagline}>Changes apply from the next round.</p>
      </header>

      <main className={styles.main}>
        <section className={styles.group}>
          <label className={styles.groupLabel}>Normal round board size</label>
          <Segmented<NormalBoardSize>
            options={[4, 6, 9]}
            value={settings.normalBoardSize}
            onChange={v => patch({ normalBoardSize: v })}
            render={v => `${v}×${v}`}
          />
          <p className={styles.hint}>6×6 is a nice step up; 9×9 makes every round a full Sudoku.</p>
        </section>

        {settings.normalBoardSize === 9 && (
          <section className={styles.group}>
            <label className={styles.groupLabel}>Normal round difficulty (9×9)</label>
            <Segmented<Difficulty>
              options={DIFFICULTIES}
              value={settings.normalDifficulty}
              onChange={v => patch({ normalDifficulty: v })}
              render={diffLabel}
            />
          </section>
        )}

        <section className={styles.group}>
          <label className={styles.groupLabel}>Normal round time</label>
          <Segmented<number>
            options={NORMAL_TIMES}
            value={settings.normalSeconds}
            onChange={v => patch({ normalSeconds: v })}
            render={v => `${v}s`}
          />
        </section>

        <section className={styles.group}>
          <label className={styles.groupLabel}>9×9 bonus round</label>
          <Segmented<number>
            options={BONUS_FREQS.map(f => f.value)}
            value={settings.bonusEvery}
            onChange={v => patch({ bonusEvery: v })}
            render={v => BONUS_FREQS.find(f => f.value === v)?.label ?? String(v)}
          />
          <p className={styles.hint}>How often a 9×9 bonus round appears.</p>
        </section>

        {settings.bonusEvery > 0 && (
          <>
            <section className={styles.group}>
              <label className={styles.groupLabel}>Bonus round time</label>
              <Segmented<number>
                options={BONUS_TIMES}
                value={settings.bonusSeconds}
                onChange={v => patch({ bonusSeconds: v })}
                render={v => `${v}s`}
              />
            </section>
            <section className={styles.group}>
              <label className={styles.groupLabel}>Bonus round difficulty</label>
              <Segmented<Difficulty>
                options={DIFFICULTIES}
                value={settings.bonusDifficulty}
                onChange={v => patch({ bonusDifficulty: v })}
                render={diffLabel}
              />
            </section>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.primaryBtn} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>
        <p className={styles.footnote}>
          These settings are shared — both players always play the same challenge.
        </p>
      </main>
    </div>
  );
}
