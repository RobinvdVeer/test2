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

function createCountingAudioContextRecorder() {
  const calls = [];
  const oscillators = [];
  const gains = [];
  let instances = 0;
  function AudioContext() {
    instances += 1;
    this.currentTime = 20;
    this.destination = { kind: 'destination' };
    this.createOscillator = () => {
      const oscillator = {
        type: '',
        frequency: { value: 0 },
        connect: target => calls.push(['osc.connect', target]),
        start: () => calls.push(['osc.start']),
        stop: time => calls.push(['osc.stop', time])
      };
      oscillators.push(oscillator);
      return oscillator;
    };
    this.createGain = () => {
      const gain = {
        gain: { value: 0 },
        connect: target => calls.push(['gain.connect', target])
      };
      gains.push(gain);
      return gain;
    };
  }
  return { AudioContext, calls, oscillators, gains, get instances() { return instances; } };
}

test('playBadNoise supports webkitAudioContext fallback', async () => {
  const originalWindow = globalThis.window;
  const originalRandom = Math.random;
  const recorder = createCountingAudioContextRecorder();
  globalThis.window = { webkitAudioContext: recorder.AudioContext };
  Math.random = () => 0.25;
  try {
    const audio = await import(`../public/audio.js?webkitAudio=${nextImportId()}`);
    audio.playBadNoise();
    assert.equal(recorder.instances, 1);
    assert.equal(recorder.oscillators[0].type, 'square');
    assert.equal(recorder.oscillators[0].frequency.value, 385);
    assert.equal(recorder.gains[0].gain.value, 0.05);
    assert.deepEqual(recorder.calls.slice(2), [['osc.start'], ['osc.stop', 20.15]]);
  } finally {
    globalThis.window = originalWindow;
    Math.random = originalRandom;
  }
});

test('playBadNoise reuses one AudioContext while creating a sound per call', async () => {
  const originalWindow = globalThis.window;
  const originalRandom = Math.random;
  const recorder = createCountingAudioContextRecorder();
  globalThis.window = { AudioContext: recorder.AudioContext };
  Math.random = () => 0;
  try {
    const audio = await import(`../public/audio.js?cachedAudio=${nextImportId()}`);
    audio.playBadNoise();
    audio.playBadNoise();
    assert.equal(recorder.instances, 1);
    assert.equal(recorder.oscillators.length, 2);
    assert.equal(recorder.gains.length, 2);
    assert.equal(recorder.calls.filter(([name]) => name === 'osc.start').length, 2);
    assert.equal(recorder.calls.filter(([name]) => name === 'osc.stop').length, 2);
  } finally {
    globalThis.window = originalWindow;
    Math.random = originalRandom;
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
