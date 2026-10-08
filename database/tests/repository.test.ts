import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openRepository } from '../src/index.ts';
import type { CardInput, CardRepository, OwnerCard, StoredCard } from '../src/index.ts';

const created = '2026-10-01T09:00:00.000Z';
const later = '2026-10-01T09:05:00.000Z';
const token = () => randomBytes(32).toString('base64url');
const hash = () => randomBytes(32).toString('hex');
function fixture(overrides: Partial<StoredCard> = {}): StoredCard {
  return {
    id: randomUUID(), publicToken: token(), ownerTokenHash: hash(),
    displayName: 'Демо-владелец',
    emergencyContact: { name: 'Демо-контакт', relationship: 'Родственник', phone: '+999000000001' },
    importantInfo: 'ДЕМОНСТРАЦИЯ. Вымышленные сведения.',
    publishImportantInfo: false, consentToPublish: true, status: 'active',
    consentAt: created, createdAt: created, updatedAt: created,
    photoDataUrl: null, ...overrides,
  };
}
function owner(record: StoredCard): OwnerCard {
  const { ownerTokenHash: _hash, ...card } = record;
  return card;
}
function input(record: StoredCard): CardInput {
  return {
    displayName: record.displayName, emergencyContact: record.emergencyContact,
    importantInfo: record.importantInfo, publishImportantInfo: record.publishImportantInfo,
    consentToPublish: true,
  };
}
function memory(run: (repo: CardRepository) => void): void {
  const repo = openRepository({ databasePath: ':memory:' });
  try { run(repo); } finally { repo.close(); }
}

test('create/read preserve the contract and never expose owner credentials', () => memory(repo => {
  const record = fixture();
  const result = repo.createCard(record);
  assert.deepEqual(result, owner(record));
  assert.deepEqual(repo.getOwnerCard(record.ownerTokenHash), owner(record));
  assert.equal(typeof result.publishImportantInfo, 'boolean');
  assert.equal(result.consentToPublish, true);
  assert.equal('ownerTokenHash' in result, false);
  assert.equal('ownerToken' in result, false);
  // Returned objects are snapshots, not a mutable backing store.
  result.emergencyContact.name = 'Изменение результата';
  assert.equal(repo.getOwnerCard(record.ownerTokenHash)?.emergencyContact.name, 'Демо-контакт');
}));

test('direct public read hides the stored note and uses an exact allowlist', () => memory(repo => {
  const record = fixture();
  repo.createCard(record);
  assert.deepEqual(repo.getPublicCard(record.publicToken), {
    displayName: record.displayName, emergencyContact: record.emergencyContact,
    importantInfo: null, updatedAt: created,
    photoDataUrl: null,
  });
  assert.equal(repo.getOwnerCard(record.ownerTokenHash)?.importantInfo, record.importantInfo);
  repo.replaceCard(record.ownerTokenHash, { ...input(record), publishImportantInfo: true }, later);
  assert.equal(repo.getPublicCard(record.publicToken)?.importantInfo, record.importantInfo);
  repo.replaceCard(record.ownerTokenHash, { ...input(record), importantInfo: null, publishImportantInfo: true }, later);
  assert.equal(repo.getPublicCard(record.publicToken)?.importantInfo, null);
  assert.equal(repo.getOwnerCard(record.ownerTokenHash)?.importantInfo, null);
}));

test('replace changes only user fields, consentAt and updatedAt; QR and inactive status survive', () => memory(repo => {
  const record = fixture({ status: 'inactive' });
  repo.createCard(record);
  const replacement = {
    ...input(record), displayName: 'Другой демо-владелец', importantInfo: null,
    emergencyContact: { name: 'Другой контакт', relationship: '', phone: '+999000000002' },
    publishImportantInfo: true,
  };
  assert.deepEqual(repo.replaceCard(record.ownerTokenHash, replacement, later), {
    ...owner(record), ...replacement, consentAt: later, updatedAt: later,
  });
  assert.equal(repo.getPublicCard(record.publicToken), null);
}));

test('deactivate/reactivate preserve QR, credentials and consent date', () => memory(repo => {
  const record = fixture();
  repo.createCard(record);
  assert.deepEqual(repo.setStatus(record.ownerTokenHash, 'inactive', later), {
    ...owner(record), status: 'inactive', updatedAt: later,
  });
  assert.equal(repo.getPublicCard(record.publicToken), null);
  assert.deepEqual(repo.setStatus(record.ownerTokenHash, 'active', later), {
    ...owner(record), updatedAt: later,
  });
  assert.ok(repo.getPublicCard(record.publicToken));
}));

