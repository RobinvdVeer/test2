# Really Bad Chess Web App

A deliberately awful 90s-Geocities-inspired chess web app. You play White against a very bad random-ish Black bot.

## Run

Serve the app over HTTP with Docker Compose:

```sh
docker compose up
```

Then open <http://localhost:8080> in a browser.

Do not open `index.html` directly with a `file://` URL. The app uses ES modules, and modern browsers block module imports from `file://` origins.

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
- `window.__badChess` is an internal, unsupported test hook and should not be used by application code.

## Configuration

Maintainers can tune the badness in `app.js` using the named constants near the top of the file:

- `GLITCH_PROBABILITY` controls how often a square receives a visual glitch. Use a probability from `0` to `1`.
- `GLITCH_MAX_OFFSET_PX` controls the maximum horizontal/vertical glitch offset in pixels.
- `GLITCH_MAX_ROTATION_DEG` controls the maximum glitch rotation in degrees.
- `BOT_PAWN_MOVE_BIAS` controls how often the bot prefers pawn moves when available. Use a probability from `0` to `1`.
- `BOT_MIN_DELAY_MS` and `BOT_MAX_DELAY_MS` control the bot's thinking delay in milliseconds.

Example: set `BOT_PAWN_MOVE_BIAS = 0.25` for fewer pawn moves, or `GLITCH_PROBABILITY = 0` to disable layout glitches by default.

The reusable bot helper in `bot.js` accepts the same pawn-bias setting:

```js
makeBadBotMove(state, { pawnMoveBias: 0.25 });
```
