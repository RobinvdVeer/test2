import { allLegalMoves, colorOf, createGameState, getGameEnd, inCheck, legalMovesFor, makeMove } from './chess-engine.js';
import { makeBadBotMove } from './bot.js';
import { PIECES } from './piece-symbols.js';

export function createGameController({ view, random = Math.random, setTimeoutFn = setTimeout, config = {} }) {
  const botPawnMoveBias = config.botPawnMoveBias ?? 0.7;
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
    if (showGameEndIfNeeded()) return;
    setStatus('Bot thinking very incorrectly...');
    setTimeoutFn(botMove, randomDelay(botMinDelayMs, botMaxDelayMs));
  }

  function botMove() {
    if (game.gameOver) return;
    if (!makeBadBotMove(game, { pawnBias: botPawnMoveBias, random })) return showGameEndIfNeeded();
    game.turn = 'w';
    render();
    if (!showGameEndIfNeeded()) setStatus(inCheck(game, 'w') ? 'CHECK! The bot did that by accident.' : 'Your move. The bot regrets nothing.');
  }

  function showGameEndIfNeeded() {
    const result = getGameEnd(game);
    if (!result.over) return false;
    game.gameOver = true;
    const side = result.color === 'w' ? 'White' : 'Black';
    setStatus(result.checkmate ? `${side} is checkmated. Incredible and upsetting.` : 'Stalemate. Nobody wins, especially chess.');
    return true;
  }

  function render() {
    view.render(game, { selected, legalForSelected });
  }

  function setStatus(status) {
    view.setStatus(status);
  }

  function randomDelay(min, max) {
    return min + random() * (max - min);
  }

  function setState(next = {}) {
    if (next.board) game.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
    if ('turn' in next) game.turn = next.turn;
    if ('selected' in next) selected = next.selected;
    if ('legalForSelected' in next) legalForSelected = next.legalForSelected;
    if ('enPassant' in next) game.enPassant = next.enPassant;
    if ('castling' in next) game.castling = { ...next.castling };
    if ('gameOver' in next) game.gameOver = next.gameOver;
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

  return {
    newGame,
    selectSquare,
    afterPlayerMove,
    botMove,
    showGameEndIfNeeded,
    render,
    setState,
    getState,
    allLegalMoves(color) { return allLegalMoves(game, color); },
    legalMovesFor(r, c) { return legalMovesFor(game, r, c); },
    makeMove(move) { return makeMove(game, move); }
  };
}
