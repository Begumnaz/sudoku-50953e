import Link from 'next/link';
import styles from './shell.module.css';

export default function HomePage() {
  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <span className={styles.heroIcon}>⚡</span>
        <h1 className={styles.heroTitle}>Blitz Sudoku</h1>
        <p className={styles.heroSub}>Edin · vs · Begus</p>
      </header>

      <nav className={styles.menu}>
        <Link href="/practice" className={`${styles.tile} ${styles.tilePractice}`}>
          <span className={styles.tileIcon}>🧩</span>
          <span className={styles.tileBody}>
            <span className={styles.tileTitle}>Practice</span>
            <span className={styles.tileSub}>Classic 9×9 · Easy → Hard · solo</span>
          </span>
          <span className={styles.tileArrow}>›</span>
        </Link>

        <Link href="/blitz" className={`${styles.tile} ${styles.tileBlitz}`}>
          <span className={styles.tileIcon}>⚡</span>
          <span className={styles.tileBody}>
            <span className={styles.tileTitle}>Blitz</span>
            <span className={styles.tileSub}>Real-time 1v1 · 4×4 · 9×9 bonus rounds</span>
          </span>
          <span className={styles.tileArrow}>›</span>
        </Link>

        <Link href="/stats" className={`${styles.tile} ${styles.tileStats}`}>
          <span className={styles.tileIcon}>🏆</span>
          <span className={styles.tileBody}>
            <span className={styles.tileTitle}>Stats</span>
            <span className={styles.tileSub}>Head-to-head rounds won &amp; totals</span>
          </span>
          <span className={styles.tileArrow}>›</span>
        </Link>
      </nav>

      <footer className={styles.footer}>
        Private 2-player Sudoku · portrait, mobile-first
      </footer>
    </div>
  );
}
