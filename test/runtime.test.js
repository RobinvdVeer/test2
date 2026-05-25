import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadApp, nextImportId } from './helpers.js';

test('app module imports successfully with DOM stubs', async () => {
  const app = await loadApp();
  try {
    assert.equal(app.ids.board.children.length, 64);
    assert.equal(typeof app.api.newGame, 'function');
  } finally {
    app.restore();
  }
});

test('root-level runtime modules syntax-check and import successfully', async () => {
  execFileSync('node', ['--check', 'app.js'], { stdio: 'pipe' });
  execFileSync('node', ['--check', 'bot.js'], { stdio: 'pipe' });
  execFileSync('node', ['--check', 'game-controller.js'], { stdio: 'pipe' });
  await import(`../bot.js?rootBot=${nextImportId()}`);
  await import(`../game-controller.js?rootController=${nextImportId()}`);

  const app = await loadApp({ modulePath: '../app.js' });
  try {
    assert.equal(app.ids.board.children.length, 64);
    assert.equal(typeof app.api.newGame, 'function');
  } finally {
    app.restore();
  }
});
