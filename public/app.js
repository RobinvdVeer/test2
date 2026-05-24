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

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const chaosEl = document.getElementById('chaos');

let controller;
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
  chaosEnabled: () => chaosEl.checked,
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

window.BadChess = { newGame: controller.newGame };

document.getElementById('newGame').addEventListener('click', controller.newGame);
document.getElementById('noiseBtn').addEventListener('click', playBadNoise);
chaosEl.addEventListener('change', controller.render);
controller.newGame();
