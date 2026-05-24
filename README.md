# Really Bad Chess Web App

A deliberately awful 90s-Geocities-inspired chess web app. You play White against a very bad random-ish Black bot.

## Run

Serve the app over HTTP with Docker Compose:

```sh
docker compose up
```

Then open <http://localhost:8080> in a browser.

Docker Compose binds the demo server to localhost only and serves the app from the container image built by the top-level `Dockerfile`.

Do not open `public/index.html` directly with a `file://` URL. The app uses ES modules, and modern browsers block module imports from `file://` origins.

## Deployment

The buildable service is named `app` in `docker-compose.yml`. Its image target is:

```text
ghcr.io/robinvdveer/really-bad-chess-web-app
```

For local image verification, use Docker Compose:

```sh
docker compose build app
docker compose up
```

Kubernetes deployment assets live under `deploy/`:

- `deploy/chart/` contains the Helm chart.
- `deploy/chart/values.yaml` contains base chart values.
- `deploy/values-staging.yaml` is an example per-environment override file.

Example Helm deployment:

```sh
helm upgrade --install really-bad-chess ./deploy/chart \
  -f deploy/values-staging.yaml \
  --set image.app.tag=<image-tag>
```

`image.app.tag` is expected to be supplied by the deployment pipeline, such as `pi_deploy`, when promoting a built GHCR image.

## Check

Run `npm run check` to syntax-check the JavaScript modules.

## Test

Run `npm test` to execute the Node.js test suite.

## How to play

1. Start the app with `docker compose up` and open <http://localhost:8080>.
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

- `public/` is the canonical browser app and helper-module source served by Docker Compose and the production container. Browser imports in `public/app.js` must resolve inside this directory.
- Root-level JavaScript files are compatibility entry points that delegate to the canonical modules in `public/`. Prefer `public/` imports in new code; root-level entry points are not part of the supported browser API.
- Documentation examples use `public/` paths for browser code and helper-module examples.

## API surface

### Browser API

The supported browser API is intentionally tiny:

```js
window.BadChess.newGame();
```

That resets the visible game. This is the only stable application API exposed on `window.BadChess`.

### Experimental helper modules

The following `public/` modules are supported for tests and small experiments, but they are not packaged as a stable library and may change between app versions:

- `public/chess-engine.js`: `createGameState`, `colorOf`, `enemy`, `inCheck`, `allLegalMoves`, `legalMovesFor`, `pseudoMovesFor`, `makeMove`, `getGameEnd`, `markGameOverIfNeeded`, and `checkGameEnd`.
- `public/bot.js`: `chooseBadBotMove` and `makeBadBotMove`.

These helpers mutate plain JavaScript state where noted below. Prefer imports from `public/`, not root-level legacy files.

### Internal-only APIs

`window.__badChess`, `createGameController`, `getGameControllerDebugApi`, `createDomBoardView`, `playBadNoise`, and the controller/view/audio modules are internal implementation details. They exist for the app and tests, are not compatibility-stable, and should not be used by application code.

The root-level `game-controller.js` module additionally exposes a legacy test harness wrapper around the browser controller, including state setters/getters and move helpers. Treat that surface as test-only compatibility API: it may change without notice and should not be used by application code. Prefer the documented browser API and `public/` helper modules instead.

Example legacy test-only use:

```js
import { createGameController } from './game-controller.js';

const controller = createGameController({ view: fakeView, setTimeoutFn: fakeTimer });
controller.setState({ turn: 'b' });
console.log(controller.getState().turn);
```

## Configuration

Maintainers can tune the badness in `public/app.js` using the named constants near the top of the file:

- `GLITCH_PROBABILITY` controls how often a square receives a visual glitch. Use a probability from `0` to `1`.
- `GLITCH_MAX_OFFSET_PX` controls the maximum horizontal/vertical glitch offset in pixels.
- `GLITCH_MAX_ROTATION_DEG` controls the maximum glitch rotation in degrees.
- `BOT_PAWN_MOVE_BIAS` controls how often the bot prefers pawn moves when available. Use a probability from `0` to `1`.
- `BOT_MIN_DELAY_MS` and `BOT_MAX_DELAY_MS` control the bot's thinking delay in milliseconds.

