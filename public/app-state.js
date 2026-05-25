import { defaultAppState, calculateScore, currentTimer, elapsedMs, formatDuration } from './game-metrics.js';
import { clearPersistedState, savePersistedState } from './game-persistence.js';

const PERSIST_DEBOUNCE_MS = 250;

export function createAppStateManager({ initialAppState = defaultAppState(), elements }) {
  const { playerNameEl, scoreEl, timerEl } = elements;
  let appState = initialAppState;
  let controller = null;
  let isRestoring = false;
  let lastPersistedPayload = null;
  let pendingPersistTimer = null;

  function setController(nextController) {
    controller = nextController;
  }

  function initializeElements() {
    if (elements.chaosEl && appState.settings && typeof appState.settings.chaos === 'boolean') elements.chaosEl.checked = appState.settings.chaos;
    if (playerNameEl) playerNameEl.value = appState.playerName || '';
  }

  function onControllerStateChange() {
    if (!isRestoring) persistState();
  }

  function runWithoutPersistence(fn) {
    isRestoring = true;
    try {
      return fn();
    } finally {
      isRestoring = false;
    }
  }

  function schedulePersistState() {
    if (pendingPersistTimer) clearTimeout(pendingPersistTimer);
    pendingPersistTimer = setTimeout(() => {
      pendingPersistTimer = null;
      persistState();
    }, PERSIST_DEBOUNCE_MS);
  }

  function flushPersistState() {
    if (pendingPersistTimer) {
      clearTimeout(pendingPersistTimer);
      pendingPersistTimer = null;
    }
    persistState();
  }

  function persistState() {
    if (pendingPersistTimer) {
      clearTimeout(pendingPersistTimer);
      pendingPersistTimer = null;
    }
    if (!controller?.getState) return;
    const game = controller.getState();
    appState.playerName = playerNameEl?.value || appState.playerName || '';
    appState.settings = { ...appState.settings, chaos: Boolean(elements.chaosEl?.checked) };
    appState.score = calculateScore(game.board);
    appState.timer = nextTimer(game.gameOver);
    renderAppState();

    const payload = JSON.stringify({ game, app: appState });
    if (payload === lastPersistedPayload) return;
    lastPersistedPayload = payload;
    savePersistedState({ game, app: appState });
  }

  function resetSavedGame() {
    if (pendingPersistTimer) {
      clearTimeout(pendingPersistTimer);
      pendingPersistTimer = null;
    }
    clearPersistedState();
    lastPersistedPayload = null;
    appState = defaultAppState({ playerName: playerNameEl?.value || '' });
    runWithoutPersistence(() => controller.newGame());
    renderAppState();
  }

  function replaceWithNewGameState() {
    appState = defaultAppState({ playerName: playerNameEl?.value || appState.playerName || '' });
  }

  function updatePlayerName(value) {
    appState.playerName = value;
  }

  function updateChaos(value) {
    appState.settings.chaos = Boolean(value);
  }

  function nextTimer(paused = false) {
    return currentTimer(appState.timer || { elapsedMs: 0, startedAt: Date.now() }, paused);
  }

  function renderAppState() {
    if (scoreEl) scoreEl.textContent = String(appState.score ?? 0);
    if (timerEl) timerEl.textContent = formatDuration(elapsedMs(appState.timer || { elapsedMs: 0 }));
  }

  return {
    setController,
    initializeElements,
    onControllerStateChange,
    runWithoutPersistence,
    persistState,
    schedulePersistState,
    flushPersistState,
    resetSavedGame,
    replaceWithNewGameState,
    updatePlayerName,
    updateChaos,
    renderAppState
  };
}
