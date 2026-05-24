const PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

const start = [
  'rnbqkbnr', 'pppppppp', '........', '........',
  '........', '........', 'PPPPPPPP', 'RNBQKBNR'
];

let board, turn, selected, legalForSelected, enPassant, castling, gameOver, kingPos;
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const chaosEl = document.getElementById('chaos');
const squareEls = [];

function newGame() {
  board = start.map(row => row.split(''));
  turn = 'w';
  selected = null;
  legalForSelected = [];
  enPassant = null;
  castling = { K: true, Q: true, k: true, q: true };
  kingPos = { w: { r: 7, c: 4 }, b: { r: 0, c: 4 } };
  gameOver = false;
  setStatus('White to move. The bot is already sweating pixels.');
  render();
}

function colorOf(p) {
  if (!p || p === '.') return null;
  return p === p.toUpperCase() ? 'w' : 'b';
}
function enemy(c) { return c === 'w' ? 'b' : 'w'; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function same(a, b) { return a && b && a.r === b.r && a.c === b.c; }

function initBoardDom() {
  const fragment = document.createDocumentFragment();
  for (let r = 0; r < 8; r++) {
    squareEls[r] = [];
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('button');
      sq.dataset.r = r; sq.dataset.c = c;
      squareEls[r][c] = sq;
      fragment.appendChild(sq);
    }
  }
  boardEl.appendChild(fragment);
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
      if (chaosEl.checked && Math.random() < 0.08) {
        sq.classList.add('glitch');
        sq.style.setProperty('--x', `${Math.floor(Math.random() * 13) - 6}px`);
        sq.style.setProperty('--y', `${Math.floor(Math.random() * 13) - 6}px`);
        sq.style.setProperty('--r', `${Math.floor(Math.random() * 9) - 4}deg`);
      }
      const p = board[r][c];
      if (sq.dataset.piece !== p) {
        sq.dataset.piece = p;
        sq.innerHTML = p === '.' ? '' : `<span class="piece ${colorOf(p) === 'w' ? 'white' : 'black'}">${PIECES[p]}</span>`;
      }
    }
  }
}

function onSquareClick(sq) {
  if (gameOver || turn !== 'w') return;
  const r = +sq.dataset.r;
  const c = +sq.dataset.c;
  const p = board[r][c];

  if (selected) {
    const move = legalForSelected.find(m => m.to.r === r && m.to.c === c);
    if (move) {
      makeMove(move);
      selected = null; legalForSelected = [];
      afterMove();
      return;
    }
  }

  if (colorOf(p) === 'w') {
    selected = { r, c };
    legalForSelected = legalMovesFor(r, c);
    setStatus(`${PIECES[p]} selected. ${legalForSelected.length || 'Zero'} legal moves, which is probably your fault.`);
  } else {
    selected = null; legalForSelected = [];
    setStatus('That is not your piece. Bad chess, not theft chess.');
  }
  render();
}

function afterMove() {
  turn = 'b';
  render();
  if (checkGameEnd()) return;
  setStatus('Bot thinking very incorrectly...');
  setTimeout(botMove, 550 + Math.random() * 700);
}

function botMove() {
  if (gameOver) return;
  const moves = allLegalMoves('b');
  if (!moves.length) return checkGameEnd();
  // Bad bot: heavily prefers random pawn moves, otherwise random chaos.
  const pawnMoves = moves.filter(m => board[m.from.r][m.from.c].toLowerCase() === 'p');
  const pool = pawnMoves.length && Math.random() < 0.7 ? pawnMoves : moves;
  makeMove(pool[Math.floor(Math.random() * pool.length)]);
  turn = 'w';
  render();
  if (!checkGameEnd()) setStatus(inCheck('w') ? 'CHECK! The bot did that by accident.' : 'Your move. The bot regrets nothing.');
}

function setStatus(s) { statusEl.textContent = s; }

function allLegalMoves(color) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (colorOf(board[r][c]) === color) out.push(...legalMovesFor(r, c));
  }
  return out;
}

function legalMovesFor(r, c) {
  const color = colorOf(board[r][c]);
  return pseudoMovesFor(r, c).filter(m => isLegalMove(m, color));
}

