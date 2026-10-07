import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { FakeRepository } from './fake-repository.ts';
import type { CardInput } from '../src/contracts.ts';
import { loadConfig } from '../src/config.ts';
import { normalizeOrigin } from '../src/security.ts';

export const input: CardInput = {
  displayName: '  Демо Персона  ',
  emergencyContact: { name: '  Демо Контакт  ', relationship: '  друг  ', phone: '+12025550123' },
  importantInfo: '  Вымышленная заметка  ', publishImportantInfo: false, consentToPublish: true,
};
const origin = 'http://192.168.1.50:3001';
function fixture(extra = {}) {
  const repo = new FakeRepository();
  const app = createApp({ repo, publicWebOrigin: origin, allowedOrigins: [origin, 'http://localhost:8081'], ...extra });
  return { app, repo, http: request(app) };
}
function apiError(response: request.Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, 'string');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.body.error.stack, undefined);
}

test('health advertises exactly the shared contract and disables caching', async () => {
  const { http } = fixture();
  const r = await http.get('/api/v1/health').expect(200);
  assert.deepEqual(r.body, { ok: true, contractVersion: 'emergency-qr-v1' });
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('create normalizes input, persists only a key hash and returns an origin-controlled URL', async () => {
  const { http, repo } = fixture();
  const r = await http.post('/api/v1/cards').set('Host', 'attacker.invalid').set('X-Forwarded-Host', 'attacker.invalid').send(input).expect(201);
  const { card, ownerToken, publicUrl } = r.body;
  assert.match(ownerToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(card.publicToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(ownerToken, card.publicToken);
  assert.match(card.id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.equal(card.displayName, 'Демо Персона');
  assert.equal(card.emergencyContact.name, 'Демо Контакт');
  assert.equal(card.emergencyContact.relationship, 'друг');
  assert.equal(card.importantInfo, 'Вымышленная заметка');
  assert.equal(card.status, 'active');
  assert.equal(card.consentAt, card.createdAt);
  assert.equal(card.updatedAt, card.createdAt);
  assert.equal(new Date(card.createdAt).toISOString(), card.createdAt);
  assert.equal(publicUrl, `${origin}/q/${card.publicToken}`);
  assert.equal(card.ownerTokenHash, undefined);
  const persisted = repo.records.get(createHash('sha256').update(ownerToken).digest('hex'))!;
  assert.ok(persisted);
  assert.equal('ownerToken' in persisted, false);
});

test('full lifecycle preserves identities, permission boundaries and inactive rotation', async () => {
  const { http } = fixture();
  const created = (await http.post('/api/v1/cards').send(input).expect(201)).body;
  const auth = `Bearer ${created.ownerToken}`;
  const publicPath = `/api/v1/public/cards/${created.card.publicToken}`;
  const owner = await http.get('/api/v1/me/card').set('Authorization', auth).expect(200);
  assert.equal(owner.body.ownerToken, undefined);
  assert.equal(owner.body.card.ownerTokenHash, undefined);
  const pub = await http.get(publicPath).expect(200);
  assert.deepEqual(Object.keys(pub.body).sort(), ['displayName', 'emergencyContact', 'importantInfo', 'updatedAt']);
  assert.deepEqual(Object.keys(pub.body.emergencyContact).sort(), ['name', 'phone', 'relationship']);
  assert.equal(pub.body.importantInfo, null);
  assert.equal(JSON.stringify(pub.body).includes(created.ownerToken), false);
  assert.equal(JSON.stringify(pub.body).includes(created.card.publicToken), false);
  await new Promise(resolve => setTimeout(resolve, 5));
  const edited = (await http.put('/api/v1/me/card').set('Authorization', auth).send({ ...input, displayName: 'Демо Новое имя', publishImportantInfo: true }).expect(200)).body;
  for (const key of ['id', 'publicToken', 'createdAt', 'status']) assert.equal(edited.card[key], created.card[key]);
  assert.equal(edited.publicUrl, created.publicUrl);
  assert.notEqual(edited.card.updatedAt, created.card.updatedAt);
  assert.equal(edited.card.consentAt, edited.card.updatedAt);
  assert.equal((await http.get(publicPath)).body.importantInfo, 'Вымышленная заметка');
  assert.equal((await http.get(publicPath)).body.displayName, 'Демо Новое имя');
  const disabled = (await http.patch('/api/v1/me/card/status').set('Authorization', auth).send({ status: 'inactive' }).expect(200)).body;
  assert.equal(disabled.card.consentAt, edited.card.consentAt);
  assert.equal(disabled.card.status, 'inactive');
  const hidden = await http.get(publicPath);
  apiError(hidden, 404, 'NOT_FOUND');
  const rotated = (await http.post('/api/v1/me/card/rotate-qr').set('Authorization', auth).send({}).expect(200)).body;
  assert.equal(rotated.card.status, 'inactive');
  assert.notEqual(rotated.card.publicToken, created.card.publicToken);
  assert.equal(rotated.card.consentAt, edited.card.consentAt);
  assert.deepEqual((await http.get(`/api/v1/public/cards/${rotated.card.publicToken}`)).body, hidden.body);
  await http.patch('/api/v1/me/card/status').set('Authorization', auth).send({ status: 'active' }).expect(200);
  await http.get(`/api/v1/public/cards/${rotated.card.publicToken}`).expect(200);
  assert.deepEqual((await http.get(publicPath)).body, hidden.body);
  const deleted = await http.delete('/api/v1/me/card').set('Authorization', auth).expect(204);
  assert.equal(deleted.text, '');
  apiError(await http.get('/api/v1/me/card').set('Authorization', auth), 401, 'UNAUTHORIZED');
  assert.deepEqual((await http.get(`/api/v1/public/cards/${rotated.card.publicToken}`)).body, hidden.body);
});

test('missing, malformed, unknown and public tokens all deny every owner operation', async () => {
  const { http } = fixture();
  const created = (await http.post('/api/v1/cards').send(input)).body;
  let expected;
  for (const token of ['', 'Basic x', 'Bearer short', `Bearer ${'x'.repeat(43)}`, `Bearer ${created.card.publicToken}`, `Bearer ${'a'.repeat(42)}!`]) {
    for (const method of ['get', 'put', 'patch', 'post', 'delete'] as const) {
      const suffix = method === 'patch' ? '/status' : method === 'post' ? '/rotate-qr' : '';
      let r = http[method](`/api/v1/me/card${suffix}`);
      if (token) r = r.set('Authorization', token);
      if (method === 'put') r = r.send(input);
      if (method === 'patch') r = r.send({ status: 'inactive' });
      if (method === 'post') r = r.send({});
      const response = await r;
      apiError(response, 401, 'UNAUTHORIZED');
      expected ??= response.body;
      assert.deepEqual(response.body, expected);
    }
  }
  await http.get(`/api/v1/public/cards/${created.card.publicToken}`).expect(200);
});

test('validation rejects missing, unknown and invalid nested fields without coercion', async () => {
  const { http } = fixture({ rateLimits: { create: { limit: 200, windowMs: 60000 } } });
  const invalid = [
    {}, null, [], { ...input, consentToPublish: false }, { ...input, consentToPublish: 'true' },
    { ...input, publishImportantInfo: 'false' }, { ...input, importantInfo: '' }, { ...input, importantInfo: '  ' },
    { ...input, importantInfo: 'x'.repeat(501) }, { ...input, displayName: ' ' }, { ...input, displayName: 'x'.repeat(81) },
    { ...input, id: 'injected' }, { ...input, ownerTokenHash: 'injected' },
    ...['name', 'relationship', 'phone'].map(key => ({ ...input, emergencyContact: Object.fromEntries(Object.entries(input.emergencyContact).filter(([k]) => k !== key)) })),
    ...['displayName', 'emergencyContact', 'importantInfo', 'publishImportantInfo', 'consentToPublish'].map(key => Object.fromEntries(Object.entries(input).filter(([k]) => k !== key))),
    ...[{ name: '' }, { name: 'x'.repeat(81) }, { relationship: 'x'.repeat(41) }, { phone: '+0123456789' }, { phone: '+1234567' }, { phone: '+1234567890123456' }, { phone: ' +12025550123 ' }, { hidden: true }].map(change => ({ ...input, emergencyContact: { ...input.emergencyContact, ...change } })),
  ];
  for (const value of invalid) apiError(await http.post('/api/v1/cards').set('Content-Type', 'application/json').send(JSON.stringify(value)), 400, 'VALIDATION_ERROR');
  await http.post('/api/v1/cards').send({ ...input, displayName: 'x'.repeat(80), importantInfo: 'x'.repeat(500), emergencyContact: { name: 'x'.repeat(80), relationship: '', phone: '+12345678' } }).expect(201);
});

test('update/status/rotation accept only their exact request shape', async () => {
  const { http } = fixture();
  const c = (await http.post('/api/v1/cards').send(input)).body;
  const auth = `Bearer ${c.ownerToken}`;
  for (const change of [{ status: 'inactive' }, { publicToken: 'x'.repeat(43) }, { ownerTokenHash: 'x' }, { createdAt: 'today' }]) {
    apiError(await http.put('/api/v1/me/card').set('Authorization', auth).send({ ...input, ...change }), 400, 'VALIDATION_ERROR');
  }
  for (const body of [{}, { status: 'deleted' }, { status: 'inactive', displayName: 'x' }]) {
    apiError(await http.patch('/api/v1/me/card/status').set('Authorization', auth).send(body), 400, 'VALIDATION_ERROR');
  }
  apiError(await http.post('/api/v1/me/card/rotate-qr').set('Authorization', auth).send({ publicToken: 'x' }), 400, 'VALIDATION_ERROR');
  assert.equal((await http.get(`/api/v1/public/cards/${c.card.publicToken}`)).status, 200);
});

test('invalid, inactive, missing and replaced public URLs share the same JSON 404', async () => {
  const { http } = fixture();
  const first = await http.get('/api/v1/public/cards/invalid');
  apiError(first, 404, 'NOT_FOUND');
  for (const token of ['x'.repeat(43), 'x'.repeat(44), '!'.repeat(43)]) assert.deepEqual((await http.get(`/api/v1/public/cards/${token}`)).body, first.body);
});

test('parser failures, size and media type have stable JSON errors', async () => {
  const { http } = fixture();
  apiError(await http.post('/api/v1/cards').set('Content-Type', 'application/json').send('{'), 400, 'VALIDATION_ERROR');
  apiError(await http.post('/api/v1/cards').send({ ...input, importantInfo: 'x'.repeat(17000) }), 413, 'VALIDATION_ERROR');
  apiError(await http.post('/api/v1/cards').type('text').send('{}'), 415, 'VALIDATION_ERROR');
  apiError(await http.post('/api/v1/cards'), 415, 'VALIDATION_ERROR');
});

test('CORS uses exact origins, supports preflight and native requests, blocks disallowed writes', async () => {
  const { http, repo } = fixture();
  const preflight = await http.options('/api/v1/me/card').set('Origin', origin).set('Access-Control-Request-Method', 'PUT').set('Access-Control-Request-Headers', 'authorization,content-type').expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
  assert.match(preflight.headers['access-control-allow-methods'], /PATCH/);
  assert.equal(preflight.headers['access-control-allow-credentials'], undefined);
  assert.match(preflight.headers.vary, /Origin/);
  const disallowed = await http.post('/api/v1/cards').set('Origin', 'https://attacker.invalid').send(input);
  apiError(disallowed, 400, 'VALIDATION_ERROR');
  assert.equal(disallowed.headers['access-control-allow-origin'], undefined);
  assert.equal(repo.records.size, 0);
  await http.post('/api/v1/cards').send(input).expect(201);
  apiError(await http.get('/api/v1/me/card').set('Origin', origin), 401, 'UNAUTHORIZED');
});

test('rate limits are independent, include Retry-After and ignore forged proxy IP', async () => {
  const { http } = fixture({ rateLimits: { create: { limit: 1, windowMs: 60000 }, owner: { limit: 1, windowMs: 60000 }, public: { limit: 1, windowMs: 60000 } } });
  const c = (await http.post('/api/v1/cards').send(input).expect(201)).body;
  const limited = await http.post('/api/v1/cards').set('X-Forwarded-For', '203.0.113.42').send(input);
  apiError(limited, 429, 'RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) > 0);
  await http.get('/api/v1/me/card').set('Authorization', `Bearer ${c.ownerToken}`).expect(200);
  apiError(await http.get('/api/v1/me/card'), 429, 'RATE_LIMITED');
  await http.get(`/api/v1/public/cards/${c.card.publicToken}`).expect(200);
  apiError(await http.get('/api/v1/public/cards/invalid'), 429, 'RATE_LIMITED');
  await http.get('/api/v1/health').expect(200);
});

test('only explicitly trusted proxy addresses can separate forwarded client rate limits', async () => {
  const rateLimits = { create: { limit: 1, windowMs: 60000 } };
  const trusted = fixture({ trustedProxyAddresses: ['127.0.0.1', '::1'], rateLimits });
  await trusted.http.post('/api/v1/cards').set('X-Forwarded-For', '203.0.113.10').send(input).expect(201);
  await trusted.http.post('/api/v1/cards').set('X-Forwarded-For', '203.0.113.11').send(input).expect(201);
  apiError(await trusted.http.post('/api/v1/cards').set('X-Forwarded-For', '203.0.113.10').send(input), 429, 'RATE_LIMITED');

  const untrusted = fixture({ trustedProxyAddresses: ['172.30.42.2'], rateLimits });
  await untrusted.http.post('/api/v1/cards').set('X-Forwarded-For', '203.0.113.10').send(input).expect(201);
  apiError(await untrusted.http.post('/api/v1/cards').set('X-Forwarded-For', '203.0.113.11').send(input), 429, 'RATE_LIMITED');
});

test('proxy configuration permits explicit IPs and CIDRs but rejects trust-all and hop counts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emergency-qr-proxy-config-'));
  const env = { PUBLIC_WEB_ORIGIN: origin, ALLOWED_ORIGINS: origin };
  assert.deepEqual(loadConfig({ backendDir: dir, env }).trustedProxyAddresses, []);
  assert.deepEqual(loadConfig({ backendDir: dir, env: { ...env, TRUST_PROXY: '172.30.42.2, 192.0.2.0/24, ::1' } }).trustedProxyAddresses,
    ['172.30.42.2', '192.0.2.0/24', '::1']);
  for (const value of ['true', '1', '*', 'loopback', 'example.com', '0.0.0.0/0', '::/0', '192.0.2.0/33', '::1/129', '172.30.42.2,']) {
    assert.throws(() => loadConfig({ backendDir: dir, env: { ...env, TRUST_PROXY: value } }), value);
    assert.throws(() => fixture({ trustedProxyAddresses: [value] }), value);
  }
});

test('unknown API paths never become HTML, even with malformed bodies', async () => {
  const { http } = fixture();
  for (const path of ['/api', '/api/nope', '/api/v1/nope', '/API/v1/nope']) {
    apiError(await http.get(path).set('Accept', 'text/html'), 404, 'NOT_FOUND');
    apiError(await http.post(path).type('json').send('{'), 404, 'NOT_FOUND');
  }
});

test('repository failures never expose stacks, storage details or private data', async () => {
  const { http, repo } = fixture();
  repo.createCard = () => { throw new Error('secret-database-path-and-key'); };
  const r = await http.post('/api/v1/cards').send(input);
  apiError(r, 500, 'INTERNAL_ERROR');
  assert.equal(r.text.includes('secret-database'), false);
  assert.equal(r.text.includes('Error:'), false);
});

test('web host supports late builds and SPA routes but never exposes internal files or substitutes assets', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'emergency-qr-web-'));
  const dist = join(temp, 'dist');
  const { http } = fixture({ webDistPath: dist });
  const unavailable = await http.get('/q/' + 'x'.repeat(43)).expect(503);
  assert.match(unavailable.text, /Сначала выполните npm run build:web/);
  await http.get('/api/v1/health').expect(200);
  mkdirSync(dist);
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Demo SPA</title>');
  writeFileSync(join(dist, 'assets/app.js'), 'window.demo = true;');
  writeFileSync(join(dist, '.env'), 'PRIVATE');
  mkdirSync(join(dist, 'database'));
  writeFileSync(join(dist, 'database/test.txt'), 'PRIVATE');
  for (const path of ['/', '/q/' + 'x'.repeat(43), '/my', '/edit', '/restore']) {
    const r = await http.get(path).set('Accept', 'text/html').expect(200);
    assert.match(r.text, /Demo SPA/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-powered-by'], undefined);
  }
  await http.get('/assets/app.js').expect(200);
  for (const path of ['/assets/missing.js', '/missing.css', '/.env', '/%2eenv', '/database/test.txt', '/data/file', '/backend/src/app.ts', '/.git/config']) {
    const r = await http.get(path).set('Accept', 'text/html').expect(404);
    assert.equal(r.text.includes('Demo SPA'), false);
    assert.equal(r.text.includes('PRIVATE'), false);
  }
  apiError(await http.get('/api/v1/missing'), 404, 'NOT_FOUND');
});

test('configuration loads backend .env and resolves file paths independently of cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emergency-qr-config-'));
  writeFileSync(join(dir, '.env'), [
    'PORT=3001', 'HOST=0.0.0.0', 'PUBLIC_WEB_ORIGIN=http://192.168.1.50:3001/',
    'DATABASE_PATH=../data/emergency-qr.sqlite', 'WEB_DIST_PATH=../frontend/dist',
    'ALLOWED_ORIGINS=http://192.168.1.50:3001,http://localhost:8081', 'RATE_LIMIT_CREATE_MAX=7',
  ].join('\n'));
  const config = loadConfig({ backendDir: dir, env: {} });
  assert.equal(config.publicWebOrigin, origin);
  assert.equal(config.databasePath, resolve(dir, '../data/emergency-qr.sqlite'));
  assert.equal(config.webDistPath, resolve(dir, '../frontend/dist'));
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 3001);
  assert.equal(config.rateLimits.create.limit, 7);
  assert.equal(config.rateLimits.owner.limit, 120);
  assert.equal(loadConfig({ backendDir: dir, env: { PORT: '3002' } }).port, 3002);
  for (const env of [{ PORT: '0' }, { PORT: '1.5' }, { PORT: '65536' }, { ALLOWED_ORIGINS: '*' }, { PUBLIC_WEB_ORIGIN: 'https://example.com/path' }, { RATE_LIMIT_CREATE_MAX: '-1' }]) {
    assert.throws(() => loadConfig({ backendDir: dir, env }));
  }
});

