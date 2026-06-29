'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { generatePuzzle, isBoardComplete, Board, Difficulty } from '@/lib/sudoku';
import styles from './sudoku.module.css';

type CellState = {
  value: number | null;
  given: boolean;
  error: boolean;
};

function buildCellStates(puzzle: Board): CellState[][] {
  return puzzle.map(row =>
    row.map(val => ({ value: val, given: val !== null, error: false }))
  );
}

/* ── persistence helpers ── */
async function loadState(diff: Difficulty) {
  try {
    const res = await fetch(`/api/state?difficulty=${diff}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function saveState(payload: {
  difficulty: Difficulty;
  puzzle: Board;
  solution: Board;
  cells: CellState[][];
  selected: [number, number] | null;
  won: boolean;
}) {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { /* offline — ignore */ }
}

export default function SudokuPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [puzzle, setPuzzle]         = useState<Board>([]);
  const [solution, setSolution]     = useState<Board>([]);
  const [cells, setCells]           = useState<CellState[][]>([]);
  const [selected, setSelected]     = useState<[number, number] | null>(null);
  const [peeking, setPeeking]       = useState(false);
  const [won, setWon]               = useState(false);
  const [peekCooldown, setPeekCooldown] = useState(false);
  const [loading, setLoading]       = useState(true);

  const peekTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce save so we don't hammer the DB on every keystroke
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── debounced save ── */
  const scheduleSave = useCallback((
    diff: Difficulty,
    puz: Board,
    sol: Board,
    cls: CellState[][],
    sel: [number, number] | null,
    isWon: boolean,
  ) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState({ difficulty: diff, puzzle: puz, solution: sol, cells: cls, selected: sel, won: isWon });
    }, 400);
  }, []);

  /* ── start a fresh game (ignores any saved state) ── */
  const newGame = useCallback((diff: Difficulty) => {
    const { puzzle: puz, solution: sol } = generatePuzzle(diff);
    const cls = buildCellStates(puz);
    setPuzzle(puz);
    setSolution(sol);
    setCells(cls);
    setSelected(null);
    setPeeking(false);
    setWon(false);
    setPeekCooldown(false);
    if (peekTimer.current) clearTimeout(peekTimer.current);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    scheduleSave(diff, puz, sol, cls, null, false);
  }, [scheduleSave]);

  /* ── load saved state or start new on mount ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await loadState('easy');
      if (data?.found) {
        setPuzzle(data.puzzle);
        setSolution(data.solution);
        setCells(data.cells);
        setSelected(data.selected ?? null);
        setWon(data.won ?? false);
      } else {
        const { puzzle: puz, solution: sol } = generatePuzzle('easy');
        const cls = buildCellStates(puz);
        setPuzzle(puz);
        setSolution(sol);
        setCells(cls);
        saveState({ difficulty: 'easy', puzzle: puz, solution: sol, cells: cls, selected: null, won: false });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── switch difficulty: restore saved game or start new ── */
  const handleDifficulty = useCallback(async (d: Difficulty) => {
    if (d === difficulty) return;
    setDifficulty(d);
    setLoading(true);
    const data = await loadState(d);
    if (data?.found) {
      setPuzzle(data.puzzle);
      setSolution(data.solution);
      setCells(data.cells);
      setSelected(data.selected ?? null);
      setWon(data.won ?? false);
      setPeeking(false);
      setPeekCooldown(false);
    } else {
      newGame(d);
    }
    setLoading(false);
  }, [difficulty, newGame]);

  /* ── cell click ── */
  const handleCellClick = (r: number, c: number) => {
    if (won) return;
    setSelected([r, c]);
  };

  /* ── enter number ── */
  const handleNumber = useCallback((num: number) => {
    if (!selected || won) return;
    const [r, c] = selected;
    setCells(prev => {
      if (prev[r][c].given) return prev;
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      next[r][c].value = num;
      scheduleSave(difficulty, puzzle, solution, next, selected, won);
      return next;
    });
  }, [selected, won, difficulty, puzzle, solution, scheduleSave]);

  /* ── erase ── */
  const handleErase = useCallback(() => {
    if (!selected || won) return;
    const [r, c] = selected;
    setCells(prev => {
      if (prev[r][c].given) return prev;
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      next[r][c].value = null;
      next[r][c].error = false;
      scheduleSave(difficulty, puzzle, solution, next, selected, won);
      return next;
    });
  }, [selected, won, difficulty, puzzle, solution, scheduleSave]);

  /* ── win detection ── */
  useEffect(() => {
    if (cells.length === 0 || solution.length === 0) return;
    const board: Board = cells.map(row => row.map(c => c.value));
    if (isBoardComplete(board, solution)) {
      setWon(true);
      scheduleSave(difficulty, puzzle, solution, cells, selected, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  /* ── save when selection changes ── */
  useEffect(() => {
    if (cells.length === 0 || loading) return;
    scheduleSave(difficulty, puzzle, solution, cells, selected, won);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /* ── keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') handleNumber(parseInt(e.key));
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') handleErase();
      if (!selected) return;
      const [r, c] = selected;
      if (e.key === 'ArrowUp'    && r > 0) setSelected([r - 1, c]);
      if (e.key === 'ArrowDown'  && r < 8) setSelected([r + 1, c]);
      if (e.key === 'ArrowLeft'  && c > 0) setSelected([r, c - 1]);
      if (e.key === 'ArrowRight' && c < 8) setSelected([r, c + 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNumber, handleErase, selected]);

  /* ── peek ── */
  const handlePeek = () => {
    if (peeking || peekCooldown || won) return;
    setPeeking(true);
    setPeekCooldown(true);
    peekTimer.current    = setTimeout(() => setPeeking(false), 2000);
    cooldownTimer.current = setTimeout(() => setPeekCooldown(false), 8000);
  };

  /* ── highlight logic ── */
  const getHighlight = (r: number, c: number): string => {
    if (!selected) return '';
    const [sr, sc] = selected;
    if (r === sr && c === sc) return 'selected';
    const sameBox =
      Math.floor(r / 3) === Math.floor(sr / 3) &&
      Math.floor(c / 3) === Math.floor(sc / 3);
    if (r === sr || c === sc || sameBox) return 'related';
    const selVal = cells[sr][sc].value;
    if (selVal && cells[r][c].value === selVal) return 'samenum';
    return '';
  };

  const selectedValue = selected ? cells[selected[0]]?.[selected[1]]?.value : null;

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className={styles.page}>
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
          <button className={styles.newBtn} onClick={() => newGame(difficulty)}>
            <span>↺</span> New Puzzle
          </button>
        </div>

        {/* Board */}
        <div className={styles.boardWrapper}>
          {/* Loading overlay */}
          {loading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner} />
            </div>
          )}

          {won && !loading && (
            <div className={styles.wonOverlay}>
              <div className={styles.wonCard}>
                <div className={styles.wonEmoji}>🎉</div>
                <div className={styles.wonTitle}>Puzzle Solved!</div>
                <div className={styles.wonSub}>Brilliant work. Ready for another?</div>
                <button className={styles.wonBtn} onClick={() => newGame(difficulty)}>New Puzzle</button>
              </div>
            </div>
          )}

          <div
            className={`${styles.board} ${loading ? styles.boardLoading : ''}`}
            role="grid"
            aria-label="Sudoku board"
          >
            {cells.map((row, r) =>
              row.map((cell, c) => {
                const hl = getHighlight(r, c);
                const isPeekCell  = peeking && !cell.given && !cell.value;
                const displayVal  = isPeekCell ? solution[r]?.[c] : cell.value;

                return (
                  <div
                    key={`${r}-${c}`}
                    role="gridcell"
                    aria-selected={hl === 'selected'}
                    className={[
                      styles.cell,
                      hl === 'selected' ? styles.cellSelected  : '',
                      hl === 'related'  ? styles.cellRelated   : '',
                      hl === 'samenum'  ? styles.cellSameNum   : '',
                      cell.given        ? styles.cellGiven      : '',
                      isPeekCell        ? styles.cellPeek       : '',
                      c % 3 === 2 && c !== 8 ? styles.boxBorderRight  : '',
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
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button
              key={n}
              className={`${styles.numBtn} ${selectedValue === n ? styles.numActive : ''}`}
              onClick={() => handleNumber(n)}
              aria-label={`Enter ${n}`}
            >
              {n}
            </button>
          ))}
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
          <span>Progress saved automatically</span>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>Classic Sudoku · Every puzzle has exactly one solution</span>
      </footer>
    </div>
  );
}
