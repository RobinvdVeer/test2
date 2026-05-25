import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, nextImportId } from './helpers.js';

test('noise button wires Web Audio oscillator and gain settings', async () => {
  const app = await loadApp({ random: () => 0.5 });
  try {
    app.ids.noiseBtn.click();
    assert.equal(app.audio.oscillators[0].type, 'square');
    assert.equal(app.audio.oscillators[0].frequency.value, 610);
    assert.equal(app.audio.gains[0].gain.value, 0.05);
    assert.equal(app.audio.calls[0][0], 'osc.connect');
    assert.equal(app.audio.calls[1][0], 'gain.connect');
    assert.deepEqual(app.audio.calls.slice(2), [['osc.start'], ['osc.stop', 10.15]]);
  } finally {
    app.restore();
  }
});

test('playBadNoise documents missing Web Audio support by throwing', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    const audio = await import(`../public/audio.js?missingAudio=${nextImportId()}`);
    assert.throws(() => audio.playBadNoise(), TypeError);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('playBadNoise documents AudioContext constructor errors by propagating them', async () => {
  const originalWindow = globalThis.window;
  const err = new Error('blocked audio');
  globalThis.window = { AudioContext: function AudioContext() { throw err; } };
  try {
    const audio = await import(`../public/audio.js?blockedAudio=${nextImportId()}`);
    assert.throws(() => audio.playBadNoise(), err);
  } finally {
    globalThis.window = originalWindow;
  }
});
