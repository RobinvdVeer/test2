import { colorOf, createGameState, getGameEnd, inCheck, legalMovesFor, makeMove } from './chess-engine.js';
import { makeBadBotMove } from './bot.js';
import { attachGameControllerDebugApi } from './game-controller-debug.js';
import { PIECES } from './piece-symbols.js';

export function createGameController({ view, random = Math.random, setTimeoutFn = setTimeout, chaosEnabled = () => false, config = {}, debug = false }) {
  const pawnMoveBias = config.pawnMoveBias ?? config.botPawnMoveBias ?? 0.7;
  const botMinDelayMs = config.botMinDelayMs ?? 550;
  const botMaxDelayMs = config.botMaxDelayMs ?? 1250;

  let game = createGameState();
  let selected = null;
  let legalForSelected = [];

  function newGame() {
    game = createGameState();
    selected = null;
    legalForSelected = [];
    setStatus('White to move. The bot is already sweating pixels.');
    render();
  }

  function selectSquare(r, c) {
    if (game.gameOver || game.turn !== 'w') return;
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
    const gameEnd = showGameEndIfNeeded();
    if (gameEnd.over) return;
    setStatus('Bot thinking very incorrectly...');
    setTimeoutFn(() => botMove(gameEnd.moves), randomDelay(botMinDelayMs, botMaxDelayMs));
  }

  function botMove(cachedMoves = null) {
    if (game.gameOver) return;
    if (!makeBadBotMove(game, { pawnMoveBias, random, moves: cachedMoves || undefined })) return showGameEndIfNeeded();
    game.turn = 'w';
    render();
    if (!showGameEndIfNeeded().over) setStatus(inCheck(game, 'w') ? 'CHECK! The bot did that by accident.' : 'Your move. The bot regrets nothing.');
  }

  function showGameEndIfNeeded() {
    const result = getGameEnd(game);
    if (!result.over) return result;
    game.gameOver = true;
    const side = result.color === 'w' ? 'White' : 'Black';
    setStatus(result.checkmate ? `${side} is checkmated. Incredible and upsetting.` : 'Stalemate. Nobody wins, especially chess.');
    return result;
  }

  function render() {
    view.render(game, { selected, legalForSelected, chaosEnabled: chaosEnabled() });
  }

  function setStatus(status) {
    view.setStatus(status);
  }

  function randomDelay(min, max) {
    return min + random() * (max - min);
  }

  const controller = {
    newGame,
    selectSquare,
    render
  };

  if (debug) {
    attachGameControllerDebugApi(controller, {
      getGame: () => game,
      getSelected: () => selected,
      setSelected: value => { selected = value; },
      getLegalForSelected: () => legalForSelected,
      setLegalForSelected: value => { legalForSelected = value; },
      afterPlayerMove,
      botMove,
      showGameEndIfNeeded
    });
  }

  return controller;
}
