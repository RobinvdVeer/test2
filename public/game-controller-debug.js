import { allLegalMoves, colorOf, inCheck, legalMovesFor, makeMove, pseudoMovesFor } from './chess-engine.js';

export const DEBUG_API = Symbol('BadChess.debugApi');

export function getGameControllerDebugApi(controller) {
  return controller[DEBUG_API];
}

export function attachGameControllerDebugApi(controller, internals) {
  function setState(next = {}) {
    const game = internals.getGame();
    if (next.board) game.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
    if ('turn' in next) game.turn = next.turn;
    if ('selected' in next) internals.setSelected(next.selected);
    if ('legalForSelected' in next) internals.setLegalForSelected(next.legalForSelected);
    if ('enPassant' in next) game.enPassant = next.enPassant;
    if ('castling' in next) game.castling = { ...next.castling };
    if ('gameOver' in next) game.gameOver = next.gameOver;
  }

  function getState() {
    const game = internals.getGame();
    return {
      board: game.board.map(row => row.slice()),
      turn: game.turn,
      selected: internals.getSelected(),
      legalForSelected: internals.getLegalForSelected().slice(),
      enPassant: game.enPassant,
      castling: { ...game.castling },
      gameOver: game.gameOver
    };
  }

  Object.defineProperty(controller, DEBUG_API, {
    value: {
      newGame: controller.newGame,
      render: controller.render,
      selectSquare: controller.selectSquare,
      afterMove: internals.afterPlayerMove,
      botMove: internals.botMove,
      checkGameEnd() { return internals.showGameEndIfNeeded().over; },
      inCheck(color) { return inCheck(internals.getGame(), color); },
      colorOf,
      setState,
      getState,
      allLegalMoves(color) { return allLegalMoves(internals.getGame(), color); },
      legalMovesFor(r, c) { return legalMovesFor(internals.getGame(), r, c); },
      pseudoMovesFor(r, c) { return pseudoMovesFor(internals.getGame(), r, c); },
      makeMove(move) { return makeMove(internals.getGame(), move); }
    }
  });
}
