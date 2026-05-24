import { createDomBoardView } from './board-view.js';
import { createGameController } from './game-controller.js';
import { createDebuggableGameController } from './game-controller-debug.js';
import { playBadNoise } from './audio.js';

// Configuration knobs for maintainers who want to tune the badness without spelunking.
const DEFAULT_CONFIG = {
  glitchProbability: 0.08,
  glitchMaxOffsetPx: 6,
  glitchMaxRotationDeg: 4,
  botPawnMoveBias: 0.7,
  botMinDelayMs: 550,
  botMaxDelayMs: 1250
};

export function bootstrapBadChess({ documentRef = document, windowRef = window, random = Math.random, config = {} } = {}) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  const boardEl = documentRef.getElementById('board');
  const statusEl = documentRef.getElementById('status');
  const chaosEl = documentRef.getElementById('chaos');

  let controller;
  const view = createDomBoardView({
    boardEl,
    statusEl,
    documentRef,
    random,
    onSquareClick: (r, c) => controller.selectSquare(r, c),
    glitch: {
      probability: settings.glitchProbability,
      maxOffsetPx: settings.glitchMaxOffsetPx,
      maxRotationDeg: settings.glitchMaxRotationDeg
    }
  });

  const controllerOptions = {
    view,
    random,
    chaosEnabled: () => chaosEl.checked,
    config: {
      pawnMoveBias: settings.botPawnMoveBias,
      botMinDelayMs: settings.botMinDelayMs,
      botMaxDelayMs: settings.botMaxDelayMs
    }
  };

  let debugApi = null;
  if (windowRef.__BAD_CHESS_ENABLE_TEST_HOOKS__) {
    const session = createDebuggableGameController(controllerOptions);
    controller = session.controller;
    debugApi = session.debugApi;
    windowRef.__badChess = debugApi;
  } else {
    controller = createGameController(controllerOptions);
  }

  windowRef.BadChess = { newGame: controller.newGame };

  documentRef.getElementById('newGame').addEventListener('click', controller.newGame);
  documentRef.getElementById('noiseBtn').addEventListener('click', playBadNoise);
  chaosEl.addEventListener('change', controller.render);
  controller.newGame();

  return { controller, debugApi };
}
