// 6×6 Sudoku generator & validator
// Boxes are 2 rows × 3 cols (2 tall, 3 wide). Numbers 1-6.

export type Board6 = (number | null)[][];

const BOX_ROWS = 2;
const BOX_COLS = 3;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid6(board: number[][], row: number, col: number, num: number): boolean {
  if (board[row].includes(num)) return false;
  for (let r = 0; r < 6; r++) if (board[r][col] === num) return false;
  const boxRow = Math.floor(row / BOX_ROWS) * BOX_ROWS;
  const boxCol = Math.floor(col / BOX_COLS) * BOX_COLS;
  for (let r = boxRow; r < boxRow + BOX_ROWS; r++)
    for (let c = boxCol; c < boxCol + BOX_COLS; c++)
      if (board[r][c] === num) return false;
  return true;
}

function fillBoard6(board: number[][]): boolean {
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      if (board[row][col] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6]);
        for (const num of nums) {
          if (isValid6(board, row, col, num)) {
            board[row][col] = num;
            if (fillBoard6(board)) return true;
            board[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function countSolutions6(board: number[][], limit = 2): number {
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      if (board[row][col] === 0) {
        let count = 0;
        for (let num = 1; num <= 6; num++) {
          if (isValid6(board, row, col, num)) {
            board[row][col] = num;
            count += countSolutions6(board, limit - count);
            board[row][col] = 0;
            if (count >= limit) return count;
          }
        }
        return count;
      }
    }
  }
  return 1;
}

/** Generate a 6×6 puzzle. clues = how many cells to reveal (16-20 typical). */
export function generate6x6(clues = 18): { puzzle: Board6; solution: Board6 } {
  const solGrid: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
  fillBoard6(solGrid);
  const solution: Board6 = solGrid.map(row => [...row]);

  const puzzle: number[][] = solGrid.map(row => [...row]);
  const positions = shuffle(Array.from({ length: 36 }, (_, i) => i));
  let cluesLeft = 36;

  for (const pos of positions) {
    if (cluesLeft <= clues) break;
    const row = Math.floor(pos / 6);
    const col = pos % 6;
    const backup = puzzle[row][col];
    puzzle[row][col] = 0;
    const copy = puzzle.map(r => [...r]);
    if (countSolutions6(copy) !== 1) {
      puzzle[row][col] = backup;
    } else {
      cluesLeft--;
    }
  }

  return {
    puzzle: puzzle.map(row => row.map(v => (v === 0 ? null : v))),
    solution,
  };
}

export function isComplete6(cells: Board6, solution: Board6): boolean {
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++)
      if (cells[r][c] !== solution[r][c]) return false;
  return true;
}
