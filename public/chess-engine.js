const START = [
  'rnbqkbnr', 'pppppppp', '........', '........',
  '........', '........', 'PPPPPPPP', 'RNBQKBNR'
];

const KNIGHT_DIRS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const QUEEN_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];
const KING_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export function createGameState() {
  return {
    board: START.map(row => row.split('')),
    turn: 'w',
    enPassant: null,
    castling: { K: true, Q: true, k: true, q: true },
    gameOver: false
  };
}

export function colorOf(p) {
  if (!p || p === '.') return null;
  return p === p.toUpperCase() ? 'w' : 'b';
}

export function enemy(c) { return c === 'w' ? 'b' : 'w'; }
export function inCheck(state, color) { return isInCheck(state.board, color); }

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function pieceAt(state, r, c) { return state.board[r][c]; }
function cloneBoard(board) { return board.map(row => row.slice()); }

export function allLegalMoves(state, color) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (colorOf(pieceAt(state, r, c)) === color) out.push(...legalMovesFor(state, r, c));
  }
  return out;
}

export function legalMovesFor(state, r, c) {
  const color = colorOf(pieceAt(state, r, c));
  return pseudoMovesFor(state, r, c).filter(m => {
    const undo = applyMoveTo(state.board, m);
    const legal = !isInCheck(state.board, color);
    undoMove(state.board, undo);
    return legal;
  });
}

export function pseudoMovesFor(state, r, c) {
  const p = pieceAt(state, r, c);
  const color = colorOf(p);
  if (!color) return [];

  switch (p.toLowerCase()) {
    case 'p': return pawnMoves(state, r, c, color);
    case 'n': return steppedMoves(state, r, c, color, KNIGHT_DIRS);
    case 'b': return slidingMoves(state, r, c, color, BISHOP_DIRS);
    case 'r': return slidingMoves(state, r, c, color, ROOK_DIRS);
    case 'q': return slidingMoves(state, r, c, color, QUEEN_DIRS);
    case 'k': return kingMoves(state, r, c, color);
    default: return [];
  }
}

function createMove(r, c, rr, cc, extra = {}) {
  return { from: { r, c }, to: { r: rr, c: cc }, ...extra };
}

function canMoveTo(state, color, r, c) {
  return inBounds(r, c) && colorOf(pieceAt(state, r, c)) !== color;
}

function steppedMoves(state, r, c, color, dirs) {
  return dirs
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([rr, cc]) => canMoveTo(state, color, rr, cc))
    .map(([rr, cc]) => createMove(r, c, rr, cc));
}

function slidingMoves(state, r, c, color, dirs) {
  const moves = [];
  for (const [dr, dc] of dirs) {
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc)) {
      if (pieceAt(state, rr, cc) === '.') moves.push(createMove(r, c, rr, cc));
      else {
        if (colorOf(pieceAt(state, rr, cc)) !== color) moves.push(createMove(r, c, rr, cc));
        break;
      }
      rr += dr; cc += dc;
    }
  }
  return moves;
}

function pawnMoves(state, r, c, color) {
  const moves = [];
  const dir = color === 'w' ? -1 : 1;
  const startRow = color === 'w' ? 6 : 1;
  const promoteRow = color === 'w' ? 0 : 7;
  const promotion = color === 'w' ? 'Q' : 'q';
  const maybePromotion = rr => rr === promoteRow ? { promotion } : {};

  if (inBounds(r + dir, c) && pieceAt(state, r + dir, c) === '.') {
    moves.push(createMove(r, c, r + dir, c, maybePromotion(r + dir)));
    if (r === startRow && pieceAt(state, r + 2 * dir, c) === '.') moves.push(createMove(r, c, r + 2 * dir, c, { doublePawn: true }));
  }

  for (const dc of [-1, 1]) {
    const rr = r + dir, cc = c + dc;
    if (!inBounds(rr, cc)) continue;
    if (pieceAt(state, rr, cc) !== '.' && colorOf(pieceAt(state, rr, cc)) !== color) moves.push(createMove(r, c, rr, cc, maybePromotion(rr)));
    if (state.enPassant && state.enPassant.r === rr && state.enPassant.c === cc) moves.push(createMove(r, c, rr, cc, { enPassant: true }));
  }

  return moves;
}

