import { allLegalMoves, inCheck } from './chess-move-generation.js';

export function getGameEnd(state) {
  const moves = allLegalMoves(state, state.turn);
  if (moves.length) return { over: false, moves };
  return { over: true, checkmate: inCheck(state, state.turn), color: state.turn };
}

export function markGameOverIfNeeded(state) {
  const result = getGameEnd(state);
  if (result.over) state.gameOver = true;
  return result;
}

export const checkGameEnd = markGameOverIfNeeded;
