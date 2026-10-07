import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const source = readFileSync(new URL('../scripts/configure.mjs', import.meta.url), 'utf8');

function temporaryProject(run) {
  const directory = mkdtempSync(join(tmpdir(), 'emergency-qr configure-'));
  const project = join(directory, 'project with spaces');
  const elsewhere = join(directory, 'unrelated cwd');
  mkdirSync(join(project, 'scripts'), { recursive: true });
  mkdirSync(join(project, 'frontend'));
  mkdirSync(join(project, 'backend'));
  mkdirSync(elsewhere);
  const script = join(project, 'scripts', 'configure.mjs');
  writeFileSync(script, source);
  const paths = { frontend: join(project, 'frontend', '.env'), backend: join(project, 'backend', '.env') };
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], {
    cwd: elsewhere, encoding: 'utf8', timeout: 10_000,
  });
  try { run({ invoke, paths, project, elsewhere }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

function successful(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
}

function failedWithoutFiles(result, paths) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(result.stderr.trim());
  for (const path of Object.values(paths)) assert.equal(existsSync(path), false);
}

function readSettings(path) {
  return Object.fromEntries(readFileSync(path, 'utf8').trim().split('\n').map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

test('no arguments only explain address selection and do not create configuration', () => temporaryProject(({ invoke, paths }) => {
  const result = invoke();
  successful(result);
  assert.match(result.stdout, /--host=<LAN_IP>/);
  assert.match(result.stdout, /--origin=<HTTPS_ORIGIN>/);
  for (const path of Object.values(paths)) assert.equal(existsSync(path), false);
}));

test('LAN configuration writes matching origins beside the script from an unrelated cwd', () => temporaryProject(({ invoke, paths, elsewhere }) => {
  successful(invoke('--host=192.168.1.42'));
  assert.deepEqual(readSettings(paths.frontend), { EXPO_PUBLIC_API_URL: 'http://192.168.1.42:3001/api/v1' });
  assert.deepEqual(readSettings(paths.backend), {
    PORT: '3001', HOST: '0.0.0.0', PUBLIC_WEB_ORIGIN: 'http://192.168.1.42:3001',
    DATABASE_PATH: '../data/emergency-qr.sqlite', WEB_DIST_PATH: '../frontend/dist',
    ALLOWED_ORIGINS: 'http://192.168.1.42:3001,http://192.168.1.42:8081,http://localhost:8081',
  });
  assert.equal(existsSync(join(elsewhere, 'frontend')), false);
  assert.equal(existsSync(join(elsewhere, 'backend')), false);
}));

test('HTTPS origins normalize the trailing slash, host case and default port', () => {
  for (const supplied of ['https://Example.TEST:443/', 'https://example.test']) {
    temporaryProject(({ invoke, paths }) => {
      successful(invoke(`--origin=${supplied}`));
      assert.equal(readSettings(paths.frontend).EXPO_PUBLIC_API_URL, 'https://example.test/api/v1');
      const backend = readSettings(paths.backend);
      assert.equal(backend.PUBLIC_WEB_ORIGIN, 'https://example.test');
      assert.equal(backend.ALLOWED_ORIGINS, 'https://example.test,http://localhost:8081');
    });
  }
  temporaryProject(({ invoke, paths }) => {
    successful(invoke('--origin=https://example.test:8443/'));
    assert.equal(readSettings(paths.frontend).EXPO_PUBLIC_API_URL, 'https://example.test:8443/api/v1');
    assert.equal(readSettings(paths.backend).PUBLIC_WEB_ORIGIN, 'https://example.test:8443');
  });
});

test('host validation rejects malformed, loopback, wildcard, multicast and IPv6 inputs', () => temporaryProject(({ invoke, paths }) => {
  for (const host of ['', 'localhost', '127.0.0.1', '127.9.1.2', '0.0.0.0', '0.1.2.3',
    '224.0.0.1', '255.255.255.255', '192.168.1.999', '192.168.001.2', '192.168.1.2:3001',
    '192.168.1.2/path', '192.168.1.2\nALLOWED_ORIGINS=*', '::1', 'fe80::1']) {
    failedWithoutFiles(invoke(`--host=${host}`), paths);
  }
}));

test('origin validation rejects non-HTTPS, credentials, URL suffixes and dotenv injection', () => temporaryProject(({ invoke, paths }) => {
  for (const origin of ['', 'not-an-origin', 'http://example.test', 'ftp://example.test',
    'https://user:private-password@example.test', 'https://example.test/path',
    'https://example.test/?x=1', 'https://example.test/#fragment',
    'https://example.test?', 'https://example.test#', 'https://example.test\\path',
    'https://example.test\nALLOWED_ORIGINS=*', ' https://example.test']) {
    const result = invoke(`--origin=${origin}`);
    failedWithoutFiles(result, paths);
    assert.equal(`${result.stdout}${result.stderr}`.includes('private-password'), false);
  }
}));

test('argument validation rejects ambiguous, duplicate and unknown options without writes', () => temporaryProject(({ invoke, paths }) => {
  for (const args of [
    ['--force'], ['--host=192.168.1.42', '--origin=https://example.test'],
    ['--host=192.168.1.42', '--host=192.168.1.43'],
    ['--origin=https://example.test', '--origin=https://second.test'],
    ['--host=192.168.1.42', '--force', '--force'],
    ['--host=192.168.1.42', '--unknown'], ['--host', '192.168.1.42'],
  ]) failedWithoutFiles(invoke(...args), paths);
}));

test('either existing env prevents changing or creating either file without force', () => {
  for (const existing of ['frontend', 'backend']) {
    temporaryProject(({ invoke, paths }) => {
      const marker = 'EXISTING_VALUE=keep-exactly\n';
      writeFileSync(paths[existing], marker);
      const result = invoke('--host=192.168.1.42');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--force/);
      assert.equal(readFileSync(paths[existing], 'utf8'), marker);
      const other = existing === 'frontend' ? 'backend' : 'frontend';
      assert.equal(existsSync(paths[other]), false);
    });
  }
});

test('explicit force updates both env files and invalid forced input preserves them', () => temporaryProject(({ invoke, paths }) => {
  successful(invoke('--host=192.168.1.42'));
  successful(invoke('--origin=https://example.test/', '--force'));
  assert.equal(readSettings(paths.frontend).EXPO_PUBLIC_API_URL, 'https://example.test/api/v1');
  assert.equal(readSettings(paths.backend).PUBLIC_WEB_ORIGIN, 'https://example.test');
  const before = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, readFileSync(path, 'utf8')]));
  assert.equal(invoke('--host=127.0.0.1', '--force').status, 1);
  for (const [name, path] of Object.entries(paths)) assert.equal(readFileSync(path, 'utf8'), before[name]);
}));

test('missing project folders are reported before either env is written', () => temporaryProject(({ invoke, paths, project }) => {
  rmdirSync(join(project, 'backend')); // Empty directory in this test's temporary project.
  const result = invoke('--host=192.168.1.42');
  failedWithoutFiles(result, paths);
  assert.match(result.stderr, /backend/);
}));
