// Puzzle — a generated Sudoku grid and its unique solution.
// Shared by Practice mode (9×9) and Blitz mode (4×4 + the 9×9 bonus round).

export type Cell = number | null;

/** A square grid of cells; null = blank. */
export type Grid = Cell[][];

/** Supported board sizes. 4 = 2×2 boxes, 6 = 2×3 boxes, 9 = 3×3 boxes. */
export type PuzzleSize = 4 | 6 | 9;

/** Practice-mode difficulty levels (9×9 only). */
export type Difficulty = 'extra-easy' | 'easy' | 'medium' | 'hard';

export interface Puzzle {
  size: PuzzleSize;
  /** Givens — null cells are to be filled by the player. */
  puzzle: Grid;
  /** The full, unique solution. */
  solution: Grid;
  /** Only meaningful for 9×9 puzzles. */
  difficulty?: Difficulty;
}

/** Box dimensions (rows × cols) for a board size. 4×4 = 2×2, 6×6 = 2×3
 *  (2 tall, 3 wide), 9×9 = 3×3. Boxes are not always square, so callers must
 *  use rows for vertical grouping and cols for horizontal. */
export function boxDims(size: PuzzleSize): { rows: number; cols: number } {
  if (size === 9) return { rows: 3, cols: 3 };
  if (size === 6) return { rows: 2, cols: 3 };
  return { rows: 2, cols: 2 };
}