test('origins reject paths, credentials, fragments and URL normalization tricks', () => {
  for (const value of ['https://example.com/path', 'https://u:p@example.com', 'https://example.com?', 'https://example.com#', 'https://example.com/..', 'https://example.com//', 'https://example.com\\foo', 'ftp://example.com', '*', 'null']) {
    assert.throws(() => normalizeOrigin(value), value);
    assert.throws(() => fixture({ publicWebOrigin: value }), value);
  }
  assert.equal(normalizeOrigin('https://example.com/'), 'https://example.com');
});

test('configure CLI aligns both env files, refuses overwrite and works from unrelated cwd', () => {
  const temp = mkdtempSync(join(tmpdir(), 'emergency-qr-cli-'));
  const source = fileURLToPath(new URL('../../scripts', import.meta.url));
  cpSync(source, join(temp, 'scripts'), { recursive: true });
  mkdirSync(join(temp, 'backend'));
  mkdirSync(join(temp, 'frontend'));
  const run = (...args: string[]) => spawnSync(process.execPath, [join(temp, 'scripts/configure.mjs'), ...args], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(run().status, 0);
  assert.equal(existsSync(join(temp, 'backend/.env')), false);
  for (const flag of ['--host=localhost', '--host=127.0.0.1', '--host=0.0.0.0', '--host=224.0.0.1', '--host=999.1.1.1', '--origin=http://example.com', '--origin=https://example.com/path', '--unknown=x']) assert.notEqual(run(flag).status, 0);
  assert.notEqual(run('--host=192.168.1.50', '--origin=https://example.com').status, 0);
  const configured = run('--host=192.168.1.50');
  assert.equal(configured.status, 0, configured.stderr);
  const backend = readFileSync(join(temp, 'backend/.env'), 'utf8');
  assert.match(backend, /PUBLIC_WEB_ORIGIN=http:\/\/192.168.1.50:3001/);
  assert.match(backend, /ALLOWED_ORIGINS=http:\/\/192.168.1.50:3001,http:\/\/192.168.1.50:8081,http:\/\/localhost:8081/);
  assert.equal(readFileSync(join(temp, 'frontend/.env'), 'utf8'), 'EXPO_PUBLIC_API_URL=http://192.168.1.50:3001/api/v1\n');
  assert.notEqual(run('--origin=https://demo.example.com').status, 0);
  assert.equal(readFileSync(join(temp, 'backend/.env'), 'utf8'), backend);
  assert.equal(run('--origin=https://demo.example.com/', '--force').status, 0);
  assert.equal(readFileSync(join(temp, 'frontend/.env'), 'utf8'), 'EXPO_PUBLIC_API_URL=https://demo.example.com/api/v1\n');
});

test('configuration forbids protected directory descendants, aliases and Windows case variants', () => {
  const root = mkdtempSync(join(tmpdir(), 'emergency-qr-root-'));
  const backendDir = join(root, 'backend');
  mkdirSync(backendDir);
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'database'));
  symlinkSync(join(root, 'data'), join(root, 'export-alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const env = { PUBLIC_WEB_ORIGIN: origin, ALLOWED_ORIGINS: origin };
  const forbidden = ['..', '.', '../data/nested', '../database/nested', '../export-alias'];
  if (process.platform === 'win32') forbidden.push('../DATA', '../BACKEND');
  for (const WEB_DIST_PATH of forbidden) assert.throws(() => loadConfig({ backendDir, env: { ...env, WEB_DIST_PATH } }), WEB_DIST_PATH);
});

test('SPA fallback rejects an index.html symlink pointing outside the export', async t => {
  const temp = mkdtempSync(join(tmpdir(), 'emergency-qr-link-'));
  const dist = join(temp, 'dist');
  mkdirSync(dist);
  const outside = join(temp, 'outside.html');
  writeFileSync(outside, 'PRIVATE OUTSIDE EXPORT');
  try { symlinkSync(outside, join(dist, 'index.html'), 'file'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Windows account cannot create file symlinks.'); return; }
    throw error;
  }
  const { http } = fixture({ webDistPath: dist });
  const r = await http.get('/q/' + 'x'.repeat(43)).expect(404);
  assert.equal(r.text.includes('PRIVATE'), false);
});

test('static aliases cannot expose protected or hidden directories inside the export', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'emergency-qr-private-alias-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Demo SPA</title>');
  for (const [target, alias] of [['database', 'database-alias'], ['.private', 'hidden-alias']]) {
    mkdirSync(join(dist, target));
    writeFileSync(join(dist, target, 'private.txt'), 'PRIVATE EXPORT DATA');
    symlinkSync(join(dist, target), join(dist, alias), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const { http } = fixture({ webDistPath: dist });
  for (const alias of ['database-alias', 'hidden-alias']) {
    const response = await http.get(`/${alias}/private.txt`).expect(404);
    assert.equal(response.text.includes('PRIVATE EXPORT DATA'), false);
  }
  await http.get('/q/' + 'x'.repeat(43)).expect(200);
});

test('SPA routes work when the configured export has a hidden ancestor directory', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'emergency-qr-hidden-parent-'));
  const dist = join(temp, '.integration', 'web');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Hidden parent SPA</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'window.demo = true;');
  writeFileSync(join(dist, '.env'), 'PRIVATE EXPORT DATA');
  const { http } = fixture({ webDistPath: dist });
  for (const path of ['/', '/create', '/q/' + 'x'.repeat(43)]) {
    const response = await http.get(path).expect(200);
    assert.match(response.text, /Hidden parent SPA/);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  await http.get('/assets/app.js').expect(200);
  const hidden = await http.get('/.env').expect(404);
  assert.equal(hidden.text.includes('PRIVATE EXPORT DATA'), false);
});
