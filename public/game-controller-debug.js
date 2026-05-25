import { allLegalMoves, colorOf, inCheck, legalMovesFor, makeMove, pseudoMovesFor } from './chess-engine.js';
import { createGameControllerSession } from './game-controller.js';

export function createDebuggableGameController(options) {
  const { controller, internals } = createGameControllerSession(options);
  return { controller, debugApi: createGameControllerDebugApi(controller, internals) };
}

function createGameControllerDebugApi(controller, internals) {
  return {
    newGame: internals.newGame,
    render: internals.render,
    selectSquare: internals.selectSquare,
    afterMove: internals.afterPlayerMove,
    botMove: internals.botMove,
    checkGameEnd() { return internals.showGameEndIfNeeded().over; },
    inCheck(color) { return inCheck(internals.game, color); },
    colorOf,
    setState: controller.setState,
    getState: controller.getState,
    allLegalMoves(color) { return allLegalMoves(internals.game, color); },
    legalMovesFor(r, c) { return legalMovesFor(internals.game, r, c); },
    pseudoMovesFor(r, c) { return pseudoMovesFor(internals.game, r, c); },
    makeMove(move) { return makeMove(internals.game, move); }
  };
}
