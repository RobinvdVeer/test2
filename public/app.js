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

function persistState() {
  if (!controller?.getState) return;
  const game = controller.getState();
  appState.playerName = playerNameEl?.value || appState.playerName || '';
  appState.settings = { ...appState.settings, chaos: Boolean(chaosEl?.checked) };
  appState.score = calculateScore(game.board);
  appState.timer = nextTimer(game.gameOver);
  renderAppState();
  savePersistedState({ game, app: appState });
}

function resetSavedGame() {
  clearPersistedState();
  appState = defaultAppState({ playerName: playerNameEl?.value || '' });
  controller.newGame();
  persistState();
}

function nextTimer(paused = false) {
  return currentTimer(appState.timer || { elapsedMs: 0, startedAt: Date.now() }, paused);
}

function renderAppState() {
  if (scoreEl) scoreEl.textContent = String(appState.score ?? 0);
  if (timerEl) timerEl.textContent = formatDuration(elapsedMs(appState.timer || { elapsedMs: 0 }));
}

