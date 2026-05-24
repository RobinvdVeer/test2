import { createGameControllerSession } from './game-controller.js';

export function createDebuggableGameController(options) {
  const { controller, debugApi } = createGameControllerSession(options);
  return { controller, debugApi };
}

export function createCompatibilityGameController(options) {
  const { controller, debugApi } = createGameControllerSession(options);

  function showGameEndIfNeeded() {
    return debugApi.checkGameEnd();
  }

  function botMove(cachedMoves = null) {
    const result = debugApi.botMove(cachedMoves);
    return result && typeof result.over === 'boolean' ? result.over : result;
  }

  return {
    ...controller,
    afterPlayerMove: debugApi.afterMove,
    botMove,
    showGameEndIfNeeded,
    setState: debugApi.setState,
    getState: debugApi.getState,
    allLegalMoves: debugApi.allLegalMoves,
    legalMovesFor: debugApi.legalMovesFor,
    pseudoMovesFor: debugApi.pseudoMovesFor,
    makeMove: debugApi.makeMove,
    inCheck: debugApi.inCheck,
    colorOf: debugApi.colorOf
  };
}
