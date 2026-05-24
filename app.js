import { PIECES, checkGameEnd, colorOf, createGameState, inCheck, legalMovesFor, makeMove } from './chess-engine.js';
import { makeBadBotMove } from './bot.js';
import { playBadNoise } from './audio.js';

let game = createGameState();
let selected = null;
let legalForSelected = [];

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const chaosEl = document.getElementById('chaos');

function newGame() {
  game = createGameState();
  selected = null;
  legalForSelected = [];
  setStatus('White to move. The bot is already sweating pixels.');
  render();
}

function render() {
  boardEl.innerHTML = '';
  const legalKeys = new Set(legalForSelected.map(m => `${m.to.r},${m.to.c}`));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('button');
      sq.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
      if (legalKeys.has(`${r},${c}`)) sq.classList.add('legal');
      maybeAddGlitch(sq);
      sq.dataset.r = r;
      sq.dataset.c = c;
      sq.innerHTML = pieceHtml(game.board[r][c]);
      sq.addEventListener('click', onSquareClick);
      boardEl.appendChild(sq);
    }
  }
}

function maybeAddGlitch(square) {
  if (!chaosEl.checked || Math.random() >= 0.08) return;
  square.classList.add('glitch');
  square.style.setProperty('--x', `${Math.floor(Math.random() * 13) - 6}px`);
  square.style.setProperty('--y', `${Math.floor(Math.random() * 13) - 6}px`);
  square.style.setProperty('--r', `${Math.floor(Math.random() * 9) - 4}deg`);
}

function pieceHtml(piece) {
  return piece === '.' ? '' : `<span class="piece ${colorOf(piece) === 'w' ? 'white' : 'black'}">${PIECES[piece]}</span>`;
}

function onSquareClick(e) {
  if (game.gameOver || game.turn !== 'w') return;
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  const p = game.board[r][c];

  if (selected) {
    const move = legalForSelected.find(m => m.to.r === r && m.to.c === c);
    if (move) {
      makeMove(game, move);
      selected = null;
      legalForSelected = [];
      afterPlayerMove();
      return;
    }
  }

  if (colorOf(p) === 'w') {
    selected = { r, c };
    legalForSelected = legalMovesFor(game, r, c);
    setStatus(`${PIECES[p]} selected. ${legalForSelected.length || 'Zero'} legal moves, which is probably your fault.`);
  } else {
    selected = null;
    legalForSelected = [];
    setStatus('That is not your piece. Bad chess, not theft chess.');
  }
  render();
}

function afterPlayerMove() {
  game.turn = 'b';
  render();
  if (showGameEndIfNeeded()) return;
  setStatus('Bot thinking very incorrectly...');
  setTimeout(botMove, 550 + Math.random() * 700);
}

function botMove() {
  if (game.gameOver) return;
  if (!makeBadBotMove(game)) return showGameEndIfNeeded();
  game.turn = 'w';
  render();
  if (!showGameEndIfNeeded()) setStatus(inCheck(game, 'w') ? 'CHECK! The bot did that by accident.' : 'Your move. The bot regrets nothing.');
}

function showGameEndIfNeeded() {
  const result = checkGameEnd(game);
  if (!result.over) return false;
  const side = result.color === 'w' ? 'White' : 'Black';
  setStatus(result.checkmate ? `${side} is checkmated. Incredible and upsetting.` : 'Stalemate. Nobody wins, especially chess.');
  return true;
}

function setStatus(s) { statusEl.textContent = s; }

document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('noiseBtn').addEventListener('click', playBadNoise);
chaosEl.addEventListener('change', render);
newGame();
