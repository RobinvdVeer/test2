export const START = [
  'rnbqkbnr', 'pppppppp', '........', '........',
  '........', '........', 'PPPPPPPP', 'RNBQKBNR'
];

export function createGameState() {
  return {
    board: START.map(row => row.split('')),
    turn: 'w',
    enPassant: null,
    castling: { K: true, Q: true, k: true, q: true },
    gameOver: false
  };
}

export function colorOf(p) {
  if (!p || p === '.') return null;
  return p === p.toUpperCase() ? 'w' : 'b';
}

export function enemy(c) { return c === 'w' ? 'b' : 'w'; }
export function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
export function pieceAt(state, r, c) { return state.board[r][c]; }
