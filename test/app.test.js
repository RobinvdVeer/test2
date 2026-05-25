import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  allLegalMoves,
  createGameState,
  getGameEnd,
  inCheck,
  legalMovesFor,
  markGameOverIfNeeded,
  makeMove,
  pseudoMovesFor
} from '../public/chess-engine.js';
import { chooseBadBotMove, makeBadBotMove } from '../public/bot.js';
import { playBadNoise } from '../public/audio.js';
import { createDomBoardView } from '../public/board-view.js';
import { createGameController } from '../public/game-controller.js';

const STORAGE_KEY = 'bad-chess-2000:game-state:v1';

let importCounter = 0;

function createClassList(el) {
  const classes = new Set();
  const sync = () => { el._className = [...classes].join(' '); };
  return {
    add(...names) { names.forEach(name => classes.add(name)); sync(); },
    remove(...names) { names.forEach(name => classes.delete(name)); sync(); },
    contains(name) { return classes.has(name); },
    _set(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); sync(); }
  };
}

class ElementStub {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {
      values: {},
      setProperty: (k, v) => { this.style.values[k] = v; },
      removeProperty: k => { delete this.style.values[k]; }
    };
    this.listeners = {};
    this.checked = false;
    this._innerHTML = '';
    this._textContent = '';
    this.classList = createClassList(this);
  }
  set className(value) { this.classList._set(value); }
  get className() { return this._className || ''; }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  get innerHTML() { return this._innerHTML; }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { (this.listeners[event.type] || []).forEach(fn => fn({ ...event, currentTarget: this, target: this })); }
  click() { this.dispatchEvent({ type: 'click' }); }
}

function createAudioContextRecorder() {
  const calls = [];
  const oscillators = [];
  const gains = [];
  function AudioContext() {
    this.currentTime = 10;
    this.destination = { kind: 'destination' };
    this.createOscillator = () => {
      const oscillator = {
        type: '',
        frequency: { value: 0 },
        connect: target => calls.push(['osc.connect', target]),
        start: () => calls.push(['osc.start']),
        stop: time => calls.push(['osc.stop', time])
      };
      oscillators.push(oscillator);
      return oscillator;
    };
    this.createGain = () => {
      const gain = {
        gain: { value: 0 },
        connect: target => calls.push(['gain.connect', target])
      };
      gains.push(gain);
      return gain;
    };
  }
  return { AudioContext, calls, oscillators, gains };
}

async function loadApp({ random = () => 0.99, audioContext, modulePath = '../public/app.js', localStorage, now } = {}) {
  const ids = {
    board: new ElementStub('div', 'board'),
    status: new ElementStub('div', 'status'),
    chaos: new ElementStub('input', 'chaos'),
    newGame: new ElementStub('button', 'newGame'),
    noiseBtn: new ElementStub('button', 'noiseBtn'),
    playerName: new ElementStub('input', 'playerName'),
    score: new ElementStub('strong', 'score'),
    timer: new ElementStub('strong', 'timer'),
    resetSavedGame: new ElementStub('button', 'resetSavedGame')
  };
  ids.chaos.checked = true;
  const timers = [];
  const document = {
    getElementById(id) { return ids[id]; },
    createElement(tagName) { return new ElementStub(tagName); }
  };
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalRandom = Math.random;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalDateNow = Date.now;
  const originalLocalStorage = globalThis.localStorage;
  const originalAddEventListener = globalThis.addEventListener;
  const originalAudioContext = globalThis.AudioContext;
  const originalWebkitAudioContext = globalThis.webkitAudioContext;
  const originalTestHooksFlag = globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__;
  const recorder = audioContext || createAudioContextRecorder();

  const windowListeners = {};

  globalThis.document = document;
  globalThis.window = globalThis;
  globalThis.AudioContext = recorder.AudioContext;
  globalThis.webkitAudioContext = recorder.AudioContext;
  globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__ = true;
  if (localStorage !== undefined) globalThis.localStorage = localStorage;
  if (now !== undefined) Date.now = typeof now === 'function' ? now : () => now;
  globalThis.addEventListener = (type, fn) => { (windowListeners[type] ||= []).push(fn); };
  Math.random = random;
  globalThis.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  globalThis.clearTimeout = () => {};

  const restore = () => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    Math.random = originalRandom;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    Date.now = originalDateNow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalAddEventListener === undefined) delete globalThis.addEventListener;
    else globalThis.addEventListener = originalAddEventListener;
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;
    if (originalWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = originalWebkitAudioContext;
    if (originalTestHooksFlag === undefined) delete globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__;
    else globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__ = originalTestHooksFlag;
  };

  try {
    await import(`${modulePath}?test=${importCounter++}`);
  } catch (err) {
    restore();
    throw err;
  }

  const dispatchWindowEvent = type => (windowListeners[type] || []).forEach(fn => fn({ type }));

  return { api: globalThis.__badChess, ids, timers, audio: recorder, restore, dispatchWindowEvent };
}

function createMemoryLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    key(index) { return [...store.keys()][index] || null; },
    get length() { return store.size; },
    _store: store
  };
}

function stateFrom(boardOrNext, turn = 'w', castling = { K: false, Q: false, k: false, q: false }, enPassant = null) {
  if (Array.isArray(boardOrNext)) {
    return { board: boardOrNext.map(row => row.split('')), turn, enPassant, castling: { ...castling }, gameOver: false };
  }

  const next = boardOrNext || {};
  const state = createGameState();
  if (next.board) state.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
  if ('turn' in next) state.turn = next.turn;
  if ('enPassant' in next) state.enPassant = next.enPassant;
  if ('castling' in next) state.castling = { ...next.castling };
  if ('gameOver' in next) state.gameOver = next.gameOver;
  return state;
}

const destinations = moves => moves.map(m => `${m.to.r},${m.to.c}`).sort();
const hasMove = (moves, r, c, prop) => moves.some(m => m.to.r === r && m.to.c === c && (!prop || m[prop]));
const boardKey = state => state.board.map(r => r.join('')).join('/');
const applyMoveForTest = (state, move) => { makeMove(state, move); return state; };
const squareAt = (ids, r, c) => ids.board.children.find(sq => Number(sq.dataset.r) === r && Number(sq.dataset.c) === c);

test('app module imports successfully with DOM stubs', async () => {
  const app = await loadApp();
  try {
    assert.equal(app.ids.board.children.length, 64);
    assert.equal(typeof app.api.newGame, 'function');
  } finally {
    app.restore();
  }
});

test('root-level runtime modules syntax-check and import successfully', async () => {
  execFileSync('node', ['--check', 'app.js'], { stdio: 'pipe' });
  execFileSync('node', ['--check', 'bot.js'], { stdio: 'pipe' });
  execFileSync('node', ['--check', 'game-controller.js'], { stdio: 'pipe' });
  await import(`../bot.js?rootBot=${importCounter++}`);
  await import(`../game-controller.js?rootController=${importCounter++}`);

  const app = await loadApp({ modulePath: '../app.js' });
  try {
    assert.equal(app.ids.board.children.length, 64);
    assert.equal(typeof app.api.newGame, 'function');
  } finally {
    app.restore();
  }
});

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

