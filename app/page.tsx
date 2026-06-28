'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { generatePuzzle, isBoardComplete, Board, Difficulty } from '@/lib/sudoku';
import styles from './sudoku.module.css';

type CellState = {
  value: number | null;
  given: boolean;
  error: boolean;
};

function buildCellStates(puzzle: Board, solution: Board): CellState[][] {
  return puzzle.map((row, r) =>
    row.map((val, c) => ({
      value: val,
      given: val !== null,
      error: false,
    }))
  );
}

export default function SudokuPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [solution, setSolution] = useState<Board>([]);
  const [cells, setCells] = useState<CellState[][]>([]);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [won, setWon] = useState(false);
  const [peekCooldown, setPeekCooldown] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const newGame = useCallback((diff: Difficulty = difficulty) => {
    const { puzzle, solution } = generatePuzzle(diff);
    setSolution(solution);
    setCells(buildCellStates(puzzle, solution));
    setSelected(null);
    setPeeking(false);
    setWon(false);
    setPeekCooldown(false);
    if (peekTimer.current) clearTimeout(peekTimer.current);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
  }, [difficulty]);

  useEffect(() => {
    newGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    newGame(d);
  };

  const handleCellClick = (r: number, c: number) => {
    if (won) return;
    setSelected([r, c]);
  };

  const handleNumber = useCallback((num: number) => {
    if (!selected || won) return;
    const [r, c] = selected;
    if (cells[r][c].given) return;

    setCells(prev => {
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      next[r][c].value = num;
      next[r][c].error = false; // no red highlighting — learn at your own pace
      return next;
    });
  }, [selected, won, cells, solution]);

  const handleErase = useCallback(() => {
    if (!selected || won) return;
    const [r, c] = selected;
    if (cells[r][c].given) return;
    setCells(prev => {
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      next[r][c].value = null;
      next[r][c].error = false;
      return next;
    });
  }, [selected, won, cells]);

  // Check win after every cell update
  useEffect(() => {
    if (cells.length === 0 || solution.length === 0) return;
    const board: Board = cells.map(row => row.map(c => c.value));
    if (isBoardComplete(board, solution)) setWon(true);
  }, [cells, solution]);

  // Keyboard input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') handleNumber(parseInt(e.key));
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') handleErase();
      if (!selected) return;
      const [r, c] = selected;
      if (e.key === 'ArrowUp' && r > 0) setSelected([r - 1, c]);
      if (e.key === 'ArrowDown' && r < 8) setSelected([r + 1, c]);
      if (e.key === 'ArrowLeft' && c > 0) setSelected([r, c - 1]);
      if (e.key === 'ArrowRight' && c < 8) setSelected([r, c + 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNumber, handleErase, selected]);

  const handlePeek = () => {
    if (peeking || peekCooldown || won) return;
    setPeeking(true);
    setPeekCooldown(true);
    peekTimer.current = setTimeout(() => setPeeking(false), 2000);
    cooldownTimer.current = setTimeout(() => setPeekCooldown(false), 8000);
  };

  const getHighlight = (r: number, c: number): string => {
    if (!selected) return '';
    const [sr, sc] = selected;
    if (r === sr && c === sc) return 'selected';
    const sameBox =
      Math.floor(r / 3) === Math.floor(sr / 3) &&
      Math.floor(c / 3) === Math.floor(sc / 3);
    if (r === sr || c === sc || sameBox) return 'related';
    // Same number highlight
    const selVal = cells[sr][sc].value;
    if (selVal && cells[r][c].value === selVal) return 'samenum';
    return '';
  };

  const selectedValue = selected ? cells[selected[0]]?.[selected[1]]?.value : null;

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⬛</span>
          <span>Sudoku</span>
        </div>
        <p className={styles.tagline}>Classic 9×9 · Fill in the grid · One number per cell</p>
      </header>

      <main className={styles.main}>
        {/* Controls top */}
        <div className={styles.topControls}>
          <div className={styles.diffRow}>
            {(['extra-easy', 'easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                className={`${styles.diffBtn} ${difficulty === d ? styles.diffActive : ''}`}
                onClick={() => handleDifficulty(d)}
              >
                {d === 'extra-easy' ? '★ Easy' : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <button className={styles.newBtn} onClick={() => newGame()}>
            <span>↺</span> New Puzzle
          </button>
        </div>

        {/* Board */}
        <div className={styles.boardWrapper}>
          {won && (
            <div className={styles.wonOverlay}>
              <div className={styles.wonCard}>
                <div className={styles.wonEmoji}>🎉</div>
                <div className={styles.wonTitle}>Puzzle Solved!</div>
                <div className={styles.wonSub}>Brilliant work. Ready for another?</div>
                <button className={styles.wonBtn} onClick={() => newGame()}>New Puzzle</button>
              </div>
            </div>
          )}

          <div className={styles.board} role="grid" aria-label="Sudoku board">
            {cells.map((row, r) =>
              row.map((cell, c) => {
                const hl = getHighlight(r, c);
                const isPeekCell = peeking && !cell.given && !cell.value;
                const displayVal = isPeekCell ? solution[r][c] : cell.value;
                const isGiven = cell.given;
                const isError = cell.error && !peeking;

                return (
                  <div
                    key={`${r}-${c}`}
                    role="gridcell"
                    aria-selected={hl === 'selected'}
                    className={[
                      styles.cell,
                      hl === 'selected' ? styles.cellSelected : '',
                      hl === 'related' ? styles.cellRelated : '',
                      hl === 'samenum' ? styles.cellSameNum : '',
                      isGiven ? styles.cellGiven : '',
                      isError ? styles.cellError : '',
                      isPeekCell ? styles.cellPeek : '',
                      c % 3 === 2 && c !== 8 ? styles.boxBorderRight : '',
                      r % 3 === 2 && r !== 8 ? styles.boxBorderBottom : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleCellClick(r, c)}
                  >
                    {displayVal ?? ''}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Number pad */}
        <div className={styles.numpad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
            const isActive = selectedValue === n;
            return (
              <button
                key={n}
                className={`${styles.numBtn} ${isActive ? styles.numActive : ''}`}
                onClick={() => handleNumber(n)}
                aria-label={`Enter ${n}`}
              >
                {n}
              </button>
            );
          })}
          <button
            className={`${styles.numBtn} ${styles.eraseBtn}`}
            onClick={handleErase}
            aria-label="Erase cell"
          >
            ⌫
          </button>
        </div>

        {/* Action row */}
        <div className={styles.actionRow}>
          <button
            className={`${styles.peekBtn} ${peeking ? styles.peekActive : ''} ${peekCooldown && !peeking ? styles.peekCooldown : ''}`}
            onClick={handlePeek}
            disabled={peekCooldown || won}
          >
            {peeking ? (
              <><span className={styles.peekIcon}>👁</span> Peeking…</>
            ) : peekCooldown ? (
              <><span className={styles.peekIcon}>⏳</span> Cooldown…</>
            ) : (
              <><span className={styles.peekIcon}>👁</span> Peek Answer (2s)</>
            )}
          </button>
        </div>

        {/* Instructions */}
        <div className={styles.instructions}>
          <span>Click a cell, then tap a number</span>
          <span className={styles.dot}>·</span>
          <span>Keyboard arrows &amp; 1–9 work too</span>
          <span className={styles.dot}>·</span>
          <span>★ Easy = great for practice</span>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>Classic Sudoku · Every puzzle has exactly one solution</span>
      </footer>
    </div>
  );
}
