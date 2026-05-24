import { allLegalMoves, makeMove } from './public/chess-engine.js';

export function makeBadBotMove(state) {
  const moves = allLegalMoves(state, 'b');
  if (!moves.length) return false;

  // Bad bot: heavily prefers random pawn moves, otherwise random chaos.
  const pawnMoves = moves.filter(m => state.board[m.from.r][m.from.c].toLowerCase() === 'p');
  const pool = pawnMoves.length && Math.random() < 0.7 ? pawnMoves : moves;
  makeMove(state, pool[Math.floor(Math.random() * pool.length)]);
  return true;
}
