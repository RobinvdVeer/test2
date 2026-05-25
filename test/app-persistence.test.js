import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/chess-engine.js';
import { boardKey, createMemoryLocalStorage, loadApp, squareAt } from './helpers.js';

const STORAGE_KEY = 'bad-chess-2000:game-state:v1';

test('app restores persisted game state, app state, and resumes black turn', async () => {
  const savedWhiteTurn = {
    game: {
      board: ['....k...', '........', '........', '........', '...Q....', '........', '........', '....K...'],
      turn: 'w',
      selected: { r: 4, c: 3 },
      legalForSelected: [{ from: { r: 4, c: 3 }, to: { r: 4, c: 4 } }],
      enPassant: { r: 2, c: 4 },
      castling: { K: false, Q: true, k: false, q: true },
      gameOver: false
    },
    app: {
      playerName: 'Ada',
      score: 123,
      timer: { elapsedMs: 65000, startedAt: 1000 },
      settings: { chaos: false }
    }
  };
  const storage = createMemoryLocalStorage({ [STORAGE_KEY]: JSON.stringify(savedWhiteTurn) });
  const app = await loadApp({ localStorage: storage, now: 4000 });
  try {
    const state = app.api.getState();
    assert.equal(boardKey(state), savedWhiteTurn.game.board.join('/'));
    assert.equal(state.turn, 'w');
    assert.deepEqual(state.enPassant, { r: 2, c: 4 });
    assert.deepEqual(state.castling, { K: false, Q: true, k: false, q: true });
    assert.equal(app.ids.playerName.value, 'Ada');
    assert.equal(app.ids.chaos.checked, false);
    assert.equal(app.ids.score.textContent, '123');
    assert.equal(app.ids.timer.textContent, '01:08');
    assert.match(squareAt(app.ids, 4, 3).innerHTML, /♕/);
  } finally {
    app.restore();
  }

  const savedBlackTurn = {
    game: {
      board: createGameState().board.map(row => row.join('')),
      turn: 'b',
      selected: null,
      legalForSelected: [],
      enPassant: null,
      castling: { K: true, Q: true, k: true, q: true },
      gameOver: false
    },
    app: { playerName: 'Bot Bait', score: 0, timer: { elapsedMs: 0, startedAt: 1000 }, settings: { chaos: true } }
  };
  const blackStorage = createMemoryLocalStorage({ [STORAGE_KEY]: JSON.stringify(savedBlackTurn) });
  const blackApp = await loadApp({ localStorage: blackStorage, random: () => 0, now: 1000 });
  try {
    assert.equal(blackApp.api.getState().turn, 'w', 'black saved turn is resumed by making the bot move');
    assert.notEqual(boardKey(blackApp.api.getState()), savedBlackTurn.game.board.join('/'));
  } finally {
    blackApp.restore();
  }
});

test('reset saved game clears persistence and resets visible state', async () => {
  const storage = createMemoryLocalStorage({ [STORAGE_KEY]: JSON.stringify({
    game: { board: ['....k...', '........', '........', '........', '...Q....', '........', '........', '....K...'], turn: 'w', selected: null, legalForSelected: [], enPassant: null, castling: { K: false, Q: false, k: false, q: false }, gameOver: false },
    app: { playerName: 'Reset Me', score: 9, timer: { elapsedMs: 99000, startedAt: null }, settings: { chaos: false } }
  }) });
  const app = await loadApp({ localStorage: storage, now: 200000 });
  try {
    app.ids.resetSavedGame.click();
    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.equal(boardKey(app.api.getState()), boardKey(createGameState()));
    assert.equal(app.ids.score.textContent, '0');
    assert.equal(app.ids.timer.textContent, '00:00');
    assert.equal(app.ids.playerName.value, 'Reset Me');
  } finally {
    app.restore();
  }
});

test('app tolerates localStorage failures and corrupt persisted data', async () => {
  for (const localStorage of [
    { getItem() { throw new Error('get blocked'); }, setItem() {}, removeItem() {} },
    { getItem() { return '{not json'; }, setItem() {}, removeItem() {} },
    { getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() {} },
    { getItem() { return null; }, setItem() {}, removeItem() { throw new Error('remove blocked'); } }
  ]) {
    const app = await loadApp({ localStorage });
    try {
      assert.equal(app.ids.board.children.length, 64);
      assert.doesNotThrow(() => {
        app.ids.playerName.value = 'Still playing';
        app.ids.playerName.dispatchEvent({ type: 'input' });
        app.ids.chaos.checked = false;
        app.ids.chaos.dispatchEvent({ type: 'change' });
        app.ids.resetSavedGame.click();
      });
      squareAt(app.ids, 6, 4).click();
      squareAt(app.ids, 4, 4).click();
      assert.equal(app.api.getState().turn, 'b');
    } finally {
      app.restore();
    }
  }
});

test('timer persists elapsed time and pauses when game is over', async () => {
  let now = 100000;
  const storage = createMemoryLocalStorage();
  const app = await loadApp({ localStorage: storage, now: () => now });
  try {
    assert.equal(app.ids.timer.textContent, '00:00');
    now += 65000;
    app.dispatchWindowEvent('beforeunload');
    let saved = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(saved.app.timer.elapsedMs, 65000);
    assert.equal(saved.app.timer.startedAt, 165000);
    assert.equal(app.ids.timer.textContent, '01:05');

    app.api.setState({ board: ['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: true });
    app.api.render();
    saved = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(saved.app.timer.startedAt, null);
    assert.equal(saved.app.timer.elapsedMs, 65000);
    now += 30000;
    app.api.render();
    saved = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(saved.app.timer.elapsedMs, 65000);
    assert.equal(app.ids.timer.textContent, '01:05');
  } finally {
    app.restore();
  }
});
