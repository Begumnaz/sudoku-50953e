// Puzzle — a generated Sudoku grid and its unique solution.
// Shared by Practice mode (9×9) and Blitz mode (4×4 + the 9×9 bonus round).

export type Cell = number | null;

/** A square grid of cells; null = blank. */
export type Grid = Cell[][];

/** Supported board sizes. 4 = 2×2 boxes, 9 = 3×3 boxes. */
export type PuzzleSize = 4 | 9;

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

/** Box dimension for a board size (2 for 4×4, 3 for 9×9). */
export function boxDim(size: PuzzleSize): number {
  return size === 9 ? 3 : 2;
}
