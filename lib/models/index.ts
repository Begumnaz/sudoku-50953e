// Core data models for Blitz Sudoku. One file per model:
//   Puzzle — a generated grid + solution (4×4 or 9×9)
//   Player — a fixed Blitz player (mirrors blitz_users)
//   Round  — one cumulative round + the round/board math
//   Match  — a 2-round group derived from the round counter
//   Score  — round scoring rules and constants
//   Settings — admin-tunable challenge knobs (board size, timers, bonus)
//   Powerup  — per-round powerups (grant, effects, metadata)

export * from './Puzzle';
export * from './Player';
export * from './Round';
export * from './Match';
export * from './Score';
export * from './Settings';
export * from './Powerup';
