const ALLOWED_PIECES = new Set('.KQRBNPkqrbnp');
const MAX_PLAYER_NAME_LENGTH = 80;
const MAX_TIMER_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizePersistedState(value) {
  if (!value || typeof value !== 'object') return null;
  const game = normalizeGameState(value.game);
  if (!game) return null;
  return { game, app: normalizeAppState(value.app) };
}

function normalizeGameState(game) {
  if (!game || typeof game !== 'object') return null;
  const board = normalizeBoard(game.board);
  if (!board || !['w', 'b'].includes(game.turn)) return null;
  const castling = normalizeCastling(game.castling);
  if (!castling || typeof game.gameOver !== 'boolean') return null;
  const selected = normalizeSquareOrNull(game.selected);
  const enPassant = normalizeSquareOrNull(game.enPassant);
  if (selected === undefined || enPassant === undefined) return null;
  const legalForSelected = normalizeMoves(game.legalForSelected);
  if (!legalForSelected) return null;
  return { board, turn: game.turn, selected, legalForSelected, enPassant, castling, gameOver: game.gameOver };
}

function normalizeBoard(board) {
  if (!Array.isArray(board) || board.length !== 8) return null;
  const normalized = [];
  for (const row of board) {
    const cells = typeof row === 'string' ? row.split('') : row;
    if (!Array.isArray(cells) || cells.length !== 8 || !cells.every(piece => typeof piece === 'string' && piece.length === 1 && ALLOWED_PIECES.has(piece))) return null;
    normalized.push(cells.slice());
  }
  return normalized;
}

function normalizeCastling(castling) {
  if (!castling || typeof castling !== 'object') return null;
  const flags = ['K', 'Q', 'k', 'q'];
  if (!flags.every(flag => typeof castling[flag] === 'boolean')) return null;
  return Object.fromEntries(flags.map(flag => [flag, castling[flag]]));
}

function normalizeSquareOrNull(square) {
  if (square === null || square === undefined) return null;
  return isValidSquare(square) ? { r: square.r, c: square.c } : undefined;
}

function normalizeMoves(moves) {
  if (moves === undefined) return [];
  if (!Array.isArray(moves) || moves.length > 256) return null;
  const normalized = [];
  for (const move of moves) {
    if (!move || typeof move !== 'object' || !isValidSquare(move.from) || !isValidSquare(move.to)) return null;
    const next = { from: { r: move.from.r, c: move.from.c }, to: { r: move.to.r, c: move.to.c } };
    if (typeof move.promotion === 'string' && ALLOWED_PIECES.has(move.promotion)) next.promotion = move.promotion;
    if (typeof move.doublePawn === 'boolean') next.doublePawn = move.doublePawn;
    if (typeof move.enPassant === 'boolean') next.enPassant = move.enPassant;
    if (move.castle === 'k' || move.castle === 'q') next.castle = move.castle;
    normalized.push(next);
  }
  return normalized;
}

function isValidSquare(square) {
  return square && Number.isInteger(square.r) && Number.isInteger(square.c) && square.r >= 0 && square.r < 8 && square.c >= 0 && square.c < 8;
}

function normalizeAppState(app) {
  const source = app && typeof app === 'object' ? app : {};
  const playerName = typeof source.playerName === 'string' ? source.playerName.slice(0, MAX_PLAYER_NAME_LENGTH) : '';
  const score = Number.isFinite(source.score) ? Math.max(-999, Math.min(999, source.score)) : 0;
  const timer = normalizeTimer(source.timer);
  const settings = { chaos: typeof source.settings?.chaos === 'boolean' ? source.settings.chaos : true };
  return { playerName, score, timer, settings };
}

function normalizeTimer(timer) {
  if (!timer || typeof timer !== 'object') return { elapsedMs: 0, startedAt: Date.now() };
  const elapsedMs = Number.isFinite(timer.elapsedMs) ? Math.max(0, Math.min(MAX_TIMER_MS, timer.elapsedMs)) : 0;
  const startedAt = Number.isFinite(timer.startedAt) && timer.startedAt >= 0 && timer.startedAt <= Date.now() + 60 * 1000 ? timer.startedAt : null;
  return { elapsedMs, startedAt };
}
