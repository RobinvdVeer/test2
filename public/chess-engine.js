import { colorOf as getColorOf, createGameState as createInitialGameState, enemy as getEnemy } from './chess-state.js';

export { makeMove } from './chess-move-application.js';
export { allLegalMoves, inCheck, legalMovesFor, pseudoMovesFor } from './chess-move-generation.js';
export { checkGameEnd, getGameEnd, markGameOverIfNeeded } from './chess-game-end.js';

export function createGameState() { return createInitialGameState(); }
export function colorOf(piece) { return getColorOf(piece); }
export function enemy(color) { return getEnemy(color); }