test('rotation invalidates old QR and preserves both active and inactive status', () => memory(repo => {
  for (const status of ['active', 'inactive'] as const) {
    const record = fixture({ status });
    repo.createCard(record);
    const next = token();
    assert.deepEqual(repo.rotatePublicToken(record.ownerTokenHash, next, later), {
      ...owner(record), publicToken: next, updatedAt: later,
    });
    assert.equal(repo.getPublicCard(record.publicToken), null);
    assert.equal(repo.getPublicCard(next) !== null, status === 'active');
    repo.setStatus(record.ownerTokenHash, 'active', later);
    assert.ok(repo.getPublicCard(next));
    assert.equal(repo.getPublicCard(record.publicToken), null);
  }
}));

test('unknown credentials cannot read, update, rotate or delete another card', () => memory(repo => {
  const record = fixture();
  repo.createCard(record);
  const stranger = hash();
  assert.equal(repo.getOwnerCard(stranger), null);
  assert.equal(repo.getOwnerCard(record.publicToken), null);
  assert.equal(repo.getPublicCard(token()), null);
  assert.equal(repo.replaceCard(stranger, input(record), later), null);
  assert.equal(repo.setStatus(stranger, 'inactive', later), null);
  assert.equal(repo.rotatePublicToken(stranger, token(), later), null);
  assert.equal(repo.deleteCard(stranger), false);
  assert.deepEqual(repo.getOwnerCard(record.ownerTokenHash), owner(record));
}));

test('delete removes owner and public access and returns false on second deletion', () => memory(repo => {
  const record = fixture();
  repo.createCard(record);
  assert.equal(repo.deleteCard(record.ownerTokenHash), true);
  assert.equal(repo.getOwnerCard(record.ownerTokenHash), null);
  assert.equal(repo.getPublicCard(record.publicToken), null);
  assert.equal(repo.deleteCard(record.ownerTokenHash), false);
}));

test('SQL-like values and quotes remain data, including lookup parameters', () => memory(repo => {
  const record = fixture({ displayName: "Демо O'Connor", importantInfo: "'); DROP TABLE cards; --" });
  repo.createCard(record);
  assert.deepEqual(repo.getOwnerCard(record.ownerTokenHash), owner(record));
  assert.equal(repo.getOwnerCard("' OR 1=1 --"), null);
  assert.equal(repo.getPublicCard("' OR 1=1 --"), null);
  const edit = { ...input(record), displayName: "'); DELETE FROM cards; --" };
  assert.equal(repo.replaceCard(record.ownerTokenHash, edit, later)?.displayName, edit.displayName);
  assert.ok(repo.createCard(fixture()));
}));

test('UNIQUE conflicts fail without overwriting existing cards or exposing secrets', () => memory(repo => {
  const first = fixture();
  const second = fixture();
  repo.createCard(first);
  repo.createCard(second);
  const safeError = (error: unknown) => {
    assert.ok(error instanceof Error);
    for (const secret of [first.ownerTokenHash, first.publicToken, first.importantInfo!]) {
      assert.equal(String(error).includes(secret), false);
    }
    assert.equal(error.cause, undefined);
    return true;
  };
  for (const collision of [{ id: first.id }, { publicToken: first.publicToken }, { ownerTokenHash: first.ownerTokenHash }]) {
    assert.throws(() => repo.createCard(fixture(collision)), safeError);
  }
  assert.throws(() => repo.rotatePublicToken(second.ownerTokenHash, first.publicToken, later), safeError);
  assert.deepEqual(repo.getOwnerCard(first.ownerTokenHash), owner(first));
  assert.deepEqual(repo.getOwnerCard(second.ownerTokenHash), owner(second));
}));

test('constraints reject invalid records and leave existing rows unchanged', () => memory(repo => {
  const invalid: Partial<StoredCard>[] = [
    { id: '' }, { publicToken: 'short' }, { ownerTokenHash: 'short' },
    { displayName: '' }, { displayName: 'x'.repeat(81) },
    { importantInfo: '' }, { importantInfo: 'x'.repeat(501) },
    { consentToPublish: false as unknown as true },
    { status: 'deleted' as StoredCard['status'] },
    ...[{ name: '' }, { name: 'x'.repeat(81) }, { relationship: 'x'.repeat(41) },
      { phone: '123' }, { phone: '+012345678' }, { phone: '+1234567x' }]
      .map(fields => ({ emergencyContact: { ...fixture().emergencyContact, ...fields } })),
  ];
  for (const values of invalid) assert.throws(() => repo.createCard(fixture(values)));
  const record = fixture();
  repo.createCard(record);
  assert.throws(() => repo.replaceCard(record.ownerTokenHash, { ...input(record), displayName: '' }, later));
  assert.deepEqual(repo.getOwnerCard(record.ownerTokenHash), owner(record));
}));

