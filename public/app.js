import { createDomBoardView } from './board-view.js';
import { createGameController } from './game-controller.js';
import { createDebuggableGameController } from './game-controller-debug.js';
import { playBadNoise } from './audio.js';

// Configuration knobs for maintainers who want to tune the badness without spelunking.
const GLITCH_PROBABILITY = 0.08;
const GLITCH_MAX_OFFSET_PX = 6;
const GLITCH_MAX_ROTATION_DEG = 4;
const BOT_PAWN_MOVE_BIAS = 0.7;
const BOT_MIN_DELAY_MS = 550;
const BOT_MAX_DELAY_MS = 1250;
const STORAGE_KEY = 'bad-chess-2000:game-state:v1';

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const chaosEl = document.getElementById('chaos');
const playerNameEl = document.getElementById('playerName');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const resetSavedGameEl = document.getElementById('resetSavedGame');

let controller;
let restoredState = loadPersistedState();
let appState = restoredState?.app || defaultAppState();
let isRestoring = false;

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
  persistState();
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

function defaultAppState(overrides = {}) {
  return {
    playerName: '',
    score: 0,
    timer: { elapsedMs: 0, startedAt: Date.now() },
    settings: { chaos: true },
    ...overrides
  };
}

function persistState() {
  if (!controller?.getState) return;
  const game = controller.getState();
  appState.playerName = playerNameEl?.value || appState.playerName || '';
  appState.settings = { ...appState.settings, chaos: Boolean(chaosEl?.checked) };
  appState.score = calculateScore(game.board);
  appState.timer = currentTimer(game.gameOver);
  renderAppState();
  safeLocalStorageSet(STORAGE_KEY, JSON.stringify({ game, app: appState }));
}

function loadPersistedState() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function resetSavedGame() {
  safeLocalStorageRemove(STORAGE_KEY);
  appState = defaultAppState({ playerName: playerNameEl?.value || '' });
  controller.newGame();
  persistState();
}

function currentTimer(paused = false) {
  const previous = appState.timer || { elapsedMs: 0, startedAt: Date.now() };
  if (paused) return { elapsedMs: elapsedMs(previous), startedAt: null };
  return { elapsedMs: elapsedMs(previous), startedAt: Date.now() };
}

function elapsedMs(timer) {
  return (timer.elapsedMs || 0) + (timer.startedAt ? Date.now() - timer.startedAt : 0);
}

function renderAppState() {
  if (scoreEl) scoreEl.textContent = String(appState.score ?? 0);
  if (timerEl) timerEl.textContent = formatDuration(elapsedMs(appState.timer || { elapsedMs: 0 }));
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function calculateScore(board) {
  const values = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  let score = 0;
  for (const row of board || []) {
    for (const piece of row) {
      const value = values[piece.toUpperCase()] || 0;
      if (piece >= 'A' && piece <= 'Z') score += value;
      else if (piece >= 'a' && piece <= 'z') score -= value;
    }
  }
  return score;
}

function safeLocalStorageSet(key, value) {
  try { window.localStorage?.setItem(key, value); } catch {}
}

function safeLocalStorageRemove(key) {
  try { window.localStorage?.removeItem(key); } catch {}
}
