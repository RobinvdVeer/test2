import { allLegalMoves, makeMove } from './chess-engine.js';

export function chooseBadBotMove(state, { pawnBias, pawnMoveBias = 0.7, random = Math.random, moves = allLegalMoves(state, 'b') } = {}) {
  if (!moves.length) return null;

  // Bad bot: heavily prefers random pawn moves, otherwise random chaos.
  const bias = pawnBias ?? pawnMoveBias;
  const pawnMoves = moves.filter(m => state.board[m.from.r][m.from.c].toLowerCase() === 'p');
  const pool = pawnMoves.length && random() < bias ? pawnMoves : moves;
  return pool[Math.floor(random() * pool.length)];
}

export function makeBadBotMove(state, options) {
  const move = chooseBadBotMove(state, options);
  if (!move) return false;
  makeMove(state, move);
  return true;
}
