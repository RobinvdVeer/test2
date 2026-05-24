import { PIECES, allLegalMoves as engineAllLegalMoves, checkGameEnd, colorOf, createGameState, inCheck, legalMovesFor as engineLegalMovesFor, makeMove as engineMakeMove } from './chess-engine.js';
import { makeBadBotMove } from './bot.js';
import { playBadNoise } from './audio.js';

let game = createGameState();
let selected = null;
let legalForSelected = [];

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const chaosEl = document.getElementById('chaos');
const squareEls = [];

function initBoardDom() {
  for (let r = 0; r < 8; r++) {
    squareEls[r] = [];
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('button');
      sq.dataset.r = r;
      sq.dataset.c = c;
      sq.addEventListener('click', onSquareClick);
      squareEls[r][c] = sq;
      boardEl.appendChild(sq);
    }
  }
}

function newGame() {
  game = createGameState();
  selected = null;
  legalForSelected = [];
  setStatus('White to move. The bot is already sweating pixels.');
  render();
}

function render() {
  const legalKeys = new Set(legalForSelected.map(m => `${m.to.r},${m.to.c}`));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = squareEls[r][c];
      sq.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
      sq.style.removeProperty('--x');
      sq.style.removeProperty('--y');
      sq.style.removeProperty('--r');
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
      if (legalKeys.has(`${r},${c}`)) sq.classList.add('legal');
      maybeAddGlitch(sq);
      const piece = game.board[r][c];
      if (sq.dataset.piece !== piece) {
        sq.dataset.piece = piece;
        sq.innerHTML = pieceHtml(piece);
      }
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
  const sq = e.currentTarget || e;
  const r = +sq.dataset.r;
  const c = +sq.dataset.c;
  const p = game.board[r][c];

  if (selected) {
    const move = legalForSelected.find(m => m.to.r === r && m.to.c === c);
    if (move) {
      engineMakeMove(game, move);
      selected = null;
      legalForSelected = [];
      afterPlayerMove();
      return;
    }
  }

  if (colorOf(p) === 'w') {
    selected = { r, c };
    legalForSelected = engineLegalMovesFor(game, r, c);
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

function cloneBoard() { return game.board.map(row => row.slice()); }

if (typeof window !== 'undefined') {
  window.__badChess = {
    newGame,
    render,
    onSquareClick,
    afterMove: afterPlayerMove,
    botMove,
    allLegalMoves(color) { return engineAllLegalMoves(game, color); },
    legalMovesFor(r, c) { return engineLegalMovesFor(game, r, c); },
    makeMove(move) { return engineMakeMove(game, move); },
    checkGameEnd: showGameEndIfNeeded,
    inCheck(color) { return inCheck(game, color); },
    colorOf,
    setState(next = {}) {
      if (next.board) game.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
      if ('turn' in next) game.turn = next.turn;
      if ('selected' in next) selected = next.selected;
      if ('legalForSelected' in next) legalForSelected = next.legalForSelected;
      if ('enPassant' in next) game.enPassant = next.enPassant;
      if ('castling' in next) game.castling = { ...next.castling };
      if ('gameOver' in next) game.gameOver = next.gameOver;
    },
    getState() {
      return {
        board: cloneBoard(),
        turn: game.turn,
        selected,
        legalForSelected: legalForSelected.slice(),
        enPassant: game.enPassant,
        castling: { ...game.castling },
        gameOver: game.gameOver
      };
    }
  };
}

document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('noiseBtn').addEventListener('click', playBadNoise);
chaosEl.addEventListener('change', render);
initBoardDom();
newGame();