function isLegalMove(m, color) {
  const undo = applyMoveInPlace(board, m);
  const legal = !isInCheck(board, color);
  undoMove(board, undo);
  return legal;
}

function hasAnyLegalMove(color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (colorOf(board[r][c]) !== color) continue;
    const moves = pseudoMovesFor(r, c);
    for (const move of moves) if (isLegalMove(move, color)) return true;
  }
  return false;
}

function pseudoMovesFor(r, c) {
  const p = board[r][c];
  const color = colorOf(p);
  if (!color) return [];
  const moves = [];
  const add = (rr, cc, extra = {}) => {
    if (!inBounds(rr, cc)) return;
    if (colorOf(board[rr][cc]) !== color) moves.push({ from: { r, c }, to: { r: rr, c: cc }, ...extra });
  };
  const slide = dirs => dirs.forEach(([dr, dc]) => {
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc)) {
      if (board[rr][cc] === '.') add(rr, cc);
      else { if (colorOf(board[rr][cc]) !== color) add(rr, cc); break; }
      rr += dr; cc += dc;
    }
  });

  switch (p.toLowerCase()) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoteRow = color === 'w' ? 0 : 7;
      if (inBounds(r + dir, c) && board[r + dir][c] === '.') {
        add(r + dir, c, r + dir === promoteRow ? { promotion: color === 'w' ? 'Q' : 'q' } : {});
        if (r === startRow && board[r + 2 * dir][c] === '.') add(r + 2 * dir, c, { doublePawn: true });
      }
      for (const dc of [-1, 1]) {
        const rr = r + dir, cc = c + dc;
        if (!inBounds(rr, cc)) continue;
        if (board[rr][cc] !== '.' && colorOf(board[rr][cc]) !== color) add(rr, cc, rr === promoteRow ? { promotion: color === 'w' ? 'Q' : 'q' } : {});
        if (enPassant && enPassant.r === rr && enPassant.c === cc) add(rr, cc, { enPassant: true });
      }
      break;
    }
    case 'n': [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => add(r+dr,c+dc)); break;
    case 'b': slide([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case 'r': slide([[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'q': slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'k': {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => add(r+dr,c+dc));
      if (!isInCheck(board, color)) {
        const home = color === 'w' ? 7 : 0;
        const kFlag = color === 'w' ? 'K' : 'k';
        const qFlag = color === 'w' ? 'Q' : 'q';
        if (r === home && c === 4 && castling[kFlag] && board[home][5] === '.' && board[home][6] === '.' && !squareAttacked(board, home, 5, enemy(color)) && !squareAttacked(board, home, 6, enemy(color))) add(home, 6, { castle: 'k' });
        if (r === home && c === 4 && castling[qFlag] && board[home][1] === '.' && board[home][2] === '.' && board[home][3] === '.' && !squareAttacked(board, home, 3, enemy(color)) && !squareAttacked(board, home, 2, enemy(color))) add(home, 2, { castle: 'q' });
      }
      break;
    }
  }
  return moves;
}

function makeMove(m) {
  const p = board[m.from.r][m.from.c];
  updateCastlingRights(m, p);
  applyMoveTo(board, m);
  enPassant = m.doublePawn ? { r: (m.from.r + m.to.r) / 2, c: m.from.c } : null;
}

function applyMoveTo(b, m) {
  applyMoveInPlace(b, m);
}

function applyMoveInPlace(b, m) {
  const p = b[m.from.r][m.from.c];
  const capturedAt = m.enPassant ? { r: m.from.r, c: m.to.c } : { r: m.to.r, c: m.to.c };
  const undo = {
    move: m,
    piece: p,
    captured: b[capturedAt.r][capturedAt.c],
    capturedAt,
    rook: null,
    previousKing: b === board && p.toLowerCase() === 'k' ? { ...kingPos[colorOf(p)] } : null
  };
  b[m.from.r][m.from.c] = '.';
  if (m.enPassant) b[m.from.r][m.to.c] = '.';
  b[m.to.r][m.to.c] = m.promotion || p;
  if (b === board && p.toLowerCase() === 'k') kingPos[colorOf(p)] = { r: m.to.r, c: m.to.c };
  if (m.castle === 'k') {
    undo.rook = { from: { r: m.to.r, c: 7 }, to: { r: m.to.r, c: 5 }, piece: b[m.to.r][7] };
    b[m.to.r][5] = b[m.to.r][7]; b[m.to.r][7] = '.';
  }
  if (m.castle === 'q') {
    undo.rook = { from: { r: m.to.r, c: 0 }, to: { r: m.to.r, c: 3 }, piece: b[m.to.r][0] };
    b[m.to.r][3] = b[m.to.r][0]; b[m.to.r][0] = '.';
  }
  return undo;
}

function undoMove(b, undo) {
  const m = undo.move;
  b[m.from.r][m.from.c] = undo.piece;
  b[m.to.r][m.to.c] = '.';
  b[undo.capturedAt.r][undo.capturedAt.c] = undo.captured;
  if (undo.rook) {
    b[undo.rook.from.r][undo.rook.from.c] = undo.rook.piece;
    b[undo.rook.to.r][undo.rook.to.c] = '.';
  }
  if (undo.previousKing) kingPos[colorOf(undo.piece)] = undo.previousKing;
}

function updateCastlingRights(m, p) {
  if (p === 'K') castling.K = castling.Q = false;
  if (p === 'k') castling.k = castling.q = false;
  if (p === 'R' && m.from.r === 7 && m.from.c === 0) castling.Q = false;
  if (p === 'R' && m.from.r === 7 && m.from.c === 7) castling.K = false;
  if (p === 'r' && m.from.r === 0 && m.from.c === 0) castling.q = false;
  if (p === 'r' && m.from.r === 0 && m.from.c === 7) castling.k = false;
  if (m.to.r === 7 && m.to.c === 0) castling.Q = false;
  if (m.to.r === 7 && m.to.c === 7) castling.K = false;
  if (m.to.r === 0 && m.to.c === 0) castling.q = false;
  if (m.to.r === 0 && m.to.c === 7) castling.k = false;
}

function inCheck(color) { return isInCheck(board, color); }
function isInCheck(b, color) {
  let king = b === board ? kingPos[color] : null;
  if (!king) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] === (color === 'w' ? 'K' : 'k')) king = { r, c };
  }
  return king ? squareAttacked(b, king.r, king.c, enemy(color)) : true;
}

