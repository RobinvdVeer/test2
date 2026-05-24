import { colorOf } from './chess-engine.js';
import { PIECES } from './piece-symbols.js';

export function createDomBoardView({ boardEl, statusEl, chaosEl, onSquareClick, random = Math.random, glitch = {} }) {
  const squareEls = [];
  const config = {
    probability: 0.08,
    maxOffsetPx: 6,
    maxRotationDeg: 4,
    ...glitch
  };

  function init() {
    for (let r = 0; r < 8; r++) {
      squareEls[r] = [];
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('button');
        sq.dataset.r = r;
        sq.dataset.c = c;
        sq.addEventListener('click', () => onSquareClick(r, c));
        squareEls[r][c] = sq;
        boardEl.appendChild(sq);
      }
    }
  }

  function render(game, { selected = null, legalForSelected = [] } = {}) {
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
    if (!chaosEl.checked || random() >= config.probability) return;
    square.classList.add('glitch');
    square.style.setProperty('--x', `${randomSignedInt(config.maxOffsetPx)}px`);
    square.style.setProperty('--y', `${randomSignedInt(config.maxOffsetPx)}px`);
    square.style.setProperty('--r', `${randomSignedInt(config.maxRotationDeg)}deg`);
  }

  function randomSignedInt(maxAbs) {
    return Math.floor(random() * (maxAbs * 2 + 1)) - maxAbs;
  }

  function pieceHtml(piece) {
    return piece === '.' ? '' : `<span class="piece ${colorOf(piece) === 'w' ? 'white' : 'black'}">${PIECES[piece]}</span>`;
  }

  init();
  return {
    render,
    setStatus(status) { statusEl.textContent = status; }
  };
}
