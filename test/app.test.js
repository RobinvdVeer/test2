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
  makeMove,
  pseudoMovesFor
} from '../public/chess-engine.js';
import { makeBadBotMove } from '../bot.js';
import { playBadNoise } from '../public/audio.js';

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

test('makeBadBotMove can use fallback all-moves branch with controlled random', () => {
  const state = createGameState();
  const originalRandom = Math.random;
  const values = [0.99, 0.99];
  Math.random = () => values.shift() ?? 0.99;
  try {
    assert.equal(makeBadBotMove(state), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.notEqual(boardKey(state), boardKey(createGameState()), 'some legal black move was made from all-moves pool');
});

test('playBadNoise documents missing Web Audio support by throwing', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.throws(() => playBadNoise(), TypeError);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('playBadNoise documents AudioContext constructor errors by propagating them', () => {
  const originalWindow = globalThis.window;
  const err = new Error('blocked audio');
  globalThis.window = { AudioContext: function AudioContext() { throw err; } };
  try {
    assert.throws(() => playBadNoise(), err);
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

  const appJs = await waitForHttp('/app.js');
  assert.equal(appJs.statusCode, 200);
  assert.match(appJs.body, /import .*\.\/game-controller\.js/);
});
