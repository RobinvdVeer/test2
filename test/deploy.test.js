import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commandExists, waitForHttp } from './helpers.js';

test('Helm chart renders deployment image from values', { skip: !commandExists('helm') }, () => {
  execFileSync('helm', ['lint', 'deploy/chart'], { stdio: 'pipe' });
  const rendered = execFileSync('helm', [
    'template',
    'test',
    'deploy/chart',
    '-f',
    'deploy/values-staging.yaml',
    '--set',
    'image.app.tag=ci-test-tag'
  ], { encoding: 'utf8' });

  assert.match(rendered, /kind: Deployment/);
  assert.match(rendered, /image: "ghcr\.io\/robinvdveer\/really-bad-chess-web-app:ci-test-tag"/);
  assert.doesNotMatch(rendered, /image: "ghcr\.io\/robinvdveer\/really-bad-chess-web-app:latest"/);
});

test('Helm service is externally reachable via configured NodePort', { skip: !commandExists('helm') }, () => {
  const renderedDefault = execFileSync('helm', ['template', 'test', 'deploy/chart'], { encoding: 'utf8' });
  assert.match(renderedDefault, /kind: Service[\s\S]*?spec:\n  type: NodePort/);
  assert.match(renderedDefault, /kind: Service[\s\S]*?nodePort: 32080/);

  const renderedWithNodePort = execFileSync('helm', [
    'template',
    'test',
    'deploy/chart',
    '--set',
    'service.nodePort=30080'
  ], { encoding: 'utf8' });
  assert.match(renderedWithNodePort, /kind: Service[\s\S]*?nodePort: 30080/);
});

test('Docker Compose config and image build are valid', { skip: !commandExists('docker') }, () => {
  execFileSync('docker', ['compose', 'config'], { stdio: 'pipe' });
  execFileSync('docker', ['compose', 'build', 'app'], { stdio: 'pipe' });
});

test('Docker Compose serves the app over HTTP on an ephemeral test port', { skip: !commandExists('docker') }, async t => {
  const tempDir = mkdtempSync(join(tmpdir(), 'bad-chess-compose-'));
  const composeFile = join(tempDir, 'compose.yaml');
  const projectName = `bad-chess-test-${process.pid}-${Date.now()}`;
  writeFileSync(composeFile, `services:\n  app:\n    build:\n      context: ${JSON.stringify(process.cwd())}\n      dockerfile: Dockerfile\n    image: really-bad-chess-web-app:test\n    ports:\n      - "127.0.0.1:0:8080"\n`);

  const composeArgs = ['compose', '-p', projectName, '-f', composeFile];
  const up = spawnSync('docker', [...composeArgs, 'up', '-d', '--wait', '--build'], { stdio: 'pipe', encoding: 'utf8' });
  if (up.status !== 0) {
    rmSync(tempDir, { recursive: true, force: true });
    t.skip(`docker compose up failed: ${up.stderr || up.stdout}`);
    return;
  }
  t.after(() => {
    spawnSync('docker', [...composeArgs, 'down', '--volumes'], { stdio: 'ignore' });
    rmSync(tempDir, { recursive: true, force: true });
  });

  const mapped = execFileSync('docker', [...composeArgs, 'port', 'app', '8080'], { encoding: 'utf8' }).trim();
  const port = Number(mapped.split(':').pop());
  assert.ok(port > 0, `expected mapped port from ${mapped}`);

  const index = await waitForHttp('/', port);
  assert.equal(index.statusCode, 200);
  assert.match(index.body, /<script type="module" src="app\.js"><\/script>/);

  const modules = [
    ['/app.js', /import .*\.\/app-bootstrap\.js/],
    ['/app-bootstrap.js', /export function startApp/],
    ['/app-state.js', /export function createAppStateManager/],
    ['/persisted-state-normalizer.js', /export function normalizePersistedState/],
    ['/board-view.js', /export function createDomBoardView/],
    ['/game-controller.js', /export function createGameController/],
    ['/bot.js', /export function makeBadBotMove/],
    ['/piece-symbols.js', /export const PIECES/],
    ['/chess-engine.js', /export function createGameState/],
    ['/audio.js', /export function playBadNoise/]
  ];

  for (const [path, expected] of modules) {
    const response = await waitForHttp(path, port);
    assert.equal(response.statusCode, 200, `${path} is served`);
    assert.match(response.body, expected, `${path} has expected JavaScript content`);
  }
});