test('boundary lengths, empty relationship and null notes are accepted', () => memory(repo => {
  const record = fixture({
    displayName: 'я'.repeat(80), importantInfo: 'я'.repeat(500),
    emergencyContact: { name: 'я'.repeat(80), relationship: 'я'.repeat(40), phone: '+123456789012345' },
  });
  assert.deepEqual(repo.createCard(record), owner(record));
  const short = fixture({ importantInfo: null, emergencyContact: { name: 'я', relationship: '', phone: '+12345678' } });
  assert.deepEqual(repo.createCard(short), owner(short));
}));

test('file database survives close/reopen and migration is recorded only once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'emergency-qr-test-'));
  const databasePath = join(directory, 'nested', 'cards.sqlite');
  let repo: CardRepository | undefined;
  let inspection: DatabaseSync | undefined;
  try {
    const record = fixture();
    repo = openRepository({ databasePath });
    assert.equal(repo.getOwnerCard(record.ownerTokenHash), null); // No automatic seed.
    repo.createCard(record);
    repo.close();
    repo = openRepository({ databasePath });
    assert.deepEqual(repo.getOwnerCard(record.ownerTokenHash), owner(record));
    assert.equal(repo.getPublicCard(record.publicToken)?.importantInfo, null);
    inspection = new DatabaseSync(databasePath);
    const migrations = inspection.prepare('SELECT * FROM schema_migrations').all();
    assert.equal(migrations.length, 1);
    assert.equal(migrations[0]?.version, 1);
    assert.equal(inspection.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
    const raw = inspection.prepare('SELECT * FROM cards').get()!;
    assert.equal(raw.publish_important_info, 0);
    assert.equal(raw.consent_to_publish, 1);
    assert.equal('owner_token' in raw, false);
    repo.close();
    repo = openRepository({ databasePath });
    assert.deepEqual(inspection.prepare('SELECT * FROM schema_migrations').all(), migrations);
    assert.equal(repo.deleteCard(record.ownerTokenHash), true);
    assert.equal(inspection.prepare('SELECT count(*) AS n FROM cards').get()?.n, 0);
  } finally {
    inspection?.close();
    repo?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('close is idempotent and releases the connection', () => {
  const repo = openRepository({ databasePath: ':memory:' });
  repo.close();
  repo.close();
  assert.throws(() => repo.getOwnerCard(hash()), /Database operation failed/);
});

test('migration paths are independent of the working directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'emergency-qr-cwd-'));
  try {
    const moduleUrl = new URL('../src/index.ts', import.meta.url).href;
    const script = `
      import { openRepository } from ${JSON.stringify(moduleUrl)};
      const repo = openRepository({ databasePath: ':memory:' });
      try {
        if (repo.getOwnerCard('unknown') !== null) throw new Error('Unexpected seed');
      } finally { repo.close(); }
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: directory, stdio: 'pipe',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('failed migration rolls back schema and version, then a corrected migration can run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'emergency-qr-rollback-'));
  const databasePath = join(directory, 'test.sqlite');
  let inspection: DatabaseSync | undefined;
  try {
    // Fault injection touches only a disposable copy, never production migrations.
    const copy = join(directory, 'database');
    // Use read/write instead of cpSync: native copying crashes on this Windows
    // Node 24.14.0 environment, before any SQLite code executes.
    mkdirSync(join(copy, 'src'), { recursive: true });
    mkdirSync(join(copy, 'migrations'), { recursive: true });
    for (const file of ['src/index.ts', 'src/contracts.ts', 'src/repository.ts', 'migrations/001_init.sql']) {
      writeFileSync(join(copy, file), readFileSync(new URL('../' + file, import.meta.url)));
    }
    writeFileSync(join(copy, 'package.json'), JSON.stringify({ type: 'module' }));
    const migrationPath = join(copy, 'migrations', '001_init.sql');
    const originalSql = readFileSync(migrationPath, 'utf8');
    writeFileSync(migrationPath, originalSql + '\nTHIS IS INVALID SQL;');
    const script = `
      import { openRepository } from './database/src/index.ts';
      const repo = openRepository({ databasePath: './test.sqlite' });
      repo.close();
    `;
    const run = () => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: directory, stdio: 'pipe',
    });
    assert.throws(run, /Database initialization failed/);
    inspection = new DatabaseSync(databasePath);
    assert.equal(inspection.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get()?.n, 0);
    inspection.close();
    inspection = undefined;
    writeFileSync(migrationPath, originalSql);
    run();
    inspection = new DatabaseSync(databasePath);
    assert.equal(inspection.prepare('SELECT count(*) AS n FROM schema_migrations').get()?.n, 1);
    assert.equal(inspection.prepare('SELECT count(*) AS n FROM cards').get()?.n, 0);
  } finally {
    inspection?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
