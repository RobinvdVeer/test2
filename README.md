# Really Bad Chess Web App

A deliberately awful 90s-Geocities-inspired chess web app. You play White against a very bad random-ish Black bot.

## Run

Serve the app over HTTP with Docker Compose:

```sh
docker compose up --build
```

Then open <http://localhost:8080> in a browser.

Docker Compose builds the static nginx image declared in `docker-compose.yml` and binds the demo server to localhost only.

Do not open `public/index.html` directly with a `file://` URL. The app uses ES modules, and modern browsers block module imports from `file://` origins.

## Deploy

Kubernetes deployment manifests live under `deploy/` for Helm-based releases. The chart path is `deploy/chart`, with environment overrides such as `deploy/values-staging.yaml`.

Example staging upgrade:

```sh
helm upgrade --install really-bad-chess deploy/chart \
  -f deploy/values-staging.yaml \
  --set image.web.tag=<tag>
```

Common values to override:

- `image.web.repository` and `image.web.tag` select the container image. Deployment tooling injects the tag at upgrade time.
- `service.web.type`, `service.web.port`, and `service.web.targetPort` configure the Kubernetes Service.
- `ingress.enabled`, `ingress.className`, `ingress.hosts`, and `ingress.tls` configure optional Ingress exposure.

## Check

Run `npm run check` to syntax-check the JavaScript modules.

## Test

Run `npm test` to execute the Node.js test suite.

## How to play

1. Start the app with `docker compose up --build` and open <http://localhost:8080>.
2. Click one of your White pieces to select it.
3. Click a highlighted destination square to move there.
4. Wait briefly while the Black bot thinks very incorrectly and makes a move.
5. Use `NEW GAME BUT WORSE` to reset, `click 4 noise` for a tiny beep, and the `random layout glitches` checkbox to toggle visual chaos.

## Features

- Legal chess moves, including check prevention, castling, en passant, and automatic queen promotion
- Terrible bot that randomly chooses moves and strongly prefers shoving pawns for no good reason
- Excessive animation, clashing colors, marquee text, blinking ads, and optional random layout glitches

## Intentional limitations

- The human player is always White, and the bot is always Black.
- Pawn promotion always becomes a queen; there is no promotion picker.
- There is no save, move history, undo, multiplayer, backend, or public API beyond `window.BadChess.newGame()`.
- Test/debug hooks are disabled by default; `window.__badChess` is internal, unsupported, and should not be used by application code.

## Source layout

- `public/` is the canonical browser app served by Docker Compose. Browser imports in `public/app.js` must resolve inside this directory.
- The Node test suite imports the canonical modules from `public/`.
- Root-level JavaScript files are legacy development copies and are not part of the supported API; do not import them from new code.
- Documentation examples use `public/` paths for browser code and supported helper usage.

## API surface

### Supported browser API

The supported browser API is intentionally tiny:

```js
window.BadChess.newGame();
```

That resets the visible game.

### Supported helper API

The reusable helpers in `public/chess-engine.js` and `public/bot.js` are supported for tests and small experiments. They mutate plain JavaScript state and are not packaged as a stable library.

### Internal and testing API

Everything else in the app is internal unless explicitly documented here. In particular, `createGameController`, `createDomBoardView`, `playBadNoise`, root-level JavaScript files, and `window.__badChess` are unsupported implementation/testing details. Test/debug hooks are disabled by default and should not be used by application code.

## Configuration

Maintainers can tune the badness in `public/app.js` using the named constants near the top of the file:

- `GLITCH_PROBABILITY` controls how often a square receives a visual glitch. Use a probability from `0` to `1`.
- `GLITCH_MAX_OFFSET_PX` controls the maximum horizontal/vertical glitch offset in pixels.
- `GLITCH_MAX_ROTATION_DEG` controls the maximum glitch rotation in degrees.
- `BOT_PAWN_MOVE_BIAS` controls how often the bot prefers pawn moves when available. Use a probability from `0` to `1`.
- `BOT_MIN_DELAY_MS` and `BOT_MAX_DELAY_MS` control the bot's thinking delay in milliseconds.

Example: set `BOT_PAWN_MOVE_BIAS = 0.25` for fewer pawn moves, or `GLITCH_PROBABILITY = 0` to disable layout glitches by default.

The internal `createGameController` accepts the same bot setting as `config.pawnMoveBias`. The older `config.botPawnMoveBias` spelling is still accepted as a compatibility alias for tests and legacy code, but new internal code should use `pawnMoveBias`.

The reusable bot helper in `public/bot.js` accepts the canonical `pawnMoveBias` option. The older `pawnBias` spelling is still accepted as a compatibility alias, but new code should use `pawnMoveBias`:

```js
import { makeBadBotMove } from './public/bot.js';

makeBadBotMove(state, { pawnMoveBias: 0.25 });
```

`makeBadBotMove` / `chooseBadBotMove` are black-bot helpers: by default they choose from Black's legal moves, unless you supply a custom `moves` list. `makeBadBotMove` mutates the passed state by applying the chosen move, returns `false` if no move is available, and does not advance `state.turn`; callers must update `state.turn` themselves.

## Chess engine helper API

`public/chess-engine.js` exposes plain helpers for tests and small experiments:

```js
import { createGameState, legalMovesFor, makeMove, getGameEnd } from './public/chess-engine.js';

const state = createGameState();
const moves = legalMovesFor(state, 6, 4); // white pawn on e2
makeMove(state, moves.find(move => move.to.r === 4 && move.to.c === 4));
state.turn = 'b';
console.log(getGameEnd(state));
```

State shape and conventions:

- `state.board` is an 8x8 array addressed as `board[row][column]`, with row `0` at Black's back rank and row `7` at White's back rank.
- Pieces use FEN-like letters: uppercase `KQRBNP` for White, lowercase `kqrbnp` for Black, and `.` for an empty square.
- Colors are `'w'` and `'b'`.
- Moves have `{ from: { r, c }, to: { r, c } }` plus optional flags such as `promotion`, `doublePawn`, `enPassant`, or `castle`.
- `makeMove(state, move)` mutates `state.board`, castling rights, and en-passant state. It does not advance `state.turn`; callers do that themselves.
- `getGameEnd(state)` is pure. `checkGameEnd(state)` / `markGameOverIfNeeded(state)` may set `state.gameOver`.
