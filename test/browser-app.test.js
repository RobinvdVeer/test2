import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/chess-engine.js';
import { createDomBoardView } from '../public/board-view.js';
import { ElementStub, boardKey, loadApp, squareAt } from './helpers.js';

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
