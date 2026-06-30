// 4×4 Sudoku generator & validator
// Boxes are 2×2. Numbers 1-4.

export type Board4 = (number | null)[][];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid4(board: number[][], row: number, col: number, num: number): boolean {
  if (board[row].includes(num)) return false;
  for (let r = 0; r < 4; r++) if (board[r][col] === num) return false;
  const boxRow = Math.floor(row / 2) * 2;
  const boxCol = Math.floor(col / 2) * 2;
  for (let r = boxRow; r < boxRow + 2; r++)
    for (let c = boxCol; c < boxCol + 2; c++)
      if (board[r][c] === num) return false;
  return true;
}

function fillBoard4(board: number[][]): boolean {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (board[row][col] === 0) {
        const nums = shuffle([1, 2, 3, 4]);
        for (const num of nums) {
          if (isValid4(board, row, col, num)) {
            board[row][col] = num;
            if (fillBoard4(board)) return true;
            board[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function countSolutions4(board: number[][], limit = 2): number {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (board[row][col] === 0) {
        let count = 0;
        for (let num = 1; num <= 4; num++) {
          if (isValid4(board, row, col, num)) {
            board[row][col] = num;
            count += countSolutions4(board, limit - count);
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

/** Generate a 4x4 puzzle. clues = how many cells to reveal (6-10 typical). */
export function generate4x4(clues = 8): { puzzle: Board4; solution: Board4 } {
  const solGrid: number[][] = Array.from({ length: 4 }, () => Array(4).fill(0));
  fillBoard4(solGrid);
  const solution: Board4 = solGrid.map(row => [...row]);

  const puzzle: number[][] = solGrid.map(row => [...row]);
  const positions = shuffle(Array.from({ length: 16 }, (_, i) => i));
  let cluesLeft = 16;

  for (const pos of positions) {
    if (cluesLeft <= clues) break;
    const row = Math.floor(pos / 4);
    const col = pos % 4;
    const backup = puzzle[row][col];
    puzzle[row][col] = 0;
    const copy = puzzle.map(r => [...r]);
    if (countSolutions4(copy) !== 1) {
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

export function isComplete4(cells: Board4, solution: Board4): boolean {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (cells[r][c] !== solution[r][c]) return false;
  return true;
}