function squareAttacked(b, r, c, byColor) {
  for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
    const p = b[rr][cc];
    if (colorOf(p) !== byColor) continue;
    if (attacksSquare(b, rr, cc, r, c)) return true;
  }
  return false;
}

function attacksSquare(b, r, c, tr, tc) {
  const p = b[r][c].toLowerCase();
  const col = colorOf(b[r][c]);
  const dr = tr - r, dc = tc - c;
  if (p === 'p') return dr === (col === 'w' ? -1 : 1) && Math.abs(dc) === 1;
  if (p === 'n') return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
  if (p === 'k') return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
  const clear = (sr, sc) => { let rr = r + sr, cc = c + sc; while (rr !== tr || cc !== tc) { if (b[rr][cc] !== '.') return false; rr += sr; cc += sc; } return true; };
  if (p === 'b' || p === 'q') if (Math.abs(dr) === Math.abs(dc) && clear(Math.sign(dr), Math.sign(dc))) return true;
  if (p === 'r' || p === 'q') if ((dr === 0 || dc === 0) && clear(Math.sign(dr), Math.sign(dc))) return true;
  return false;
}

function checkGameEnd() {
  if (hasAnyLegalMove(turn)) return false;
  gameOver = true;
  setStatus(inCheck(turn) ? `${turn === 'w' ? 'White' : 'Black'} is checkmated. Incredible and upsetting.` : 'Stalemate. Nobody wins, especially chess.');
  return true;
}

boardEl.addEventListener('click', e => {
  const sq = e.target.closest('.square');
  if (sq && boardEl.contains(sq)) onSquareClick(sq);
});
document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('noiseBtn').addEventListener('click', () => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square'; osc.frequency.value = 160 + Math.random() * 900;
  gain.gain.value = 0.05;
  osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.15);
});
chaosEl.addEventListener('change', render);
initBoardDom();
newGame();