function kingMoves(state, r, c, color) {
  const moves = steppedMoves(state, r, c, color, KING_DIRS);
  if (isInCheck(state.board, color)) return moves;

  const home = homeRow(color);
  if (!kingIsOnHomeSquare(r, c, home)) return moves;

  if (canCastleKingSide(state, color, home)) moves.push(createMove(r, c, home, 6, { castle: 'k' }));
  if (canCastleQueenSide(state, color, home)) moves.push(createMove(r, c, home, 2, { castle: 'q' }));
  return moves;
}

function homeRow(color) { return color === 'w' ? 7 : 0; }
function kingIsOnHomeSquare(r, c, home) { return r === home && c === 4; }
function rookFor(color) { return color === 'w' ? 'R' : 'r'; }
function castlingFlag(color, side) { return color === 'w' ? side.toUpperCase() : side; }

function canCastleKingSide(state, color, home) {
  const attackedBy = enemy(color);
  return state.castling[castlingFlag(color, 'k')]
    && pieceAt(state, home, 7) === rookFor(color)
    && squaresEmpty(state, home, [5, 6])
    && squaresNotAttacked(state.board, home, [5, 6], attackedBy);
}

function canCastleQueenSide(state, color, home) {
  const attackedBy = enemy(color);
  return state.castling[castlingFlag(color, 'q')]
    && pieceAt(state, home, 0) === rookFor(color)
    && squaresEmpty(state, home, [1, 2, 3])
    && squaresNotAttacked(state.board, home, [3, 2], attackedBy);
}

function squaresEmpty(state, r, columns) {
  return columns.every(c => pieceAt(state, r, c) === '.');
}

function squaresNotAttacked(board, r, columns, byColor) {
  return columns.every(c => !squareAttacked(board, r, c, byColor));
}

export function makeMove(state, move) {
  const p = pieceAt(state, move.from.r, move.from.c);
  updateCastlingRights(state.castling, move, p);
  applyMoveTo(state.board, move);
  state.enPassant = move.doublePawn ? { r: (move.from.r + move.to.r) / 2, c: move.from.c } : null;
}

function applyMoveTo(board, move) {
  const p = board[move.from.r][move.from.c];
  board[move.from.r][move.from.c] = '.';
  if (move.enPassant) board[move.from.r][move.to.c] = '.';
  board[move.to.r][move.to.c] = move.promotion || p;
  if (move.castle === 'k') moveRookForCastle(board, move.to.r, 7, 5);
  if (move.castle === 'q') moveRookForCastle(board, move.to.r, 0, 3);
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

function isInCheck(board, color) {
  let king = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === (color === 'w' ? 'K' : 'k')) king = { r, c };
  return king ? squareAttacked(board, king.r, king.c, enemy(color)) : true;
}

function squareAttacked(board, r, c, byColor) {
  for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
    const p = board[rr][cc];
    if (colorOf(p) !== byColor) continue;
    if (attacksSquare(board, rr, cc, r, c)) return true;
  }
  return false;
}

function attacksSquare(board, r, c, tr, tc) {
  const p = board[r][c].toLowerCase();
  const col = colorOf(board[r][c]);
  const dr = tr - r, dc = tc - c;
  if (p === 'p') return pawnAttacksDelta(col, dr, dc);
  if (p === 'n') return knightAttacksDelta(dr, dc);
  if (p === 'k') return kingAttacksDelta(dr, dc);
  if (canAttackDiagonally(p, dr, dc) && pathClear(board, r, c, tr, tc, Math.sign(dr), Math.sign(dc))) return true;
  if (canAttackOrthogonally(p, dr, dc) && pathClear(board, r, c, tr, tc, Math.sign(dr), Math.sign(dc))) return true;
  return false;
}

function pawnAttacksDelta(color, dr, dc) {
  return dr === (color === 'w' ? -1 : 1) && Math.abs(dc) === 1;
}

function knightAttacksDelta(dr, dc) {
  return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
}

function kingAttacksDelta(dr, dc) {
  return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
}

function canAttackDiagonally(piece, dr, dc) {
  return (piece === 'b' || piece === 'q') && Math.abs(dr) === Math.abs(dc);
}

function canAttackOrthogonally(piece, dr, dc) {
  return (piece === 'r' || piece === 'q') && (dr === 0 || dc === 0);
}

function pathClear(board, r, c, tr, tc, sr, sc) {
  let rr = r + sr, cc = c + sc;
  while (rr !== tr || cc !== tc) {
    if (board[rr][cc] !== '.') return false;
    rr += sr; cc += sc;
  }
  return true;
}

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
