import { allLegalMoves, makeMove } from './chess-engine.js';

export function makeBadBotMove(state, { pawnMoveBias = 0.7 } = {}) {
  const moves = allLegalMoves(state, 'b');
  if (!moves.length) return false;

  // Bad bot: heavily prefers random pawn moves, otherwise random chaos.
  const pawnMoves = moves.filter(m => state.board[m.from.r][m.from.c].toLowerCase() === 'p');
  const pool = pawnMoves.length && Math.random() < pawnMoveBias ? pawnMoves : moves;
  makeMove(state, pool[Math.floor(Math.random() * pool.length)]);
  return true;
}
