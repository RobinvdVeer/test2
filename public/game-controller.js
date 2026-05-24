import { allLegalMoves, colorOf, createGameState, getGameEnd, inCheck, legalMovesFor, makeMove, pseudoMovesFor } from './chess-engine.js';
import { makeBadBotMove } from './bot.js';
import { PIECES } from './piece-symbols.js';

export function createGameController(options) {
  return createGameControllerSession(options).controller;
}

export function createGameControllerSession({ view, random = Math.random, setTimeoutFn = setTimeout, chaosEnabled = () => false, config = {} }) {
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

  const debugApi = createGameControllerDebugApi({
    getGame: () => game,
    getSelected: () => selected,
    setSelected: value => { selected = value; },
    getLegalForSelected: () => legalForSelected,
    setLegalForSelected: value => { legalForSelected = value; },
    newGame,
    render,
    selectSquare,
    afterPlayerMove,
    botMove,
    showGameEndIfNeeded
  });

  return { controller, debugApi };
}

function createGameControllerDebugApi(session) {
  function setState(next = {}) {
    const game = session.getGame();
    if (next.board) game.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
    if ('turn' in next) game.turn = next.turn;
    if ('selected' in next) session.setSelected(next.selected);
    if ('legalForSelected' in next) session.setLegalForSelected(next.legalForSelected);
    if ('enPassant' in next) game.enPassant = next.enPassant;
    if ('castling' in next) game.castling = { ...next.castling };
    if ('gameOver' in next) game.gameOver = next.gameOver;
  }

  function getState() {
    const game = session.getGame();
    return {
      board: game.board.map(row => row.slice()),
      turn: game.turn,
      selected: session.getSelected(),
      legalForSelected: session.getLegalForSelected().slice(),
      enPassant: game.enPassant,
      castling: { ...game.castling },
      gameOver: game.gameOver
    };
  }

  return {
    newGame: session.newGame,
    render: session.render,
    selectSquare: session.selectSquare,
    afterMove: session.afterPlayerMove,
    botMove: session.botMove,
    checkGameEnd() { return session.showGameEndIfNeeded().over; },
    inCheck(color) { return inCheck(session.getGame(), color); },
    colorOf,
    setState,
    getState,
    allLegalMoves(color) { return allLegalMoves(session.getGame(), color); },
    legalMovesFor(r, c) { return legalMovesFor(session.getGame(), r, c); },
    pseudoMovesFor(r, c) { return pseudoMovesFor(session.getGame(), r, c); },
    makeMove(move) { return makeMove(session.getGame(), move); }
  };
}
