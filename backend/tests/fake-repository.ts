// Test double only. Production imports Adi's SQLite module, never this file.
import type { CardInput, CardRepository, CardStatus, StoredCard } from '../src/contracts.ts';

export class FakeRepository implements CardRepository {
  readonly records = new Map<string, StoredCard>();
  createCard(record: StoredCard) {
    this.records.set(record.ownerTokenHash, structuredClone(record));
    // Deliberately includes storage-only fields: the API must project its output.
    return structuredClone(record);
  }
  getOwnerCard(hash: string) { return structuredClone(this.records.get(hash) ?? null); }
  getPublicCard(token: string) {
    const card = [...this.records.values()].find(c => c.publicToken === token && c.status === 'active');
    if (!card) return null;
    return structuredClone({ ...card, importantInfo: card.publishImportantInfo ? card.importantInfo : null });
  }
  replaceCard(hash: string, input: CardInput, now: string) {
    const card = this.records.get(hash);
    if (!card) return null;
    Object.assign(card, structuredClone(input), { updatedAt: now, consentAt: now });
    return structuredClone(card);
  }
  setStatus(hash: string, status: CardStatus, now: string) {
    const card = this.records.get(hash);
    if (!card) return null;
    Object.assign(card, { status, updatedAt: now });
    return structuredClone(card);
  }
  rotatePublicToken(hash: string, token: string, now: string) {
    const card = this.records.get(hash);
    if (!card) return null;
    Object.assign(card, { publicToken: token, updatedAt: now });
    return structuredClone(card);
  }
  deleteCard(hash: string) { return this.records.delete(hash); }
  close() { this.records.clear(); }
}
