import test from 'node:test';
import assert from 'node:assert/strict';

function createClassList(el) {
  const set = new Set();
  const sync = () => { el._className = [...set].join(' '); };
  return {
    add(...names) { names.forEach(n => set.add(n)); sync(); },
    remove(...names) { names.forEach(n => set.delete(n)); sync(); },
    contains(name) { return set.has(name); },
    toString() { return [...set].join(' '); },
    _set(value) { set.clear(); String(value || '').split(/\s+/).filter(Boolean).forEach(n => set.add(n)); sync(); }
  };
}

class ElementStub {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = { values: {}, setProperty: (k, v) => { this.style.values[k] = v; }, removeProperty: k => { delete this.style.values[k]; } };
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

let importCounter = 0;

async function loadApp({ random = () => 0.99 } = {}) {
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
  const math = Object.create(Math);
  math.random = random;
  const window = {
    document,
    Math: math,
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
    AudioContext: function AudioContext() {},
    webkitAudioContext: function WebkitAudioContext() {}
  };
  Object.assign(globalThis, window, { window });
  await import(`../app.js?test=${++importCounter}`);
  const api = globalThis.window.__badChess;
  return { api, ids, timers, context: window };
}

const empty = [
  '........', '........', '........', '........',
  '........', '........', '........', '........'
];
const destinations = moves => JSON.parse(JSON.stringify(moves.map(m => `${m.to.r},${m.to.c}`).sort()));
const hasMove = (moves, r, c, prop) => moves.some(m => m.to.r === r && m.to.c === c && (!prop || m[prop]));

test('core move generator covers initial moves, piece movement, blocking, captures, and pinned pieces', async () => {
  const { api } = await loadApp();

  assert.equal(api.allLegalMoves('w').length, 20);
  assert.equal(api.allLegalMoves('b').length, 20);
  assert.deepEqual(destinations(api.legalMovesFor(7, 1)), ['5,0', '5,2']);
  assert.deepEqual(destinations(api.legalMovesFor(6, 4)), ['4,4', '5,4']);

  api.setState({
    board: [
      '....k...', '........', '........', '..p.p...',
      '...B....', '..P.P...', '........', '....K...'
    ],
    turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false
  });
  assert.deepEqual(destinations(api.pseudoMovesFor(4, 3)), ['3,2', '3,4'], 'bishop can capture enemies but cannot pass through them or own pieces');

  api.setState({
    board: [
      '....k...', '........', '........', '........',
      '...Q....', '........', '........', '....K...'
    ],
    turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false
  });
  assert.ok(hasMove(api.pseudoMovesFor(4, 3), 4, 0), 'queen moves horizontally');
  assert.ok(hasMove(api.pseudoMovesFor(4, 3), 1, 0), 'queen moves diagonally');
  api.setState({
    board: [
      '....k...', '........', '........', '........',
      '...R....', '........', '........', '....K...'
    ],
    turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false
  });
  assert.ok(hasMove(api.pseudoMovesFor(4, 3), 0, 3), 'rook moves vertically');
  assert.ok(hasMove(api.pseudoMovesFor(4, 3), 4, 7), 'rook moves horizontally');
  api.setState({
    board: [
      '....k...', '........', '........', '........',
      '........', '........', '........', '...K....'
    ],
    turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false
  });
  assert.ok(hasMove(api.pseudoMovesFor(7, 3), 6, 4), 'king moves one square');

  api.setState({
    board: [
      '....r...', '........', '........', '........',
      '....B...', '........', '........', '....K...'
    ],
    turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false
  });
  assert.equal(api.legalMovesFor(4, 4).length, 0, 'bishop pinned to king must not be allowed to expose check');
});

test('special rules: promotion, en passant, castling, castling restrictions, and castling rights', async () => {
  const { api } = await loadApp();

  api.setState({ board: ['....k...', 'P.......', '........', '........', '........', '........', '.......p', '....K...'], turn: 'w', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
  let whitePromotion = api.legalMovesFor(1, 0).find(m => m.to.r === 0 && m.to.c === 0);
  assert.equal(whitePromotion.promotion, 'Q');
  api.makeMove(whitePromotion);
  assert.equal(api.getState().board[0][0], 'Q');
  api.setState({ board: ['....k...', '........', '........', '........', '........', '........', '.......p', '....K...'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
  let blackPromotion = api.legalMovesFor(6, 7).find(m => m.to.r === 7 && m.to.c === 7);
  assert.equal(blackPromotion.promotion, 'q');

  api.setState({ board: ['....k...', '........', '........', '...Pp...', '........', '........', '........', '....K...'], turn: 'w', enPassant: { r: 2, c: 4 }, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
  const enPassant = api.legalMovesFor(3, 3).find(m => m.enPassant);
  assert.ok(enPassant);
  api.makeMove(enPassant);
  let state = api.getState();
  assert.equal(state.board[2][4], 'P');
  assert.equal(state.board[3][4], '.');

  api.setState({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true }, selected: null, legalForSelected: [], gameOver: false });
  assert.ok(hasMove(api.legalMovesFor(7, 4), 7, 6, 'castle'));
  assert.ok(hasMove(api.legalMovesFor(7, 4), 7, 2, 'castle'));
  api.makeMove(api.legalMovesFor(7, 4).find(m => m.castle === 'k'));
  state = api.getState();
  assert.equal(state.board[7][6], 'K');
  assert.equal(state.board[7][5], 'R');
  assert.equal(state.castling.K, false);
  assert.equal(state.castling.Q, false);

  api.setState({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K.NR'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true }, selected: null, legalForSelected: [], gameOver: false });
  assert.equal(hasMove(api.legalMovesFor(7, 4), 7, 6, 'castle'), false, 'blocked castling is illegal');
  api.setState({ board: ['....k...', '........', '........', '........', '.....r..', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
  assert.equal(hasMove(api.legalMovesFor(7, 4), 7, 6, 'castle'), false, 'cannot castle through attacked square');

  api.setState({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true }, selected: null, legalForSelected: [], gameOver: false });
  api.makeMove({ from: { r: 7, c: 0 }, to: { r: 7, c: 1 } });
  assert.equal(api.getState().castling.Q, false);
  api.setState({ board: ['r...k..r', '........', '........', '........', '........', '........', '........', 'R...K..R'], turn: 'w', enPassant: null, castling: { K: true, Q: true, k: true, q: true }, selected: null, legalForSelected: [], gameOver: false });
  api.makeMove({ from: { r: 7, c: 7 }, to: { r: 0, c: 7 } });
  assert.equal(api.getState().castling.k, false, 'capturing rook revokes opponent castling right');
});

test('bot turn is deterministic under fake timers/random and only makes legal moves', async () => {
  const randomValues = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0];
  const { api, ids, timers } = await loadApp({ random: () => randomValues.shift() ?? 0.99 });
  ids.chaos.checked = false;
  api.render();
  ids.board.children.find(sq => sq.dataset.r === 6 && sq.dataset.c === 4).click();
  ids.board.children.find(sq => sq.dataset.r === 4 && sq.dataset.c === 4).click();

  assert.equal(api.getState().turn, 'b');
  assert.equal(timers.length, 1);
  assert.match(ids.status.textContent, /Bot thinking/);
  const beforeBot = api.getState().board.map(r => r.join('')).join('/');
  timers[0].fn();
  const afterBot = api.getState();
  assert.equal(afterBot.turn, 'w');
  assert.notEqual(afterBot.board.map(r => r.join('')).join('/'), beforeBot);
  assert.match(ids.status.textContent, /Your move|CHECK/);

  api.setState({ board: ['....k...', '........', '........', '........', '........', '........', '........', '....K...'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: true });
  const locked = api.getState().board.map(r => r.join('')).join('/');
  api.botMove();
  assert.equal(api.getState().board.map(r => r.join('')).join('/'), locked);
});

test('checkmate and stalemate set game over and block further clicks', async () => {
  const { api, ids } = await loadApp();
  ids.chaos.checked = false;

  api.setState({ board: ['k.......', '.Q......', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
  assert.equal(api.checkGameEnd(), true);
  assert.match(ids.status.textContent, /checkmated/);
  assert.equal(api.getState().gameOver, true);
  const before = api.getState().board.map(r => r.join('')).join('/');
  api.render();
  ids.board.children.find(sq => sq.dataset.r === 1 && sq.dataset.c === 1).click();
  assert.equal(api.getState().board.map(r => r.join('')).join('/'), before);

  api.setState({ board: ['k.......', '..Q.....', 'K.......', '........', '........', '........', '........', '........'], turn: 'b', enPassant: null, castling: { K: false, Q: false, k: false, q: false }, selected: null, legalForSelected: [], gameOver: false });
  assert.equal(api.checkGameEnd(), true);
  assert.match(ids.status.textContent, /Stalemate/);
});

test('rendering and click-selection UI behavior is covered, including chaos glitches', async () => {
  const randomValues = [0.01, 0.99, 0.99, 0.99, 0.99, 0.99];
  const { api, ids } = await loadApp({ random: () => randomValues.shift() ?? 0.99 });
  assert.equal(ids.board.children.length, 64);
  assert.match(ids.board.children[0].innerHTML, /♜/);
  assert.ok(ids.board.children.some(sq => sq.classList.contains('glitch')));

  ids.chaos.checked = false;
  api.newGame();
  const blackRook = ids.board.children.find(sq => sq.dataset.r === 0 && sq.dataset.c === 0);
  blackRook.click();
  assert.match(ids.status.textContent, /not your piece/);

  const whiteKnight = ids.board.children.find(sq => sq.dataset.r === 7 && sq.dataset.c === 1);
  whiteKnight.click();
  assert.match(ids.status.textContent, /♘ selected/);
  assert.ok(ids.board.children.find(sq => sq.dataset.r === 7 && sq.dataset.c === 1).classList.contains('selected'));
  assert.equal(ids.board.children.filter(sq => sq.classList.contains('legal')).length, 2);
});
