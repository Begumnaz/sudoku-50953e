'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../shell.module.css';

const PLAYERS = ['Edin', 'Begus'] as const;

interface Stat { total_score: number; wins: number; losses: number }
type Scores = Record<string, Stat>;

const ZERO: Stat = { total_score: 0, wins: 0, losses: 0 };

export default function StatsPage() {
  const [scores, setScores] = useState<Scores | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/blitz/room', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setScores(data.scores ?? {});
        } else {
          setScores({});
        }
      } catch {
        setScores({});
      }
    })();
  }, []);

  const [edin, begus] = [scores?.['Edin'] ?? ZERO, scores?.['Begus'] ?? ZERO];
  const edinLead  = edin.wins > begus.wins;
  const begusLead = begus.wins > edin.wins;

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <Link href="/" className={styles.backChev}>‹</Link>
        <span className={styles.topTitle}>Head-to-head</span>
      </div>

      {!scores ? (
        <div className={styles.loadingRow}>Loading stats…</div>
      ) : (
        <>
          <div className={styles.h2h}>
            <div className={`${styles.h2hCol} ${edinLead ? styles.h2hLead : ''}`}>
              <span className={styles.h2hName}>Edin</span>
              <span className={styles.h2hWins}>{edin.wins}</span>
              <span className={styles.h2hWinsLabel}>rounds won</span>
            </div>
            <span className={styles.h2hVs}>VS</span>
            <div className={`${styles.h2hCol} ${begusLead ? styles.h2hLead : ''}`}>
              <span className={styles.h2hName}>Begus</span>
              <span className={styles.h2hWins}>{begus.wins}</span>
              <span className={styles.h2hWinsLabel}>rounds won</span>
            </div>
          </div>

          <div className={styles.statRows}>
            <div className={styles.statRow}>
              <span className={styles.me}>{edin.total_score}</span>
              <span className={styles.lbl}>Total points</span>
              <span className={styles.opp}>{begus.total_score}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.me}>{edin.wins}</span>
              <span className={styles.lbl}>Rounds won</span>
              <span className={styles.opp}>{begus.wins}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.me}>{edin.losses}</span>
              <span className={styles.lbl}>Rounds lost</span>
              <span className={styles.opp}>{begus.losses}</span>
            </div>
          </div>
        </>
      )}

      <footer className={styles.footer}>
        Stats persist across every session on the shared backend.
      </footer>
    </div>
  );
}
