import test from 'node:test';
import assert from 'node:assert/strict';
import { allLegalMoves, createGameState, inCheck, legalMovesFor, makeMove } from '../public/chess-engine.js';
import { chooseBadBotMove, makeBadBotMove } from '../public/bot.js';
import { applyMoveForTest, boardKey, stateFrom } from './helpers.js';

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