test('controller setState/getState round-trip and isolate mutable state', () => {
  const renders = [];
  const statuses = [];
  const controller = createGameController({
    view: {
      render(game, meta) { renders.push({ game, meta }); },
      setStatus(status) { statuses.push(status); }
    },
    chaosEnabled: () => false
  });
  const next = {
    board: ['....k...', '........', '........', '........', '...Q....', '........', '........', '....K...'],
    turn: 'w',
    selected: { r: 4, c: 3 },
    legalForSelected: [{ from: { r: 4, c: 3 }, to: { r: 4, c: 4 } }],
    enPassant: { r: 2, c: 4 },
    castling: { K: false, Q: true, k: false, q: true },
    gameOver: false
  };
  controller.setState(next);
  next.selected.r = 0;
  next.legalForSelected[0].to.r = 0;
  next.enPassant.r = 0;
  next.board[4] = '........';

  const state = controller.getState();
  assert.equal(boardKey(state), '....k.../......../......../......../...Q..../......../......../....K...');
  assert.deepEqual(state.selected, { r: 4, c: 3 });
  assert.deepEqual(state.legalForSelected, [{ from: { r: 4, c: 3 }, to: { r: 4, c: 4 } }]);
  assert.deepEqual(state.enPassant, { r: 2, c: 4 });
  assert.deepEqual(state.castling, { K: false, Q: true, k: false, q: true });

  state.board[4][3] = '.';
  state.selected.r = 1;
  state.legalForSelected[0].to.c = 7;
  state.enPassant.c = 7;
  state.castling.Q = false;
  const again = controller.getState();
  assert.equal(again.board[4][3], 'Q');
  assert.deepEqual(again.selected, { r: 4, c: 3 });
  assert.deepEqual(again.legalForSelected[0].to, { r: 4, c: 4 });
  assert.deepEqual(again.enPassant, { r: 2, c: 4 });
  assert.equal(again.castling.Q, true);
  assert.equal(renders.length, 1);
  assert.deepEqual(statuses, []);
});

test('core move generator covers initial moves, piece movement, blocking, captures, and pinned pieces', () => {
  let state = createGameState();

  assert.equal(allLegalMoves(state, 'w').length, 20);
  assert.equal(allLegalMoves(state, 'b').length, 20);
  assert.deepEqual(destinations(legalMovesFor(state, 7, 1)), ['5,0', '5,2']);
  assert.deepEqual(destinations(legalMovesFor(state, 6, 4)), ['4,4', '5,4']);

  state = stateFrom([
    '....k...', '........', '........', '..p.p...',
    '...B....', '..P.P...', '........', '....K...'
  ]);
  assert.deepEqual(destinations(pseudoMovesFor(state, 4, 3)), ['3,2', '3,4'], 'bishop can capture enemies but cannot pass through them or own pieces');

  state = stateFrom([
    '....k...', '........', '........', '........',
    '...Q....', '........', '........', '....K...'
  ]);
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 4, 0), 'queen moves horizontally');
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 1, 0), 'queen moves diagonally');

  state = stateFrom([
    '....k...', '........', '........', '........',
    '...R....', '........', '........', '....K...'
  ]);
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 0, 3), 'rook moves vertically');
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 4, 7), 'rook moves horizontally');

  state = stateFrom([
    '....k...', '........', '........', '........',
    '........', '........', '........', '...K....'
  ]);
  assert.ok(hasMove(pseudoMovesFor(state, 7, 3), 6, 4), 'king moves one square');

  state = stateFrom([
    '....r...', '........', '........', '........',
    '....B...', '........', '........', '....K...'
  ]);
  assert.equal(legalMovesFor(state, 4, 4).length, 0, 'bishop pinned to king must not be allowed to expose check');
});

