import test from 'node:test';
import assert from 'node:assert/strict';
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
import { destinations, hasMove, stateFrom } from './helpers.js';

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
