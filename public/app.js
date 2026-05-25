import { createDomBoardView } from './board-view.js';
import { createGameController } from './game-controller.js';
import { createDebuggableGameController } from './game-controller-debug.js';
import { defaultAppState, calculateScore, currentTimer, elapsedMs, formatDuration } from './game-metrics.js';
import { clearPersistedState, loadPersistedState, savePersistedState } from './game-persistence.js';
import { playBadNoise } from './audio.js';

// Configuration knobs for maintainers who want to tune the badness without spelunking.
const GLITCH_PROBABILITY = 0.08;
const GLITCH_MAX_OFFSET_PX = 6;
const GLITCH_MAX_ROTATION_DEG = 4;
const BOT_PAWN_MOVE_BIAS = 0.7;
const BOT_MIN_DELAY_MS = 550;
const BOT_MAX_DELAY_MS = 1250;
const ALLOWED_PIECES = new Set('.KQRBNPkqrbnp');
const MAX_PLAYER_NAME_LENGTH = 80;
const MAX_TIMER_MS = 30 * 24 * 60 * 60 * 1000;

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const chaosEl = document.getElementById('chaos');
const playerNameEl = document.getElementById('playerName');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const resetSavedGameEl = document.getElementById('resetSavedGame');

let controller;
let restoredState = loadSafePersistedState();
let appState = restoredState?.app || defaultAppState();
let isRestoring = false;
let lastPersistedPayload = null;

if (chaosEl && appState.settings && typeof appState.settings.chaos === 'boolean') chaosEl.checked = appState.settings.chaos;
if (playerNameEl) playerNameEl.value = appState.playerName || '';

const view = createDomBoardView({
  boardEl,
  statusEl,
  documentRef: document,
  onSquareClick: (r, c) => controller.selectSquare(r, c),
  glitch: {
    probability: GLITCH_PROBABILITY,
    maxOffsetPx: GLITCH_MAX_OFFSET_PX,
    maxRotationDeg: GLITCH_MAX_ROTATION_DEG
  }
});

const controllerOptions = {
  view,
  chaosEnabled: () => Boolean(chaosEl?.checked),
  onStateChange: () => {
    if (!isRestoring) persistState();
  },
  config: {
    pawnMoveBias: BOT_PAWN_MOVE_BIAS,
    botMinDelayMs: BOT_MIN_DELAY_MS,
    botMaxDelayMs: BOT_MAX_DELAY_MS
  }
};

if (window.__BAD_CHESS_ENABLE_TEST_HOOKS__) {
  const session = createDebuggableGameController(controllerOptions);
  controller = session.controller;
  window.__badChess = session.debugApi;
} else {
  controller = createGameController(controllerOptions);
}

window.BadChess = { newGame: controller.newGame, resetSavedGame };

if (restoredState?.game) {
  isRestoring = true;
  controller.setState(restoredState.game);
  isRestoring = false;
  renderAppState();
  if (restoredState.game.turn === 'b' && !restoredState.game.gameOver) {
    controller.botMove?.();
  }
} else {
  controller.newGame();
}

document.getElementById('newGame').addEventListener('click', () => {
  appState = defaultAppState({ playerName: playerNameEl?.value || appState.playerName || '' });
  controller.newGame();
  persistState();
});
document.getElementById('noiseBtn').addEventListener('click', playBadNoise);
chaosEl.addEventListener('change', () => {
  appState.settings.chaos = Boolean(chaosEl.checked);
  controller.render();
});
playerNameEl?.addEventListener('input', () => {
  appState.playerName = playerNameEl.value;
  persistState();
});
resetSavedGameEl?.addEventListener('click', resetSavedGame);
window.addEventListener?.('beforeunload', persistState);

function persistState() {
  if (!controller?.getState) return;
  const game = controller.getState();
  appState.playerName = playerNameEl?.value || appState.playerName || '';
  appState.settings = { ...appState.settings, chaos: Boolean(chaosEl?.checked) };
  appState.score = calculateScore(game.board);
  appState.timer = nextTimer(game.gameOver);
  renderAppState();

  const payload = JSON.stringify({ game, app: appState });
  if (payload === lastPersistedPayload) return;
  lastPersistedPayload = payload;
  savePersistedState({ game, app: appState });
}

function loadSafePersistedState() {
  const persisted = normalizePersistedState(loadPersistedState());
  if (!persisted) clearPersistedState();
  return persisted;
}

function normalizePersistedState(value) {
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

function resetSavedGame() {
  clearPersistedState();
  lastPersistedPayload = null;
  appState = defaultAppState({ playerName: playerNameEl?.value || '' });
  isRestoring = true;
  controller.newGame();
  isRestoring = false;
  renderAppState();
}

function nextTimer(paused = false) {
  return currentTimer(appState.timer || { elapsedMs: 0, startedAt: Date.now() }, paused);
}

function renderAppState() {
  if (scoreEl) scoreEl.textContent = String(appState.score ?? 0);
  if (timerEl) timerEl.textContent = formatDuration(elapsedMs(appState.timer || { elapsedMs: 0 }));
}

