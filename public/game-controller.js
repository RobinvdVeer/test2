import { colorOf, createGameState, getGameEnd, inCheck, legalMovesFor, makeMove } from './chess-engine.js';
import { makeBadBotMove } from './bot.js';
import { PIECES } from './piece-symbols.js';

export function createGameController(options) {
  return createGameControllerSession(options).controller;
}

export function createGameControllerSession(options = {}) {
  const { view, random = Math.random, setTimeoutFn = setTimeout, chaosEnabled = () => false, config = {} } = options;
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
    if (typeof options.onStateChange === 'function') options.onStateChange(getState());
  }

  function setStatus(status) {
    view.setStatus(status);
  }

  function setState(next = {}) {
    if (next.board) game.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
    if ('turn' in next) game.turn = next.turn;
    if ('selected' in next) selected = next.selected;
    if ('legalForSelected' in next) legalForSelected = Array.isArray(next.legalForSelected) ? next.legalForSelected.slice() : [];
    if ('enPassant' in next) game.enPassant = next.enPassant;
    if ('castling' in next) game.castling = { ...next.castling };
    if ('gameOver' in next) game.gameOver = next.gameOver;
    render();
  }

  function getState() {
    return {
      board: game.board.map(row => row.slice()),
      turn: game.turn,
      selected,
      legalForSelected: legalForSelected.slice(),
      enPassant: game.enPassant,
      castling: { ...game.castling },
      gameOver: game.gameOver
    };
  }

  function randomDelay(min, max) {
    return min + random() * (max - min);
  }

  const controller = {
    newGame,
    selectSquare,
    render,
    setState,
    getState,
    botMove
  };

  const internals = {
    get game() { return game; },
    get selected() { return selected; },
    set selected(value) { selected = value; },
    get legalForSelected() { return legalForSelected; },
    set legalForSelected(value) { legalForSelected = value; },
    newGame,
    render,
    selectSquare,
    afterPlayerMove,
    botMove,
    showGameEndIfNeeded
  };

  return { controller, internals };
}
