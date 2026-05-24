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

## How to play

1. Open `index.html`.
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
- There is no save, move history, undo, multiplayer, backend, or API beyond `window.BadChess.newGame()`.

## Configuration

Maintainers can tune the badness in `app.js` using the named constants near the top of the file:

- `GLITCH_PROBABILITY`, `GLITCH_MAX_OFFSET_PX`, and `GLITCH_MAX_ROTATION_DEG` control random layout glitches.
- `BOT_PAWN_MOVE_BIAS`, `BOT_MIN_DELAY_MS`, and `BOT_MAX_DELAY_MS` control the bot's pawn preference and thinking delay.
