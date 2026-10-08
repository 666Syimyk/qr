import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue, SQLOutputValue, StatementSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CardRepository, CardStatus, OwnerCard, PublicCard } from './contracts.ts';

type Row = Record<string, SQLOutputValue>;

// Explicitly select only fields permitted in an owner response (never the hash).
const ownerColumns = `id, public_token, display_name, contact_name,
  contact_relationship, contact_phone, important_info, publish_important_info,
  consent_to_publish, status, consent_at, created_at, updated_at, photo_data_url`;

function toOwner(row: Row): OwnerCard {
  return {
    id: row.id as string,
    publicToken: row.public_token as string,
    displayName: row.display_name as string,
    emergencyContact: {
      name: row.contact_name as string,
      relationship: row.contact_relationship as string,
      phone: row.contact_phone as string,
    },
    importantInfo: row.important_info as string | null,
    publishImportantInfo: row.publish_important_info === 1,
    consentToPublish: true,
    status: row.status as CardStatus,
    consentAt: row.consent_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    photoDataUrl: row.photo_data_url as string | null,
  };
}

function toPublic(row: Row): PublicCard {
  return {
    displayName: row.display_name as string,
    emergencyContact: {
      name: row.contact_name as string,
      relationship: row.contact_relationship as string,
      phone: row.contact_phone as string,
    },
    importantInfo: row.important_info as string | null,
    updatedAt: row.updated_at as string,
    photoDataUrl: row.photo_data_url as string | null,
  };
}

// Intentionally discard SQL error details and causes: they can contain data.
function safely<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new Error('Database operation failed');
  }
}

function migrate(db: DatabaseSync): void {
  // IMMEDIATE serializes migration checks across concurrent connections.
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);
    const migrations = [
      { version: 1, url: new URL('../migrations/001_init.sql', import.meta.url) },
      { version: 2, url: new URL('../migrations/002_profile_photo.sql', import.meta.url) },
    ];
    const exists = db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
    const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
    for (const migration of migrations) {
      if (exists.get(migration.version)) continue;
      db.exec(readFileSync(migration.url, 'utf8'));
      record.run(migration.version, new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch {
    try { db.exec('ROLLBACK'); } catch { /* The caller closes the failed connection. */ }
    throw new Error('Database migration failed');
  }
}

export function openRepository(options: { databasePath: string }): CardRepository {
  let db: DatabaseSync | undefined;
  try {
    if (!options.databasePath) throw new Error('Empty database path');
    if (options.databasePath !== ':memory:') {
      mkdirSync(dirname(options.databasePath), { recursive: true });
    }
    db = new DatabaseSync(options.databasePath);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (options.databasePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    migrate(db);
    return createRepository(db);
  } catch {
    try { db?.close(); } catch { /* Preserve a sanitized initialization error. */ }
    throw new Error('Database initialization failed');
  }
}

function createRepository(db: DatabaseSync): CardRepository {
  const statements = {
    create: db.prepare(`INSERT INTO cards (
      id, public_token, owner_token_hash, display_name, contact_name,
      contact_relationship, contact_phone, important_info, publish_important_info,
      consent_to_publish, status, consent_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${ownerColumns}`),
    owner: db.prepare(`SELECT ${ownerColumns} FROM cards WHERE owner_token_hash = ?`),
    public: db.prepare(`SELECT display_name, contact_name, contact_relationship, contact_phone, photo_data_url,
      CASE WHEN publish_important_info = 1 THEN important_info ELSE NULL END AS important_info,
      updated_at FROM cards WHERE public_token = ? AND status = 'active'`),
    replace: db.prepare(`UPDATE cards SET display_name = ?, contact_name = ?,
      contact_relationship = ?, contact_phone = ?, important_info = ?,
      publish_important_info = ?, consent_to_publish = ?, consent_at = ?, updated_at = ?
      WHERE owner_token_hash = ? RETURNING ${ownerColumns}`),
    status: db.prepare(`UPDATE cards SET status = ?, updated_at = ?
      WHERE owner_token_hash = ? RETURNING ${ownerColumns}`),
    photo: db.prepare(`UPDATE cards SET photo_data_url = ?, updated_at = ?
      WHERE owner_token_hash = ? RETURNING ${ownerColumns}`),
    rotate: db.prepare(`UPDATE cards SET public_token = ?, updated_at = ?
      WHERE owner_token_hash = ? RETURNING ${ownerColumns}`),
    delete: db.prepare('DELETE FROM cards WHERE owner_token_hash = ?'),
  };
  let closed = false;

  const readOwner = (statement: StatementSync, ...values: SQLInputValue[]): OwnerCard | null => {
    const row = statement.get(...values);
    return row ? toOwner(row) : null;
  };

  // INSERT/UPDATE ... RETURNING is a single atomic SQLite operation: no separate
  // read after the write and no opportunity for another connection to interleave.
  return {
    createCard(record) {
      return safely(() => {
        const result = readOwner(statements.create,
          record.id, record.publicToken, record.ownerTokenHash, record.displayName,
          record.emergencyContact.name, record.emergencyContact.relationship,
          record.emergencyContact.phone, record.importantInfo,
          Number(record.publishImportantInfo), Number(record.consentToPublish), record.status,
          record.consentAt, record.createdAt, record.updatedAt,
        );
        if (!result) throw new Error('Missing inserted row');
        return result;
      });
    },
    getOwnerCard(ownerTokenHash) {
      return safely(() => readOwner(statements.owner, ownerTokenHash));
    },
    getPublicCard(publicToken) {
      return safely(() => {
        const row = statements.public.get(publicToken);
        return row ? toPublic(row) : null;
      });
    },
    replaceCard(ownerTokenHash, input, now) {
      return safely(() => readOwner(statements.replace,
        input.displayName, input.emergencyContact.name, input.emergencyContact.relationship,
        input.emergencyContact.phone, input.importantInfo, Number(input.publishImportantInfo),
        Number(input.consentToPublish), now, now, ownerTokenHash,
      ));
    },
    setStatus(ownerTokenHash, status, now) {
      return safely(() => readOwner(statements.status, status, now, ownerTokenHash));
    },
    setProfilePhoto(ownerTokenHash, photoDataUrl, now) {
      return safely(() => readOwner(statements.photo, photoDataUrl, now, ownerTokenHash));
    },
    rotatePublicToken(ownerTokenHash, token, now) {
      return safely(() => readOwner(statements.rotate, token, now, ownerTokenHash));
    },
    deleteCard(ownerTokenHash) {
      return safely(() => statements.delete.run(ownerTokenHash).changes > 0);
    },
    close() {
      safely(() => {
        if (!closed) {
          db.close();
          closed = true;
        }
      });
    },
  };
}
