import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameController } from '../public/game-controller.js';
import { boardKey } from './helpers.js';

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
