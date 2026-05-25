export function defaultAppState(overrides = {}) {
  return {
    playerName: '',
    score: 0,
    timer: { elapsedMs: 0, startedAt: Date.now() },
    settings: { chaos: true },
    ...overrides
  };
}

export function calculateScore(board) {
  const values = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  let score = 0;
  for (const row of board || []) {
    for (const piece of row) {
      const value = values[piece.toUpperCase()] || 0;
      if (piece >= 'A' && piece <= 'Z') score += value;
      else if (piece >= 'a' && piece <= 'z') score -= value;
    }
  }
  return score;
}

export function currentTimer(previous = { elapsedMs: 0, startedAt: Date.now() }, paused = false) {
  if (paused) return { elapsedMs: elapsedMs(previous), startedAt: null };
  return { elapsedMs: elapsedMs(previous), startedAt: Date.now() };
}

export function elapsedMs(timer = { elapsedMs: 0 }) {
  return (timer.elapsedMs || 0) + (timer.startedAt ? Date.now() - timer.startedAt : 0);
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
