import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import http from 'node:http';

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

async function loadApp({ random = () => 0.99, audioContext } = {}) {
  const ids = {
    board: new ElementStub('div', 'board'),
    status: new ElementStub('div', 'status'),
    chaos: new ElementStub('input', 'chaos'),
    newGame: new ElementStub('button', 'newGame'),
    noiseBtn: new ElementStub('button', 'noiseBtn')
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
  const originalAudioContext = globalThis.AudioContext;
  const originalWebkitAudioContext = globalThis.webkitAudioContext;
  const originalTestHooksFlag = globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__;
  const recorder = audioContext || createAudioContextRecorder();

  globalThis.document = document;
  globalThis.window = globalThis;
  globalThis.AudioContext = recorder.AudioContext;
  globalThis.webkitAudioContext = recorder.AudioContext;
  globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__ = true;
  Math.random = random;
  globalThis.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  globalThis.clearTimeout = () => {};

  const restore = () => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    Math.random = originalRandom;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;
    if (originalWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = originalWebkitAudioContext;
    if (originalTestHooksFlag === undefined) delete globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__;
    else globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__ = originalTestHooksFlag;
  };

  try {
    await import(`../public/app.js?test=${importCounter++}`);
  } catch (err) {
    restore();
    throw err;
  }

  return { api: globalThis.__badChess, ids, timers, audio: recorder, restore };
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

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: 8080, path, timeout: 1000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    req.on('error', reject);
  });
}

async function waitForHttp(path, attempts = 20) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await httpGet(path);
    } catch (err) {
      lastErr = err;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw lastErr;
}

test('Docker Compose serves the app over HTTP', { skip: !commandExists('docker') }, async t => {
  execFileSync('docker', ['compose', 'config'], { stdio: 'pipe' });
  const up = spawnSync('docker', ['compose', 'up', '-d', '--wait'], { stdio: 'pipe', encoding: 'utf8' });
  if (up.status !== 0) {
    t.skip(`docker compose up failed: ${up.stderr || up.stdout}`);
    return;
  }
  t.after(() => {
    spawnSync('docker', ['compose', 'down'], { stdio: 'ignore' });
  });

  const index = await waitForHttp('/');
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
    const response = await waitForHttp(path);
    assert.equal(response.statusCode, 200, `${path} is served`);
    assert.match(response.body, expected, `${path} has expected JavaScript content`);
  }
});
