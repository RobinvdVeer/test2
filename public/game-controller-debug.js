import { allLegalMoves, colorOf, inCheck, legalMovesFor, makeMove, pseudoMovesFor } from './chess-engine.js';
import { createGameControllerSession } from './game-controller.js';

export function createDebuggableGameController(options) {
  const { controller, internals } = createGameControllerSession(options);
  return { controller, debugApi: createGameControllerDebugApi(internals) };
}

function createGameControllerDebugApi(internals) {
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

  return {
    newGame: internals.newGame,
    render: internals.render,
    selectSquare: internals.selectSquare,
    afterMove: internals.afterPlayerMove,
    botMove: internals.botMove,
    checkGameEnd() { return internals.showGameEndIfNeeded().over; },
    inCheck(color) { return inCheck(internals.game, color); },
    colorOf,
    setState,
    getState,
    allLegalMoves(color) { return allLegalMoves(internals.game, color); },
    legalMovesFor(r, c) { return legalMovesFor(internals.game, r, c); },
    pseudoMovesFor(r, c) { return pseudoMovesFor(internals.game, r, c); },
    makeMove(move) { return makeMove(internals.game, move); }
  };
}
