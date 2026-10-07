import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import type { CardRepository } from '../src/contracts.ts';

const moduleUrl = new URL('../../database/src/index.ts', import.meta.url);
test('real SQLite: API lifecycle and persistence after reopening', {
  skip: existsSync(moduleUrl) ? false : 'Не предоставлен database/src/index.ts от Ади; SQLite-интеграция не проверена.',
}, async () => {
  const { openRepository } = await import(moduleUrl.href) as {
    openRepository(options: { databasePath: string }): CardRepository;
  };
  const dir = mkdtempSync(join(tmpdir(), 'emergency-qr-sqlite-'));
  const databasePath = join(dir, 'test.sqlite');
  let repo = openRepository({ databasePath });
  const http = () => request(createApp({ repo, publicWebOrigin: 'http://192.168.1.50:3001', allowedOrigins: ['http://192.168.1.50:3001'] }));
  const input = { displayName: 'Вымышленная персона', emergencyContact: { name: 'Вымышленный контакт', relationship: 'друг', phone: '+12025550123' }, importantInfo: 'Демонстрационная заметка', publishImportantInfo: false, consentToPublish: true };
  try {
    const created = (await http().post('/api/v1/cards').send(input).expect(201)).body;
    const auth = `Bearer ${created.ownerToken}`;
    const publicPath = `/api/v1/public/cards/${created.card.publicToken}`;
    assert.equal((await http().get(publicPath).expect(200)).body.importantInfo, null);
    assert.equal((await http().get('/api/v1/me/card').set('Authorization', auth).expect(200)).body.card.ownerTokenHash, undefined);
    await http().get('/api/v1/me/card').expect(401);
    repo.close();
    repo = openRepository({ databasePath });
    assert.equal((await http().get('/api/v1/me/card').set('Authorization', auth).expect(200)).body.card.id, created.card.id);
    const edit = (await http().put('/api/v1/me/card').set('Authorization', auth).send({ ...input, displayName: 'Обновлённое демо', publishImportantInfo: true }).expect(200)).body;
    assert.equal(edit.publicUrl, created.publicUrl);
    assert.equal((await http().get(publicPath).expect(200)).body.displayName, 'Обновлённое демо');
    assert.equal((await http().get(publicPath).expect(200)).body.importantInfo, input.importantInfo);
    await http().patch('/api/v1/me/card/status').set('Authorization', auth).send({ status: 'inactive' }).expect(200);
    const unavailable = (await http().get(publicPath).expect(404)).body;
    await http().patch('/api/v1/me/card/status').set('Authorization', auth).send({ status: 'active' }).expect(200);
    await http().get(publicPath).expect(200);
    await http().patch('/api/v1/me/card/status').set('Authorization', auth).send({ status: 'inactive' }).expect(200);
    const rotated = (await http().post('/api/v1/me/card/rotate-qr').set('Authorization', auth).send({}).expect(200)).body;
    assert.equal(rotated.card.status, 'inactive');
    assert.notEqual(rotated.card.publicToken, created.card.publicToken);
    const newPath = `/api/v1/public/cards/${rotated.card.publicToken}`;
    assert.deepEqual((await http().get(newPath).expect(404)).body, unavailable);
    repo.close();
    repo = openRepository({ databasePath });
    assert.deepEqual((await http().get(publicPath).expect(404)).body, unavailable);
    assert.deepEqual((await http().get(newPath).expect(404)).body, unavailable);
    await http().patch('/api/v1/me/card/status').set('Authorization', auth).send({ status: 'active' }).expect(200);
    await http().get(newPath).expect(200);
    await http().delete('/api/v1/me/card').set('Authorization', auth).expect(204);
    repo.close();
    repo = openRepository({ databasePath });
    await http().get('/api/v1/me/card').set('Authorization', auth).expect(401);
    assert.deepEqual((await http().get(newPath).expect(404)).body, unavailable);
  } finally { repo.close(); }
});
