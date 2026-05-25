import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { createGameState, makeMove } from '../public/chess-engine.js';

let importCounter = 0;
export const nextImportId = () => importCounter++;

function createClassList(el) {
  const classes = new Set();
  const sync = () => { el._className = [...classes].join(' '); };
  return {
    add(...names) { names.forEach(name => classes.add(name)); sync(); },
    remove(...names) { names.forEach(name => classes.delete(name)); sync(); },
    contains(name) { return classes.has(name); },
    _set(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); sync(); }
  };
}

export class ElementStub {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {
      values: {},
      setProperty: (k, v) => { this.style.values[k] = v; },
      removeProperty: k => { delete this.style.values[k]; }
    };
    this.listeners = {};
    this.checked = false;
    this.value = '';
    this._innerHTML = '';
    this._textContent = '';
    this.classList = createClassList(this);
  }
  set className(value) { this.classList._set(value); }
  get className() { return this._className || ''; }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  get innerHTML() { return this._innerHTML; }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { (this.listeners[event.type] || []).forEach(fn => fn({ ...event, currentTarget: this, target: this })); }
  click() { this.dispatchEvent({ type: 'click' }); }
}

export function createAudioContextRecorder() {
  const calls = [];
  const oscillators = [];
  const gains = [];
  function AudioContext() {
    this.currentTime = 10;
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
  return { AudioContext, calls, oscillators, gains };
}

export async function loadApp({ random = () => 0.99, audioContext, modulePath = '../public/app.js' } = {}) {
  const ids = {
    board: new ElementStub('div', 'board'),
    status: new ElementStub('div', 'status'),
    chaos: new ElementStub('input', 'chaos'),
    newGame: new ElementStub('button', 'newGame'),
    noiseBtn: new ElementStub('button', 'noiseBtn'),
    playerName: new ElementStub('input', 'playerName'),
    score: new ElementStub('strong', 'score'),
    timer: new ElementStub('strong', 'timer'),
    resetSavedGame: new ElementStub('button', 'resetSavedGame')
  };
  ids.chaos.checked = true;
  const timers = [];
  const storage = new Map();
  const document = {
    getElementById(id) { return ids[id]; },
    createElement(tagName) { return new ElementStub(tagName); }
  };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalRandom = Math.random;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalAudioContext = globalThis.AudioContext;
  const originalWebkitAudioContext = globalThis.webkitAudioContext;
  const originalTestHooksFlag = globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__;
  const originalLocalStorage = globalThis.localStorage;
  const originalAddEventListener = globalThis.addEventListener;
  const recorder = audioContext || createAudioContextRecorder();

  globalThis.document = document;
  globalThis.window = globalThis;
  globalThis.localStorage = localStorage;
  globalThis.addEventListener = () => {};
  globalThis.AudioContext = recorder.AudioContext;
  globalThis.webkitAudioContext = recorder.AudioContext;
  globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__ = true;
  Math.random = random;
  globalThis.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  globalThis.clearTimeout = () => {};

  const restore = () => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    Math.random = originalRandom;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;
    if (originalWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = originalWebkitAudioContext;
    if (originalTestHooksFlag === undefined) delete globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__;
    else globalThis.__BAD_CHESS_ENABLE_TEST_HOOKS__ = originalTestHooksFlag;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalAddEventListener === undefined) delete globalThis.addEventListener;
    else globalThis.addEventListener = originalAddEventListener;
  };

  try {
    await import(`${modulePath}?test=${nextImportId()}`);
  } catch (err) {
    restore();
    throw err;
  }

  return { api: globalThis.__badChess, ids, timers, audio: recorder, restore };
}

export function stateFrom(boardOrNext, turn = 'w', castling = { K: false, Q: false, k: false, q: false }, enPassant = null) {
  if (Array.isArray(boardOrNext)) {
    return { board: boardOrNext.map(row => row.split('')), turn, enPassant, castling: { ...castling }, gameOver: false };
  }

  const next = boardOrNext || {};
  const state = createGameState();
  if (next.board) state.board = next.board.map(row => Array.isArray(row) ? row.slice() : row.split(''));
  if ('turn' in next) state.turn = next.turn;
  if ('enPassant' in next) state.enPassant = next.enPassant;
  if ('castling' in next) state.castling = { ...next.castling };
  if ('gameOver' in next) state.gameOver = next.gameOver;
  return state;
}

export const destinations = moves => moves.map(m => `${m.to.r},${m.to.c}`).sort();
export const hasMove = (moves, r, c, prop) => moves.some(m => m.to.r === r && m.to.c === c && (!prop || m[prop]));
export const boardKey = state => state.board.map(r => r.join('')).join('/');
export const applyMoveForTest = (state, move) => { makeMove(state, move); return state; };
export const squareAt = (ids, r, c) => ids.board.children.find(sq => Number(sq.dataset.r) === r && Number(sq.dataset.c) === c);

export function commandExists(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}

export function httpGet(path, port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 1000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    req.on('error', reject);
  });
}

export async function waitForHttp(path, port, attempts = 20) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await httpGet(path, port);
    } catch (err) {
      lastErr = err;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw lastErr;
}
