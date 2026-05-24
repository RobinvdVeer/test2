import test from 'node:test';
import assert from 'node:assert/strict';
import { allLegalMoves, createGameState, getGameEnd, inCheck, legalMovesFor, makeMove, pseudoMovesFor } from '../chess-engine.js';
import { makeBadBotMove } from '../bot.js';
import { createGameController } from '../game-controller.js';

function stateFrom(next = {}) {
  const state = createGameState();
  if (next.board) state.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
  if ('turn' in next) state.turn = next.turn;
  if ('enPassant' in next) state.enPassant = next.enPassant;
  if ('castling' in next) state.castling = { ...next.castling };
  if ('gameOver' in next) state.gameOver = next.gameOver;
  return state;
}

function createView() {
  return {
    renders: [],
    status: '',
    render(game, uiState) { this.renders.push({ board: game.board.map(row => row.slice()), uiState }); },
    setStatus(status) { this.status = status; }
  };
}

const destinations = moves => moves.map(m => `${m.to.r},${m.to.c}`).sort();
const hasMove = (moves, r, c, prop) => moves.some(m => m.to.r === r && m.to.c === c && (!prop || m[prop]));

test('core move generator covers initial moves, piece movement, blocking, captures, and pinned pieces', () => {
  let state = createGameState();

  assert.equal(allLegalMoves(state, 'w').length, 20);
  assert.equal(allLegalMoves(state, 'b').length, 20);
  assert.deepEqual(destinations(legalMovesFor(state, 7, 1)), ['5,0', '5,2']);
  assert.deepEqual(destinations(legalMovesFor(state, 6, 4)), ['4,4', '5,4']);

  state = stateFrom({
    board: [
      '....k...', '........', '........', '..p.p...',
      '...B....', '..P.P...', '........', '....K...'
    ],
    turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, gameOver: false
  });
  assert.deepEqual(destinations(pseudoMovesFor(state, 4, 3)), ['3,2', '3,4'], 'bishop can capture enemies but cannot pass through them or own pieces');

  state = stateFrom({ board: ['....k...', '........', '........', '........', '...Q....', '........', '........', '....K...'], turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 4, 0), 'queen moves horizontally');
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 1, 0), 'queen moves diagonally');

  state = stateFrom({ board: ['....k...', '........', '........', '........', '...R....', '........', '........', '....K...'], turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 0, 3), 'rook moves vertically');
  assert.ok(hasMove(pseudoMovesFor(state, 4, 3), 4, 7), 'rook moves horizontally');

  state = stateFrom({ board: ['....k...', '........', '........', '........', '........', '........', '........', '...K....'], turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  assert.ok(hasMove(pseudoMovesFor(state, 7, 3), 6, 4), 'king moves one square');

  state = stateFrom({ board: ['....r...', '........', '........', '........', '....B...', '........', '........', '....K...'], turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  assert.equal(legalMovesFor(state, 4, 4).length, 0, 'bishop pinned to king must not be allowed to expose check');
});

test('special rules: promotion, en passant, castling, castling restrictions, and castling rights', () => {
  let state = stateFrom({ board: ['....k...', 'P.......', '........', '........', '........', '........', '.......p', '....K...'], turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  const whitePromotion = legalMovesFor(state, 1, 0).find(m => m.to.r === 0 && m.to.c === 0);
  assert.equal(whitePromotion.promotion, 'Q');
  makeMove(state, whitePromotion);
  assert.equal(state.board[0][0], 'Q');

  state = stateFrom({ board: ['....k...', '........', '........', '........', '........', '........', '.......p', '....K...'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  const blackPromotion = legalMovesFor(state, 6, 7).find(m => m.to.r === 7 && m.to.c === 7);
  assert.equal(blackPromotion.promotion, 'q');

  state = stateFrom({ board: ['....k...', '........', '........', '...Pp...', '........', '........', '........', '....K...'], turn: 'w', enPassant: { r: 2, c: 4 }, castling: { K: false, Q: false, k: false, q: false } });
  const enPassant = legalMovesFor(state, 3, 3).find(m => m.enPassant);
  assert.ok(enPassant);
  makeMove(state, enPassant);
  assert.equal(state.board[2][4], 'P');
  assert.equal(state.board[3][4], '.');

  state = stateFrom({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true } });
  assert.ok(hasMove(legalMovesFor(state, 7, 4), 7, 6, 'castle'));
  assert.ok(hasMove(legalMovesFor(state, 7, 4), 7, 2, 'castle'));
  makeMove(state, legalMovesFor(state, 7, 4).find(m => m.castle === 'k'));
  assert.equal(state.board[7][6], 'K');
  assert.equal(state.board[7][5], 'R');
  assert.equal(state.castling.K, false);
  assert.equal(state.castling.Q, false);

  state = stateFrom({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K.NR'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true } });
  assert.equal(hasMove(legalMovesFor(state, 7, 4), 7, 6, 'castle'), false, 'blocked castling is illegal');
  state = stateFrom({ board: ['....k...', '........', '........', '........', '.....r..', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: false, q: false } });
  assert.equal(hasMove(legalMovesFor(state, 7, 4), 7, 6, 'castle'), false, 'cannot castle through attacked square');

  state = stateFrom({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true } });
  makeMove(state, { from: { r: 7, c: 0 }, to: { r: 7, c: 1 } });
  assert.equal(state.castling.Q, false);
  state = stateFrom({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true } });
  makeMove(state, { from: { r: 7, c: 7 }, to: { r: 0, c: 7 } });
  assert.equal(state.castling.k, false, 'capturing rook revokes opponent castling right');
});

test('game-end evaluation is pure and controller marks game over when showing the result', () => {
  const state = stateFrom({ board: ['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, gameOver: false });
  const result = getGameEnd(state);
  assert.deepEqual(result, { over: true, checkmate: true, color: 'b' });
  assert.equal(state.gameOver, false, 'getGameEnd must not mutate state');

  const view = createView();
  const controller = createGameController({ view });
  controller.setState({ board: state.board, turn: 'b', enPassant: null, castling: state.castling, gameOver: false });
  assert.equal(controller.showGameEndIfNeeded(), true);
  assert.equal(controller.getState().gameOver, true);
  assert.match(view.status, /checkmated/);
});

test('bot is deterministic with injected random and only makes legal moves', () => {
  const state = createGameState();
  makeMove(state, legalMovesFor(state, 6, 4).find(m => m.to.r === 4 && m.to.c === 4));
  state.turn = 'b';
  const beforeBot = state.board.map(r => r.join('')).join('/');

  assert.equal(makeBadBotMove(state, { random: () => 0, pawnBias: 0.7 }), true);
  assert.notEqual(state.board.map(r => r.join('')).join('/'), beforeBot);

  const locked = stateFrom({ board: ['....k...', '........', '........', '........', '........', '........', '........', '....K...'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false } });
  assert.equal(makeBadBotMove(locked, { random: () => 0 }), true);
  assert.equal(inCheck(locked, 'w'), false);
});

test('controller handles turn flow, selection, bot timer, and blocked clicks after game over', () => {
  const timers = [];
  const view = createView();
  const controller = createGameController({
    view,
    random: () => 0,
    setTimeoutFn(fn, delay) { timers.push({ fn, delay }); return timers.length; }
  });

  controller.newGame();
  assert.match(view.status, /White to move/);
  controller.selectSquare(0, 0);
  assert.match(view.status, /not your piece/);
  controller.selectSquare(7, 1);
  assert.match(view.status, /♘ selected/);
  assert.equal(controller.getState().legalForSelected.length, 2);
  controller.selectSquare(5, 0);
  assert.equal(controller.getState().turn, 'b');
  assert.equal(timers.length, 1);
  assert.match(view.status, /Bot thinking/);
  timers[0].fn();
  assert.equal(controller.getState().turn, 'w');
  assert.match(view.status, /Your move|CHECK/);

  controller.setState({ board: ['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, gameOver: false });
  assert.equal(controller.showGameEndIfNeeded(), true);
  const before = controller.getState().board.map(r => r.join('')).join('/');
  controller.selectSquare(1, 1);
  assert.equal(controller.getState().board.map(r => r.join('')).join('/'), before);
});
