'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import styles from '../blitz.module.css';

/* ─────────────────────── types ─────────────────────── */
type BoardN = (number | null)[][];

interface PlayerState {
  cells: BoardN | null;
  submitted: boolean;
  score: number;
  ready: boolean;
}

interface RoomState {
  roomId: string;
  status: 'waiting' | 'playing' | 'round_end' | 'match_end';
  currentRound: number;
  boardSize: number;
  isBonus: boolean;
  matchNumber: number;
  roundInMatch: number;
  roundsPerMatch: number;
  puzzle: BoardN | null;
  solution: BoardN | null;
  roundDuration: number;
  timeLeft: number;
  roundStartedAt: string | null;
  players: Record<string, PlayerState>;
  scores: Record<string, { total_score: number; wins: number; losses: number }>;
  updatedAt: string;
}

interface AuthUser {
  username: string;
  total_score: number;
  wins: number;
  losses: number;
}

const PLAYERS = ['Edin', 'Begus'] as const;
const POLL_MS_PLAY  = 800;
const POLL_MS_LOBBY = 2000;

/* ─────────────────────── helpers ─────────────────────── */
const boxDim = (size: number) => (size === 9 ? 3 : 2);

function emptyBoard(size: number): BoardN {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function buildDisplay(puzzle: BoardN, userCells: BoardN): BoardN {
  return puzzle.map((row, r) =>
    row.map((val, c) => (val !== null ? val : userCells[r]?.[c] ?? null))
  );
}

function isGiven(puzzle: BoardN, r: number, c: number): boolean {
  return puzzle[r]?.[c] !== null && puzzle[r]?.[c] !== undefined;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function isBonusNext(round: number): boolean {
  return (round + 1) % 10 === 0;
}

/* ─────────────────────── API calls ─────────────────────── */
async function apiAuth(username: string, password: string): Promise<AuthUser | string> {
  try {
    const res = await fetch('/api/blitz/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return data.error || 'Login failed';
    return data as AuthUser;
  } catch { return 'Network error'; }
}

async function apiGetRoom(): Promise<RoomState | null> {
  try {
    const res = await fetch('/api/blitz/room', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function apiAction(action: string, username: string, cells?: BoardN): Promise<RoomState | null> {
  try {
    const res = await fetch('/api/blitz/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, username, cells }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function apiReset(): Promise<RoomState | null> {
  try {
    const res = await fetch('/api/blitz/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', username: 'admin' }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/* ─────────────────────── LoginScreen ─────────────────────── */
function LoginScreen({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Select a player and enter your password'); return; }
    setLoading(true);
    setError('');
    const result = await apiAuth(username.trim(), password);
    setLoading(false);
    if (typeof result === 'string') { setError(result); return; }
    onLogin(result);
  };

  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>
          <span className={styles.loginIcon}>⚡</span>
          <h1 className={styles.loginTitle}>Blitz Sudoku</h1>
          <p className={styles.loginSub}>1v1 · Real-time · 4×4 Blitz</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Who are you?</label>
            <div className={styles.playerBtns}>
              {PLAYERS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.playerBtn} ${username === p ? styles.playerBtnActive : ''}`}
                  onClick={() => setUsername(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.loginError}>{error}</p>}

          <button className={styles.loginBtn} type="submit" disabled={loading}>
            {loading ? <span className={styles.spinner} /> : 'Sign In →'}
          </button>
        </form>

        <Link href="/" className={styles.backLink}>← Back to menu</Link>
      </div>
    </div>
  );
}

/* ─────────────────────── TimerBar ─────────────────────── */
function TimerBar({ total, left }: { total: number; left: number }) {
  const pct     = Math.max(0, Math.min(100, (left / total) * 100));
  const urgent  = left <= 15;
  const warning = left <= 30;
  return (
    <div className={styles.timerWrap}>
      <span className={`${styles.timerNum} ${urgent ? styles.timerUrgent : ''}`}>{fmt(left)}</span>
      <div className={styles.timerTrack}>
        <div
          className={[
            styles.timerFill,
            urgent ? styles.timerFillUrgent : warning ? styles.timerFillWarning : '',
          ].filter(Boolean).join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────── ScoreBar ─────────────────────── */
function ScoreBar({
  me, opponent, room,
}: {
  me: string; opponent: string; room: RoomState;
}) {
  const myScore  = room.scores[me]?.total_score  ?? 0;
  const oppScore = room.scores[opponent]?.total_score ?? 0;
  const myWins   = room.scores[me]?.wins  ?? 0;
  const oppWins  = room.scores[opponent]?.wins ?? 0;
  const leading  = myScore > oppScore ? 'me' : myScore < oppScore ? 'opp' : 'tie';

  return (
    <div className={styles.scoreBar}>
      <div className={`${styles.scorePlayer} ${styles.scoreMe}`}>
        <span className={styles.scoreName}>{me}</span>
        <span className={`${styles.scoreVal} ${leading === 'me' ? styles.scoreLeading : ''}`}>{myScore}</span>
        <span className={styles.scoreWins}>{myWins}W</span>
      </div>
      <div className={styles.scoreCenter}>
        <span className={styles.scoreVs}>VS</span>
        {room.currentRound > 0 && (
          <span className={styles.roundPill}>R{room.currentRound}</span>
        )}
      </div>
      <div className={`${styles.scorePlayer} ${styles.scoreOpp}`}>
        <span className={styles.scoreWins}>{oppWins}W</span>
        <span className={`${styles.scoreVal} ${leading === 'opp' ? styles.scoreLeading : ''}`}>{oppScore}</span>
        <span className={styles.scoreName}>{opponent}</span>
      </div>
    </div>
  );
}

/* ─────────────────────── Board ─────────────────────── */
function Board({
  puzzle, userCells, selected, onCell, submitted, size,
}: {
  puzzle: BoardN;
  userCells: BoardN;
  selected: [number, number] | null;
  onCell: (r: number, c: number) => void;
  submitted: boolean;
  size: number;
}) {
  const display = buildDisplay(puzzle, userCells);
  const bd = boxDim(size);

  return (
    <div
      className={`${styles.board} ${size === 9 ? styles.board9 : ''}`}
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}
    >
      {display.map((row, r) =>
        row.map((val, c) => {
          const given    = isGiven(puzzle, r, c);
          const isSel    = selected?.[0] === r && selected?.[1] === c;
          const selVal   = selected ? display[selected[0]][selected[1]] : null;
          const isRelated = selected
            ? (r === selected[0] || c === selected[1] ||
               (Math.floor(r / bd) === Math.floor(selected[0] / bd) &&
                Math.floor(c / bd) === Math.floor(selected[1] / bd)))
            : false;
          const isSameNum = !isSel && !!selVal && val === selVal;
          const boxRight  = c % bd === bd - 1 && c !== size - 1;
          const boxBottom = r % bd === bd - 1 && r !== size - 1;

          return (
            <div
              key={`${r}-${c}`}
              className={[
                styles.cell,
                given        ? styles.cellGiven    : '',
                isSel        ? styles.cellSelected : '',
                isRelated && !isSel ? styles.cellRelated : '',
                isSameNum    ? styles.cellSameNum  : '',
                boxRight     ? styles.boxBorderR   : '',
                boxBottom    ? styles.boxBorderB   : '',
                submitted    ? styles.cellSubmitted: '',
              ].filter(Boolean).join(' ')}
              onClick={() => !submitted && !given && onCell(r, c)}
            >
              {val ?? ''}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ─────────────────────── MiniBoard ─────────────────────── */
function MiniBoard({ cells, puzzle, size }: { cells: BoardN | null; puzzle: BoardN; size: number }) {
  const display = cells ? buildDisplay(puzzle, cells) : puzzle;
  const bd = boxDim(size);
  const px = size === 9 ? 16 : 30;
  return (
    <div
      className={styles.miniBoard}
      style={{ gridTemplateColumns: `repeat(${size}, ${px}px)`, gridTemplateRows: `repeat(${size}, ${px}px)` }}
    >
      {display.map((row, r) =>
        row.map((val, c) => {
          const given = isGiven(puzzle, r, c);
          return (
            <div
              key={`${r}-${c}`}
              className={[
                styles.miniCell,
                given    ? styles.miniGiven : '',
                c % bd === bd - 1 && c !== size - 1 ? styles.miniBoxR : '',
                r % bd === bd - 1 && r !== size - 1 ? styles.miniBoxB : '',
              ].filter(Boolean).join(' ')}
              style={{ width: px, height: px, fontSize: size === 9 ? '0.6rem' : '0.78rem' }}
            >
              {val ?? ''}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ═══════════════════ MAIN PAGE ═══════════════════ */
export default function BlitzPage() {
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [room, setRoom]           = useState<RoomState | null>(null);
  const [userCells, setUserCells] = useState<BoardN>(emptyBoard(4));
  const [selected, setSelected]   = useState<[number, number] | null>(null);
  const [localTime, setLocalTime] = useState(90);
  const [prevRound, setPrevRound] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const pollRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const cellsRef = useRef<BoardN>(emptyBoard(4));

  const size     = room?.boardSize ?? 4;
  const opponent = user ? PLAYERS.find(p => p !== user.username) ?? '' : '';

  /* keep cellsRef in sync with state */
  useEffect(() => { cellsRef.current = userCells; }, [userCells]);

  /* ── poll loop ── */
  const poll = useCallback(async () => {
    const data = await apiGetRoom();
    if (data) setRoom(data);
    const delay = data?.status === 'playing' ? POLL_MS_PLAY : POLL_MS_LOBBY;
    pollRef.current = setTimeout(poll, delay);
  }, []);

  useEffect(() => {
    if (!user) return;
    poll();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [user, poll]);

  /* ── local countdown ── */
  useEffect(() => {
    if (!room) return;
    if (room.status === 'playing') {
      setLocalTime(room.timeLeft);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setLocalTime(prev => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.roundStartedAt]);

  /* ── new round detected → reset local board ── */
  useEffect(() => {
    if (!room || !user) return;
    if (room.status === 'playing' && room.currentRound !== prevRound) {
      setPrevRound(room.currentRound);
      setSelected(null);
      const blank = emptyBoard(room.boardSize);
      setUserCells(blank);
      cellsRef.current = blank;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.currentRound, room?.status]);

  /* ── debounced cell sync ── */
  const scheduleCellSync = useCallback((cells: BoardN) => {
    if (syncRef.current) clearTimeout(syncRef.current);
    syncRef.current = setTimeout(async () => {
      if (user && room?.status === 'playing') {
        await apiAction('update_cells', user.username, cells);
      }
    }, 600);
  }, [user, room?.status]);

  /* ── cell tap ── */
  const handleCellTap = (r: number, c: number) => {
    if (!room?.puzzle || room.status !== 'playing') return;
    if (isGiven(room.puzzle, r, c)) return;
    if (room.players[user!.username]?.submitted) return;
    setSelected([r, c]);
  };

  /* ── number entry ── */
  const handleNum = useCallback((n: number) => {
    if (!selected || !room?.puzzle || room.status !== 'playing') return;
    if (n > room.boardSize) return;
    if (room.players[user!.username]?.submitted) return;
    const [r, c] = selected;
    if (isGiven(room.puzzle, r, c)) return;
    setUserCells(prev => {
      const next = prev.map(row => [...row]) as BoardN;
      next[r][c] = n;
      scheduleCellSync(next);
      return next;
    });
  }, [selected, room, user, scheduleCellSync]);

  /* ── erase ── */
  const handleErase = useCallback(() => {
    if (!selected || !room?.puzzle || room.status !== 'playing') return;
    if (room.players[user!.username]?.submitted) return;
    const [r, c] = selected;
    if (isGiven(room.puzzle, r, c)) return;
    setUserCells(prev => {
      const next = prev.map(row => [...row]) as BoardN;
      next[r][c] = null;
      scheduleCellSync(next);
      return next;
    });
  }, [selected, room, user, scheduleCellSync]);

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!user || !room || room.status !== 'playing') return;
    if (room.players[user.username]?.submitted) return;
    setSubmitting(true);
    const data = await apiAction('submit', user.username, cellsRef.current);
    if (data) setRoom(data);
    setSubmitting(false);
  };

  /* ── skip (9×9 bonus only) ── */
  const handleSkip = async () => {
    if (!user || !room || room.status !== 'playing' || !room.isBonus) return;
    if (room.players[user.username]?.submitted) return;
    setSubmitting(true);
    const data = await apiAction('skip', user.username);
    if (data) setRoom(data);
    setSubmitting(false);
  };

  /* ── ready ── */
  const handleReady = async () => {
    if (!user) return;
    const data = await apiAction('ready', user.username);
    if (data) setRoom(data);
  };

  /* ── keyboard (desktop support) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const max = room?.boardSize ?? 4;
      if (e.key >= '1' && e.key <= '9') {
        const n = parseInt(e.key);
        if (n <= max) handleNum(n);
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') handleErase();
      if (!selected || !room?.puzzle) return;
      const [r, c] = selected;
      if (e.key === 'ArrowUp'    && r > 0)        { e.preventDefault(); setSelected([r-1, c]); }
      if (e.key === 'ArrowDown'  && r < max - 1)  { e.preventDefault(); setSelected([r+1, c]); }
      if (e.key === 'ArrowLeft'  && c > 0)        { e.preventDefault(); setSelected([r, c-1]); }
      if (e.key === 'ArrowRight' && c < max - 1)  { e.preventDefault(); setSelected([r, c+1]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNum, handleErase, selected, room]);

  /* ──────────── render ──────────── */
  if (!user) return <LoginScreen onLogin={setUser} />;

  if (!room) {
    return (
      <div className={styles.loading}>
        <span className={styles.spinner} />
        <span>Connecting…</span>
      </div>
    );
  }

  const myState      = room.players[user.username];
  const oppState     = room.players[opponent];
  const mySubmitted  = !!myState?.submitted;
  const oppSubmitted = !!oppState?.submitted;
  const myReady      = !!myState?.ready;
  const oppReady     = !!oppState?.ready;

  const isWaiting  = room.status === 'waiting';
  const isPlaying  = room.status === 'playing';
  const isRoundEnd = room.status === 'round_end';
  const isMatchEnd = room.status === 'match_end';

  const myRoundScore  = myState?.score  ?? 0;
  const oppRoundScore = oppState?.score ?? 0;
  const iWon   = myRoundScore > oppRoundScore;
  const isDraw = myRoundScore === oppRoundScore;
  const nextBonus = isBonusNext(room.currentRound);

  return (
    <div className={styles.app}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.homeBtn} title="Menu">‹</Link>
          <span className={styles.bolt}>⚡</span>
          <span className={styles.appName}>Blitz Sudoku</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerUser}>{user.username}</span>
          <button
            className={styles.menuBtn}
            onClick={() => setShowReset(v => !v)}
            title="Options"
          >⋯</button>
          <button className={styles.logoutBtn} onClick={() => { setUser(null); setRoom(null); }} title="Sign out">✕</button>
        </div>
      </header>

      {/* ── Reset confirm ── */}
      {showReset && (
        <div className={styles.resetBanner}>
          <span>Reset all scores &amp; rounds?</span>
          <button
            className={styles.resetConfirmBtn}
            onClick={async () => {
              const d = await apiReset();
              if (d) setRoom(d);
              setShowReset(false);
            }}
          >Reset</button>
          <button className={styles.resetCancelBtn} onClick={() => setShowReset(false)}>Cancel</button>
        </div>
      )}

      {/* ── Score bar ── */}
      <ScoreBar me={user.username} opponent={opponent} room={room} />

      {/* ══ WAITING LOBBY ══ */}
      {isWaiting && (
        <div className={styles.lobby}>
          <div className={styles.lobbyCard}>
            <div className={styles.lobbyBadge}>⚡ BLITZ</div>
            <div className={styles.lobbyTitle}>Waiting Room</div>
            <div className={styles.lobbyRound}>
              {room.currentRound === 0 ? 'First match!' : `After round ${room.currentRound}`}
            </div>

            <div className={styles.lobbyPlayers}>
              {PLAYERS.map(p => {
                const isMe = p === user.username;
                const ready = isMe ? myReady : oppReady;
                return (
                  <div key={p} className={`${styles.lobbyPlayer} ${ready ? styles.lobbyPlayerReady : ''}`}>
                    <span className={styles.lobbyDot}>{ready ? '✓' : '○'}</span>
                    <span className={styles.lobbyName}>{p} {isMe ? '(you)' : ''}</span>
                    <span className={styles.lobbyStatus}>{ready ? 'Ready' : 'Waiting…'}</span>
                  </div>
                );
              })}
            </div>

            <p className={styles.lobbyHint}>
              {nextBonus ? '★ Next round is a 9×9 BONUS!' : 'Both players tap Ready to start the round'}
            </p>

            <button
              className={`${styles.readyBtn} ${myReady ? styles.readyBtnDone : ''}`}
              onClick={handleReady}
              disabled={myReady}
            >
              {myReady ? '✓ You\'re Ready!' : 'Ready to Play ⚡'}
            </button>
          </div>
        </div>
      )}

      {/* ══ PLAYING ══ */}
      {isPlaying && room.puzzle && (
        <div className={styles.playArea}>
          <TimerBar total={room.roundDuration} left={localTime} />

          <div className={styles.playTopRow}>
            <div className={`${styles.roundBadge} ${room.isBonus ? styles.bonusBadge : ''}`}>
              {room.isBonus ? `★ 9×9 Bonus · R${room.currentRound}` : `Round ${room.currentRound}`}
            </div>
            <div className={styles.opponentStatus}>
              <span className={styles.opponentLabel}>{opponent}</span>
              <span className={`${styles.oppStatusDot} ${oppSubmitted ? styles.oppDone : styles.oppActive}`} />
              <span className={styles.oppStatusText}>{oppSubmitted ? 'Submitted ✓' : 'Playing…'}</span>
            </div>
          </div>

          {/* Opponent mini-board */}
          <div className={styles.opponentRow}>
            <MiniBoard cells={oppState?.cells ?? null} puzzle={room.puzzle} size={size} />
          </div>

          {/* Main board */}
          <Board
            puzzle={room.puzzle}
            userCells={userCells}
            selected={mySubmitted ? null : selected}
            onCell={handleCellTap}
            submitted={mySubmitted}
            size={size}
          />

          {/* Numpad */}
          {!mySubmitted && (
            <div className={styles.numpad}>
              {Array.from({ length: size }, (_, i) => i + 1).map(n => (
                <button key={n} className={styles.numBtn} onClick={() => handleNum(n)}>
                  {n}
                </button>
              ))}
              <button className={`${styles.numBtn} ${styles.eraseBtn}`} onClick={handleErase}>
                ⌫
              </button>
            </div>
          )}

          {/* Submit / skip / waiting */}
          {!mySubmitted ? (
            <div className={styles.actionStack}>
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? <><span className={styles.spinner} /> Submitting…</>
                  : 'Submit Answer ⚡'
                }
              </button>
              {room.isBonus && (
                <button className={styles.skipBtn} onClick={handleSkip} disabled={submitting}>
                  Skip bonus (forfeit points)
                </button>
              )}
            </div>
          ) : (
            <div className={styles.waitingOpponent}>
              {oppSubmitted
                ? <span className={styles.bothDone}>Both done! Calculating…</span>
                : <><span className={styles.spinner} /><span>Waiting for {opponent}…</span></>
              }
            </div>
          )}
        </div>
      )}

      {/* ══ ROUND END / MATCH END ══ */}
      {(isRoundEnd || isMatchEnd) && (
        <div className={styles.roundEnd}>
          <div className={styles.roundEndCard}>
            <div className={styles.roundEndEmoji}>
              {isDraw ? '🤝' : iWon ? '🏆' : '😤'}
            </div>
            <div className={`${styles.roundEndTitle} ${iWon ? styles.titleWin : isDraw ? styles.titleDraw : styles.titleLoss}`}>
              {isMatchEnd
                ? (isDraw ? 'Match drawn!' : iWon ? 'You won the match!' : `${opponent} won the match!`)
                : (isDraw ? "It's a draw!" : iWon ? 'You won this round!' : `${opponent} wins this round!`)}
            </div>

            {isMatchEnd && (
              <div className={styles.matchTag}>Match {room.matchNumber} complete · {room.roundsPerMatch} rounds</div>
            )}

            <div className={styles.roundScores}>
              <div className={`${styles.rScore} ${iWon ? styles.rScoreWin : ''}`}>
                <span className={styles.rName}>{user.username}</span>
                <span className={styles.rPoints}>{myRoundScore}</span>
                <span className={styles.rPts}>pts</span>
              </div>
              <div className={styles.rDivider}>vs</div>
              <div className={`${styles.rScore} ${!iWon && !isDraw ? styles.rScoreWin : ''}`}>
                <span className={styles.rName}>{opponent}</span>
                <span className={styles.rPoints}>{oppRoundScore}</span>
                <span className={styles.rPts}>pts</span>
              </div>
            </div>

            {myRoundScore === 0 && !isDraw && (
              <p className={styles.scoreHint}>No points this round</p>
            )}
            {myRoundScore > 100 && (
              <p className={styles.scoreHint}>Base {room.isBonus ? 200 : 100} + speed bonus 🚀</p>
            )}

            {/* Head-to-head rounds won */}
            <div className={styles.totalScores}>
              <span className={styles.totalLabel}>Rounds won</span>
              <span className={styles.totalEntry}>
                {user.username}: <strong>{room.scores[user.username]?.wins ?? 0}</strong>
              </span>
              <span className={styles.totalSep}>·</span>
              <span className={styles.totalEntry}>
                {opponent}: <strong>{room.scores[opponent]?.wins ?? 0}</strong>
              </span>
            </div>

            <div className={styles.totalScores}>
              <span className={styles.totalLabel}>Total</span>
              <span className={styles.totalEntry}>
                {user.username}: <strong>{room.scores[user.username]?.total_score ?? 0}</strong>
              </span>
              <span className={styles.totalSep}>·</span>
              <span className={styles.totalEntry}>
                {opponent}: <strong>{room.scores[opponent]?.total_score ?? 0}</strong>
              </span>
            </div>

            {nextBonus && (
              <p className={styles.lobbyHint}>★ Next round is a 9×9 BONUS!</p>
            )}

            <button
              className={`${styles.readyBtn} ${myReady ? styles.readyBtnDone : ''}`}
              onClick={handleReady}
              disabled={myReady}
            >
              {myReady
                ? (isMatchEnd ? '✓ Ready for next match!' : '✓ Ready for next round!')
                : (isMatchEnd ? 'Next Match ⚡' : 'Next Round ⚡')}
            </button>
            {oppReady && !myReady && (
              <p className={styles.lobbyHint}>{opponent} is ready — waiting for you!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
