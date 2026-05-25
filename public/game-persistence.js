export const GAME_STATE_STORAGE_KEY = 'bad-chess-2000:game-state:v1';

export function loadPersistedState(storage = window.localStorage, key = GAME_STATE_STORAGE_KEY) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersistedState(state, storage = window.localStorage, key = GAME_STATE_STORAGE_KEY) {
  try { storage?.setItem(key, JSON.stringify(state)); } catch {}
}

export function clearPersistedState(storage = window.localStorage, key = GAME_STATE_STORAGE_KEY) {
  try { storage?.removeItem(key); } catch {}
}