test('special rules: promotion, en passant, castling, castling restrictions, and castling rights', () => {
  let state = stateFrom(['....k...', 'P.......', '........', '........', '........', '........', '.......p', '....K...']);
  const whitePromotion = legalMovesFor(state, 1, 0).find(m => m.to.r === 0 && m.to.c === 0);
  assert.equal(whitePromotion.promotion, 'Q');
  makeMove(state, whitePromotion);
  assert.equal(state.board[0][0], 'Q');

  state = stateFrom(['....k...', '........', '........', '........', '........', '........', '.......p', '....K...'], 'b');
  const blackPromotion = legalMovesFor(state, 6, 7).find(m => m.to.r === 7 && m.to.c === 7);
  assert.equal(blackPromotion.promotion, 'q');

  state = stateFrom(['....k...', '........', '........', '...Pp...', '........', '........', '........', '....K...'], 'w', undefined, { r: 2, c: 4 });
  const enPassant = legalMovesFor(state, 3, 3).find(m => m.enPassant);
  assert.ok(enPassant);
  makeMove(state, enPassant);
  assert.equal(state.board[2][4], 'P');
  assert.equal(state.board[3][4], '.');

  state = stateFrom(['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], 'w', { K: true, Q: true, k: true, q: true });
  assert.ok(hasMove(legalMovesFor(state, 7, 4), 7, 6, 'castle'));
  assert.ok(hasMove(legalMovesFor(state, 7, 4), 7, 2, 'castle'));
  makeMove(state, legalMovesFor(state, 7, 4).find(m => m.castle === 'k'));
  assert.equal(state.board[7][6], 'K');
  assert.equal(state.board[7][5], 'R');
  assert.equal(state.castling.K, false);
  assert.equal(state.castling.Q, false);

  state = stateFrom(['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K.NR'], 'w', { K: true, Q: true, k: true, q: true });
  assert.equal(hasMove(legalMovesFor(state, 7, 4), 7, 6, 'castle'), false, 'blocked castling is illegal');
  state = stateFrom(['....k...', '........', '........', '........', '.....r..', '........', '........', 'R...K..R'], 'w', { K: true, Q: true, k: false, q: false });
  assert.equal(hasMove(legalMovesFor(state, 7, 4), 7, 6, 'castle'), false, 'cannot castle through attacked square');

  state = stateFrom(['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], 'w', { K: true, Q: true, k: true, q: true });
  makeMove(state, { from: { r: 7, c: 0 }, to: { r: 7, c: 1 } });
  assert.equal(state.castling.Q, false);
  state = stateFrom(['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], 'w', { K: true, Q: true, k: true, q: true });
  makeMove(state, { from: { r: 7, c: 7 }, to: { r: 0, c: 7 } });
  assert.equal(state.castling.k, false, 'capturing rook revokes opponent castling right');
});

test('castling is unavailable when rights are true but the rook is missing or replaced', () => {
  for (const { name, board, color, king, missingTo, replacedBoard, replacedTo } of [
    { name: 'white king-side', board: ['....k...', '........', '........', '........', '........', '........', '........', 'R...K...'], replacedBoard: ['....k...', '........', '........', '........', '........', '........', '........', 'R...K..N'], color: 'w', king: [7, 4], missingTo: [7, 6], replacedTo: [7, 6] },
    { name: 'white queen-side', board: ['....k...', '........', '........', '........', '........', '........', '........', '....K..R'], replacedBoard: ['....k...', '........', '........', '........', '........', '........', '........', 'N...K..R'], color: 'w', king: [7, 4], missingTo: [7, 2], replacedTo: [7, 2] },
    { name: 'black king-side', board: ['r...k...', '........', '........', '........', '........', '........', '........', '....K...'], replacedBoard: ['r...k..n', '........', '........', '........', '........', '........', '........', '....K...'], color: 'b', king: [0, 4], missingTo: [0, 6], replacedTo: [0, 6] },
    { name: 'black queen-side', board: ['....k..r', '........', '........', '........', '........', '........', '........', '....K...'], replacedBoard: ['n...k..r', '........', '........', '........', '........', '........', '........', '....K...'], color: 'b', king: [0, 4], missingTo: [0, 2], replacedTo: [0, 2] }
  ]) {
    let state = stateFrom(board, color, { K: true, Q: true, k: true, q: true });
    assert.equal(hasMove(legalMovesFor(state, ...king), ...missingTo, 'castle'), false, `${name} cannot castle without rook`);
    state = stateFrom(replacedBoard, color, { K: true, Q: true, k: true, q: true });
    assert.equal(hasMove(legalMovesFor(state, ...king), ...replacedTo, 'castle'), false, `${name} cannot castle with non-rook corner piece`);
  }
});

test('game-end evaluation is pure', () => {
  const state = stateFrom(['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], 'b');
  const result = getGameEnd(state);
  assert.deepEqual(result, { over: true, checkmate: true, color: 'b' });
  assert.equal(state.gameOver, false, 'getGameEnd must not mutate state');
});

test('markGameOverIfNeeded mutates only when the game is over', () => {
  let state = stateFrom(['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], 'b');
  assert.deepEqual(markGameOverIfNeeded(state), { over: true, checkmate: true, color: 'b' });
  assert.equal(state.gameOver, true, 'checkmate marks game over');

  state = stateFrom(['k.......', '..Q.....', 'K.......', '........', '........', '........', '........', '........'], 'b');
  assert.deepEqual(markGameOverIfNeeded(state), { over: true, checkmate: false, color: 'b' });
  assert.equal(state.gameOver, true, 'stalemate marks game over');

  state = createGameState();
  const result = markGameOverIfNeeded(state);
  assert.equal(result.over, false);
  assert.equal(state.gameOver, false, 'ongoing games are not marked over');
});

test('bot is deterministic with injected random and only makes legal moves', () => {
  const state = createGameState();
  makeMove(state, legalMovesFor(state, 6, 4).find(m => m.to.r === 4 && m.to.c === 4));
  state.turn = 'b';
  const beforeBot = boardKey(state);

  assert.equal(makeBadBotMove(state, { random: () => 0, pawnBias: 0.7 }), true);
  assert.notEqual(boardKey(state), beforeBot);

  const locked = stateFrom(['....k...', '........', '........', '........', '........', '........', '........', '....K...'], 'b');
  assert.equal(makeBadBotMove(locked, { random: () => 0 }), true);
  assert.equal(inCheck(locked, 'w'), false);
});

test('bot turn is deterministic under fake timers/random and only makes legal moves', async () => {
  const randomValues = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0];
  const app = await loadApp({ random: () => randomValues.shift() ?? 0.99 });
  try {
    app.ids.chaos.checked = false;
    app.api.render();
    squareAt(app.ids, 6, 4).click();
    squareAt(app.ids, 4, 4).click();

    assert.equal(app.api.getState().turn, 'b');
    assert.equal(app.timers.length, 1);
    assert.match(app.ids.status.textContent, /Bot thinking/);
    const beforeBot = boardKey(app.api.getState());
    app.timers[0].fn();
    const afterBot = app.api.getState();
    assert.equal(afterBot.turn, 'w');
    assert.notEqual(boardKey(afterBot), beforeBot);
    assert.match(app.ids.status.textContent, /Your move|CHECK/);

    app.api.setState({ board: ['....k...', '........', '........', '........', '........', '........', '........', '....K...'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: true });
    const locked = boardKey(app.api.getState());
    app.api.botMove();
    assert.equal(boardKey(app.api.getState()), locked);
  } finally {
    app.restore();
  }
});

test('checkmate and stalemate set game over and block further clicks', async () => {
  const app = await loadApp();
  try {
    app.ids.chaos.checked = false;

    app.api.setState({ board: ['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
    assert.equal(app.api.checkGameEnd(), true);
    assert.match(app.ids.status.textContent, /checkmated/);
    assert.equal(app.api.getState().gameOver, true);
    const before = boardKey(app.api.getState());
    app.api.render();
    squareAt(app.ids, 1, 1).click();
    assert.equal(boardKey(app.api.getState()), before);

    app.api.setState({ board: ['k.......', '..Q.....', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
    assert.equal(app.api.checkGameEnd(), true);
    assert.match(app.ids.status.textContent, /Stalemate/);
  } finally {
    app.restore();
  }
});

test('botMove handles no-legal-move checkmate and stalemate without advancing turn', async () => {
  const app = await loadApp();
  try {
    for (const { board, expectedStatus } of [
      { board: ['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], expectedStatus: /checkmated/ },
      { board: ['k.......', '..Q.....', 'K.......', '........', '........', '........', '........', '........'], expectedStatus: /Stalemate/ }
    ]) {
      app.api.setState({ board, turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
      const before = boardKey(app.api.getState());
      app.api.botMove();
      const after = app.api.getState();
      assert.equal(boardKey(after), before);
      assert.equal(after.turn, 'b');
      assert.equal(after.gameOver, true);
      assert.match(app.ids.status.textContent, expectedStatus);
    }
  } finally {
    app.restore();
  }
});

test('rendering and click-selection UI behavior is covered, including chaos glitches', async () => {
  const randomValues = [0.01, 0.99, 0.99, 0.99, 0.99, 0.99];
  const app = await loadApp({ random: () => randomValues.shift() ?? 0.99 });
  try {
    assert.equal(app.ids.board.children.length, 64);
    assert.match(app.ids.board.children[0].innerHTML, /♜/);
    assert.ok(app.ids.board.children.some(sq => sq.classList.contains('glitch')));

    app.ids.chaos.checked = false;
    app.api.newGame();
    squareAt(app.ids, 0, 0).click();
    assert.match(app.ids.status.textContent, /not your piece/);

    squareAt(app.ids, 7, 1).click();
    assert.match(app.ids.status.textContent, /♘ selected/);
    assert.ok(squareAt(app.ids, 7, 1).classList.contains('selected'));
    assert.equal(app.ids.board.children.filter(sq => sq.classList.contains('legal')).length, 2);
  } finally {
    app.restore();
  }
});

test('board view clears stale glitch and selection state on repeated renders', () => {
  const boardEl = new ElementStub('div', 'board');
  const statusEl = new ElementStub('div', 'status');
  const documentRef = { createElement: tagName => new ElementStub(tagName) };
  const view = createDomBoardView({
    boardEl,
    statusEl,
    documentRef,
    onSquareClick() {},
    random: () => 0,
    glitch: { probability: 1, maxOffsetPx: 6, maxRotationDeg: 4 }
  });
  const game = createGameState();

  view.render(game, { selected: { r: 7, c: 1 }, legalForSelected: [{ to: { r: 5, c: 0 } }], chaosEnabled: true });
  assert.ok(boardEl.children.every(sq => sq.classList.contains('glitch')));
  assert.ok(squareAt({ board: boardEl }, 7, 1).classList.contains('selected'));
  assert.ok(squareAt({ board: boardEl }, 5, 0).classList.contains('legal'));

  view.render(game, { selected: { r: 6, c: 4 }, legalForSelected: [{ to: { r: 4, c: 4 } }], chaosEnabled: false });
  assert.ok(boardEl.children.every(sq => !sq.classList.contains('glitch')));
  assert.ok(boardEl.children.every(sq => !('--x' in sq.style.values) && !('--y' in sq.style.values) && !('--r' in sq.style.values)));
  assert.equal(squareAt({ board: boardEl }, 7, 1).classList.contains('selected'), false);
  assert.equal(squareAt({ board: boardEl }, 5, 0).classList.contains('legal'), false);
  assert.ok(squareAt({ board: boardEl }, 6, 4).classList.contains('selected'));
  assert.ok(squareAt({ board: boardEl }, 4, 4).classList.contains('legal'));
});

test('noise button wires Web Audio oscillator and gain settings', async () => {
  const app = await loadApp({ random: () => 0.5 });
  try {
    app.ids.noiseBtn.click();
    assert.equal(app.audio.oscillators[0].type, 'square');
    assert.equal(app.audio.oscillators[0].frequency.value, 610);
    assert.equal(app.audio.gains[0].gain.value, 0.05);
    assert.equal(app.audio.calls[0][0], 'osc.connect');
    assert.equal(app.audio.calls[1][0], 'gain.connect');
    assert.deepEqual(app.audio.calls.slice(2), [['osc.start'], ['osc.stop', 10.15]]);
  } finally {
    app.restore();
  }
});

test('makeBadBotMove returns false and leaves state unchanged when black has no moves', () => {
  const state = stateFrom(['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], 'b');
  const before = boardKey(state);
  assert.equal(makeBadBotMove(state), false);
  assert.equal(boardKey(state), before);
});

test('makeBadBotMove returns true and uses pawn-biased branch with controlled random', () => {
  const state = createGameState();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.equal(makeBadBotMove(state), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(state.board[2][0], 'p', 'first black pawn double-moves when pawn-biased branch picks first pawn move');
  assert.equal(state.board[1][0], '.');
});

test('chooseBadBotMove uses pawn bias, fallback, no-pawn fallback, and bias precedence', () => {
  const state = stateFrom(['....k...', 'p.......', '........', '........', '........', '........', '........', '....K.n.'], 'b');
  const nonPawnMove = { from: { r: 7, c: 6 }, to: { r: 5, c: 5 } };
  const pawnMove = { from: { r: 1, c: 0 }, to: { r: 2, c: 0 } };
  const moves = [nonPawnMove, pawnMove];

  let values = [0, 0];
  assert.equal(chooseBadBotMove(state, { moves, pawnBias: 1, random: () => values.shift() ?? 0 }), pawnMove, 'pawn-biased branch picks from pawn moves');

  values = [0.99, 0];
  assert.equal(chooseBadBotMove(state, { moves, pawnBias: 0.7, random: () => values.shift() ?? 0 }), nonPawnMove, 'fallback branch picks from all moves');

  values = [0, 0];
  assert.equal(chooseBadBotMove(state, { moves: [nonPawnMove], pawnBias: 1, random: () => values.shift() ?? 0 }), nonPawnMove, 'no-pawn move list falls back to all moves');

  values = [0, 0];
  assert.equal(chooseBadBotMove(state, { moves, pawnBias: 0, pawnMoveBias: 1, random: () => values.shift() ?? 0 }), nonPawnMove, 'pawnBias overrides pawnMoveBias');
});

test('makeBadBotMove can use fallback all-moves branch with controlled random', () => {
  const state = createGameState();
  const before = boardKey(state);
  const originalRandom = Math.random;
  const values = [0.99, 0.99];
  Math.random = () => values.shift() ?? 0.99;
  try {
    assert.equal(makeBadBotMove(state), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.notEqual(boardKey(state), before, 'some legal black move was made from all-moves pool');
  assert.equal(allLegalMoves(createGameState(), 'b').some(move => boardKey(applyMoveForTest(createGameState(), move)) === boardKey(state)), true, 'result matches one legal black move');
});

test('playBadNoise documents missing Web Audio support by throwing', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    const audio = await import(`../public/audio.js?missingAudio=${importCounter++}`);
    assert.throws(() => audio.playBadNoise(), TypeError);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('playBadNoise documents AudioContext constructor errors by propagating them', async () => {
  const originalWindow = globalThis.window;
  const err = new Error('blocked audio');
  globalThis.window = { AudioContext: function AudioContext() { throw err; } };
  try {
    const audio = await import(`../public/audio.js?blockedAudio=${importCounter++}`);
    assert.throws(() => audio.playBadNoise(), err);
  } finally {
    globalThis.window = originalWindow;
  }
});

function commandExists(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}

test('Helm chart renders deployment image from values', { skip: !commandExists('helm') }, () => {
  execFileSync('helm', ['lint', 'deploy/chart'], { stdio: 'pipe' });
  const rendered = execFileSync('helm', [
    'template',
    'test',
    'deploy/chart',
    '-f',
    'deploy/values-staging.yaml',
    '--set',
    'image.app.tag=ci-test-tag'
  ], { encoding: 'utf8' });

  assert.match(rendered, /kind: Deployment/);
  assert.match(rendered, /image: "ghcr\.io\/robinvdveer\/really-bad-chess-web-app:ci-test-tag"/);
  assert.doesNotMatch(rendered, /image: "ghcr\.io\/robinvdveer\/really-bad-chess-web-app:latest"/);
});

test('Helm service defaults to ClusterIP and supports configurable NodePort', { skip: !commandExists('helm') }, () => {
  const renderedDefault = execFileSync('helm', ['template', 'test', 'deploy/chart'], { encoding: 'utf8' });
  assert.match(renderedDefault, /kind: Service[\s\S]*?spec:\n  type: ClusterIP/);
  assert.doesNotMatch(renderedDefault, /nodePort:/, 'nodePort is omitted by default');
  assert.match(renderedDefault, /seccompProfile:\n          type: RuntimeDefault/);

  const renderedWithNodePort = execFileSync('helm', [
    'template',
    'test',
    'deploy/chart',
    '--set',
    'service.type=NodePort',
    '--set',
    'service.nodePort=30080'
  ], { encoding: 'utf8' });
  assert.match(renderedWithNodePort, /kind: Service[\s\S]*?spec:\n  type: NodePort[\s\S]*?nodePort: 30080/);
});

function httpGet(path, port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 1000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    req.on('error', reject);
  });
}

async function waitForHttp(path, port, attempts = 20) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await httpGet(path, port);
    } catch (err) {
      lastErr = err;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw lastErr;
}

test('Docker Compose config and image build are valid', { skip: !commandExists('docker') }, () => {
  execFileSync('docker', ['compose', 'config'], { stdio: 'pipe' });
  execFileSync('docker', ['compose', 'build', 'app'], { stdio: 'pipe' });
});

test('Docker Compose serves the app over HTTP on an ephemeral test port', { skip: !commandExists('docker') }, async t => {
  const tempDir = mkdtempSync(join(tmpdir(), 'bad-chess-compose-'));
  const composeFile = join(tempDir, 'compose.yaml');
  const projectName = `bad-chess-test-${process.pid}-${Date.now()}`;
  writeFileSync(composeFile, `services:\n  app:\n    build:\n      context: ${JSON.stringify(process.cwd())}\n      dockerfile: Dockerfile\n    image: really-bad-chess-web-app:test\n    ports:\n      - "127.0.0.1:0:80"\n`);

  const composeArgs = ['compose', '-p', projectName, '-f', composeFile];
  const up = spawnSync('docker', [...composeArgs, 'up', '-d', '--wait'], { stdio: 'pipe', encoding: 'utf8' });
  if (up.status !== 0) {
    rmSync(tempDir, { recursive: true, force: true });
    t.skip(`docker compose up failed: ${up.stderr || up.stdout}`);
    return;
  }
  t.after(() => {
    spawnSync('docker', [...composeArgs, 'down', '--volumes'], { stdio: 'ignore' });
    rmSync(tempDir, { recursive: true, force: true });
  });

  const mapped = execFileSync('docker', [...composeArgs, 'port', 'app', '80'], { encoding: 'utf8' }).trim();
  const port = Number(mapped.split(':').pop());
  assert.ok(port > 0, `expected mapped port from ${mapped}`);

  const index = await waitForHttp('/', port);
  assert.equal(index.statusCode, 200);
  assert.match(index.body, /<script type="module" src="app\.js"><\/script>/);

  const modules = [
    ['/app.js', /import .*\.\/game-controller\.js/],
    ['/board-view.js', /export function createDomBoardView/],
    ['/game-controller.js', /export function createGameController/],
    ['/bot.js', /export function makeBadBotMove/],
    ['/piece-symbols.js', /export const PIECES/],
    ['/chess-engine.js', /export function createGameState/],
    ['/audio.js', /export function playBadNoise/]
  ];

  for (const [path, expected] of modules) {
    const response = await waitForHttp(path, port);
    assert.equal(response.statusCode, 200, `${path} is served`);
    assert.match(response.body, expected, `${path} has expected JavaScript content`);
  }
});
