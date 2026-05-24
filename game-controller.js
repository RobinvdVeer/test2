import { allLegalMoves, legalMovesFor, makeMove } from './public/chess-engine.js';
import { createGameControllerSession } from './public/game-controller.js';

export { createGameControllerSession } from './public/game-controller.js';

export function createGameController(options) {
  const { controller, internals } = createGameControllerSession(options);

  function setState(next = {}) {
    const game = internals.game;
    if (next.board) game.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
    if ('turn' in next) game.turn = next.turn;
    if ('selected' in next) internals.selected = next.selected;
    if ('legalForSelected' in next) internals.legalForSelected = next.legalForSelected;
    if ('enPassant' in next) game.enPassant = next.enPassant;
    if ('castling' in next) game.castling = { ...next.castling };
    if ('gameOver' in next) game.gameOver = next.gameOver;
  }

  function getState() {
    const game = internals.game;
    return {
      board: game.board.map(row => row.slice()),
      turn: game.turn,
      selected: internals.selected,
      legalForSelected: internals.legalForSelected.slice(),
      enPassant: game.enPassant,
      castling: { ...game.castling },
      gameOver: game.gameOver
    };
  }

  function showGameEndIfNeeded() {
    return internals.showGameEndIfNeeded().over;
  }

  function botMove(cachedMoves = null) {
    const result = internals.botMove(cachedMoves);
    return result && typeof result.over === 'boolean' ? result.over : result;
  }

  return {
    ...controller,
    afterPlayerMove: internals.afterPlayerMove,
    botMove,
    showGameEndIfNeeded,
    setState,
    getState,
    allLegalMoves(color) { return allLegalMoves(internals.game, color); },
    legalMovesFor(r, c) { return legalMovesFor(internals.game, r, c); },
    makeMove(move) { return makeMove(internals.game, move); }
  };
}
