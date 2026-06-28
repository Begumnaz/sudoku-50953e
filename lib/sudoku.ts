export type Board = (number | null)[][];

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid(board: number[][], row: number, col: number, num: number): boolean {
  // Row check
  if (board[row].includes(num)) return false;
  // Col check
  for (let r = 0; r < 9; r++) if (board[r][col] === num) return false;
  // Box check
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++)
    for (let c = boxCol; c < boxCol + 3; c++)
      if (board[r][c] === num) return false;
  return true;
}

/** Fills an empty board with a valid complete solution using backtracking + randomisation */
function fillBoard(board: number[][]): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const num of nums) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (fillBoard(board)) return true;
            board[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

/** Count solutions (capped at 2 for efficiency) */
function countSolutions(board: number[][], limit = 2): number {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        let count = 0;
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            count += countSolutions(board, limit - count);
            board[row][col] = 0;
            if (count >= limit) return count;
          }
        }
        return count;
      }
    }
  }
  return 1; // fully filled = 1 solution
}

export type Difficulty = 'easy' | 'medium' | 'hard';

const CLUES: Record<Difficulty, number> = {
  easy: 36,
  medium: 28,
  hard: 22,
};

/** Generate a puzzle with a unique solution */
export function generatePuzzle(difficulty: Difficulty = 'medium'): { puzzle: Board; solution: Board } {
  // Build complete solution
  const solGrid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillBoard(solGrid);

  const solution: Board = solGrid.map(row => [...row]);

  // Remove cells while keeping unique solution
  const puzzle: number[][] = solGrid.map(row => [...row]);
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
  const targetClues = CLUES[difficulty];
  let cluesLeft = 81;

  for (const pos of positions) {
    if (cluesLeft <= targetClues) break;
    const row = Math.floor(pos / 9);
    const col = pos % 9;
    const backup = puzzle[row][col];
    puzzle[row][col] = 0;
    // Check uniqueness
    const copy = puzzle.map(r => [...r]);
    if (countSolutions(copy) !== 1) {
      puzzle[row][col] = backup; // restore
    } else {
      cluesLeft--;
    }
  }

  return {
    puzzle: puzzle.map(row => row.map(v => (v === 0 ? null : v))),
    solution,
  };
}

export function isBoardComplete(puzzle: Board, solution: Board): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c] !== solution[r][c]) return false;
  return true;
}
