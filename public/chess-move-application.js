import { pieceAt } from './chess-state.js';

export function makeMove(state, move) {
  const p = pieceAt(state, move.from.r, move.from.c);
  updateCastlingRights(state.castling, move, p);
  applyMoveTo(state.board, move);
  state.enPassant = move.doublePawn ? { r: (move.from.r + move.to.r) / 2, c: move.from.c } : null;
}

export function applyMoveTo(board, move) {
  const p = board[move.from.r][move.from.c];
  const undo = {
    move,
    piece: p,
    captured: board[move.to.r][move.to.c],
    enPassantCaptured: move.enPassant ? board[move.from.r][move.to.c] : null
  };

  board[move.from.r][move.from.c] = '.';
  if (move.enPassant) board[move.from.r][move.to.c] = '.';
  board[move.to.r][move.to.c] = move.promotion || p;
  if (move.castle === 'k') moveRookForCastle(board, move.to.r, 7, 5);
  if (move.castle === 'q') moveRookForCastle(board, move.to.r, 0, 3);
  return undo;
}

export function undoMove(board, undo) {
  const { move } = undo;
  board[move.from.r][move.from.c] = undo.piece;
  board[move.to.r][move.to.c] = undo.captured;
  if (move.enPassant) board[move.from.r][move.to.c] = undo.enPassantCaptured;
  if (move.castle === 'k') moveRookForCastle(board, move.to.r, 5, 7);
  if (move.castle === 'q') moveRookForCastle(board, move.to.r, 3, 0);
}

function moveRookForCastle(board, row, fromC, toC) {
  board[row][toC] = board[row][fromC];
  board[row][fromC] = '.';
}

function updateCastlingRights(castling, move, p) {
  revokeRightsForMovedKing(castling, p);
  revokeRightsForMovedRook(castling, move, p);
  revokeRightsForCapturedCornerRook(castling, move);
}

function revokeRightsForMovedKing(castling, p) {
  if (p === 'K') castling.K = castling.Q = false;
  if (p === 'k') castling.k = castling.q = false;
}

function revokeRightsForMovedRook(castling, move, p) {
  if (p === 'R' && isSquare(move.from, 7, 0)) castling.Q = false;
  if (p === 'R' && isSquare(move.from, 7, 7)) castling.K = false;
  if (p === 'r' && isSquare(move.from, 0, 0)) castling.q = false;
  if (p === 'r' && isSquare(move.from, 0, 7)) castling.k = false;
}

function revokeRightsForCapturedCornerRook(castling, move) {
  if (isSquare(move.to, 7, 0)) castling.Q = false;
  if (isSquare(move.to, 7, 7)) castling.K = false;
  if (isSquare(move.to, 0, 0)) castling.q = false;
  if (isSquare(move.to, 0, 7)) castling.k = false;
}

function isSquare(square, r, c) {
  return square.r === r && square.c === c;
}