Example: set `BOT_PAWN_MOVE_BIAS = 0.25` for fewer pawn moves, or `GLITCH_PROBABILITY = 0` to disable layout glitches by default.

Runtime deployment configuration lives in `deploy/chart/values.yaml`, with environment overrides such as `deploy/values-staging.yaml`:

| Value | Purpose |
| --- | --- |
| `image.app.repository` | GHCR repository for the `app` service image. |
| `image.app.tag` | Image tag to deploy; normally injected by `pi_deploy` or set with `--set`. |
| `image.app.pullPolicy` | Kubernetes image pull policy. |
| `replicaCount` | Number of app pods. |
| `service.type`, `service.port`, `service.targetPort` | Kubernetes Service exposure and ports. |
| `ingress.*` | Optional ingress host, class, annotations, paths, and TLS secret references. |
| `resources`, `nodeSelector`, `tolerations`, `affinity` | Standard pod scheduling and resource controls. |

Internally, `createGameController` uses the same bot setting as `config.pawnMoveBias`. The older `config.botPawnMoveBias` spelling remains as a compatibility alias inside the app, but new internal code should use `pawnMoveBias`.

## Bot helper API

`public/bot.js` exports two experimental helpers:

- `chooseBadBotMove(state, options)` returns a move object or `null`. It does not mutate `state`.
- `makeBadBotMove(state, options)` chooses and applies a move, mutating `state.board` via `makeMove`. It returns `true` when a move was made and `false` when no legal move is available.

Supported options are:

- `pawnMoveBias`: probability from `0` to `1` that the bot prefers available pawn moves. Defaults to `0.7`.
- `pawnBias`: deprecated alias for `pawnMoveBias`; avoid it in new code.
- `random`: random-number function used for deterministic tests. Defaults to `Math.random`.
- `moves`: optional precomputed legal moves for Black. Defaults to `allLegalMoves(state, 'b')`.

Example with deterministic move selection:

```js
import { createGameState } from './public/chess-engine.js';
import { chooseBadBotMove, makeBadBotMove } from './public/bot.js';

const state = createGameState();
const alwaysFirst = () => 0;
const move = chooseBadBotMove(state, { pawnMoveBias: 1, random: alwaysFirst });

if (move) {
  makeBadBotMove(state, { moves: [move], random: alwaysFirst });
}
```

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

- Start from `createGameState()` when possible so all required fields are present.
- `state.board` is an 8x8 array addressed as `board[row][column]`, with row `0` at Black's back rank and row `7` at White's back rank.
- `state.turn` is the side to move, either `'w'` or `'b'`.
- `state.enPassant` is either `null` or an en-passant target square `{ r, c }`.
- `state.castling` tracks castling rights with boolean flags `{ K, Q, k, q }` for White king-side, White queen-side, Black king-side, and Black queen-side.
- `state.gameOver` is a boolean set by mutating game-end helpers.
- Pieces use FEN-like letters: uppercase `KQRBNP` for White, lowercase `kqrbnp` for Black, and `.` for an empty square.
- Colors are `'w'` and `'b'`.
- Moves have `{ from: { r, c }, to: { r, c } }` plus optional flags:
  - `promotion: 'Q' | 'q'` replaces the moved pawn with the promoted queen.
  - `doublePawn: true` marks a two-square pawn move and updates `state.enPassant`.
  - `enPassant: true` captures the pawn behind the destination square.
  - `castle: 'k' | 'q'` moves the rook for king-side or queen-side castling.
- `makeMove(state, move)` mutates `state.board`, castling rights, and en-passant state. It does not advance `state.turn`; callers do that themselves.
- `getGameEnd(state)` is pure. `checkGameEnd(state)` / `markGameOverIfNeeded(state)` may set `state.gameOver`.
