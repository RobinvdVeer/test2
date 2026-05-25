import { createDomBoardView } from './board-view.js';
import { createGameController } from './game-controller.js';
import { createDebuggableGameController } from './game-controller-debug.js';
import { defaultAppState } from './game-metrics.js';
import { clearPersistedState, loadPersistedState } from './game-persistence.js';
import { normalizePersistedState } from './persisted-state-normalizer.js';
import { createAppStateManager } from './app-state.js';
import { playBadNoise } from './audio.js';

// Configuration knobs for maintainers who want to tune the badness without spelunking.
const GLITCH_PROBABILITY = 0.08;
const GLITCH_MAX_OFFSET_PX = 6;
const GLITCH_MAX_ROTATION_DEG = 4;
const BOT_PAWN_MOVE_BIAS = 0.7;
const BOT_MIN_DELAY_MS = 550;
const BOT_MAX_DELAY_MS = 1250;

export function startApp({ documentRef = document, windowRef = window } = {}) {
  const elements = getElements(documentRef);
  let controller;
  const restoredState = loadSafePersistedState();
  const appStateManager = createAppStateManager({
    initialAppState: restoredState?.app || defaultAppState(),
    elements
  });

  appStateManager.initializeElements();

  const view = createDomBoardView({
    boardEl: elements.boardEl,
    statusEl: elements.statusEl,
    documentRef,
    onSquareClick: (r, c) => controller.selectSquare(r, c),
    glitch: {
      probability: GLITCH_PROBABILITY,
      maxOffsetPx: GLITCH_MAX_OFFSET_PX,
      maxRotationDeg: GLITCH_MAX_ROTATION_DEG
    }
  });

  const controllerOptions = {
    view,
    chaosEnabled: () => Boolean(elements.chaosEl?.checked),
    onStateChange: appStateManager.onControllerStateChange,
    config: {
      pawnMoveBias: BOT_PAWN_MOVE_BIAS,
      botMinDelayMs: BOT_MIN_DELAY_MS,
      botMaxDelayMs: BOT_MAX_DELAY_MS
    }
  };

  if (windowRef.__BAD_CHESS_ENABLE_TEST_HOOKS__) {
    const session = createDebuggableGameController(controllerOptions);
    controller = session.controller;
    windowRef.__badChess = session.debugApi;
  } else {
    controller = createGameController(controllerOptions);
  }
  appStateManager.setController(controller);

  windowRef.BadChess = { newGame: controller.newGame, resetSavedGame: appStateManager.resetSavedGame };

  restoreOrStartGame(restoredState, controller, appStateManager);
  wireEvents(documentRef, windowRef, elements, controller, appStateManager);

  return { controller, appStateManager };
}

function getElements(documentRef) {
  return {
    boardEl: documentRef.getElementById('board'),
    statusEl: documentRef.getElementById('status'),
    chaosEl: documentRef.getElementById('chaos'),
    playerNameEl: documentRef.getElementById('playerName'),
    scoreEl: documentRef.getElementById('score'),
    timerEl: documentRef.getElementById('timer'),
    resetSavedGameEl: documentRef.getElementById('resetSavedGame')
  };
}

function restoreOrStartGame(restoredState, controller, appStateManager) {
  if (restoredState?.game) {
    appStateManager.runWithoutPersistence(() => controller.setState(restoredState.game));
    appStateManager.renderAppState();
    if (restoredState.game.turn === 'b' && !restoredState.game.gameOver) controller.botMove?.();
  } else {
    controller.newGame();
  }
}

function wireEvents(documentRef, windowRef, elements, controller, appStateManager) {
  documentRef.getElementById('newGame').addEventListener('click', () => {
    appStateManager.replaceWithNewGameState();
    controller.newGame();
    appStateManager.persistState();
  });
  documentRef.getElementById('noiseBtn').addEventListener('click', playBadNoise);
  elements.chaosEl.addEventListener('change', () => {
    appStateManager.updateChaos(elements.chaosEl.checked);
    controller.render();
  });
  elements.playerNameEl?.addEventListener('input', () => {
    appStateManager.updatePlayerName(elements.playerNameEl.value);
    appStateManager.persistState();
  });
  elements.resetSavedGameEl?.addEventListener('click', appStateManager.resetSavedGame);
  windowRef.addEventListener?.('beforeunload', appStateManager.persistState);
}

function loadSafePersistedState() {
  const persisted = normalizePersistedState(loadPersistedState());
  if (!persisted) clearPersistedState();
  return persisted;
}
