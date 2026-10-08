export type CardStatus = 'active' | 'inactive';
export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}
export interface CardInput {
  displayName: string;
  emergencyContact: EmergencyContact;
  importantInfo: string | null;
  publishImportantInfo: boolean;
  consentToPublish: true;
}
export interface OwnerCard extends CardInput {
  id: string;
  publicToken: string;
  status: CardStatus;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
  photoDataUrl: string | null;
}
export interface PublicCard {
  displayName: string;
  emergencyContact: EmergencyContact;
  importantInfo: string | null;
  updatedAt: string;
  photoDataUrl: string | null;
}
export interface OwnerResult {
  card: OwnerCard;
  publicUrl: string;
}
export interface CreateResult extends OwnerResult {
  ownerToken: string;
}
export interface ApiError {
  error: {
    code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' |
      'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
    message: string;
    fieldErrors?: Record<string, string>;
  };
}
export interface StoredCard extends OwnerCard {
  ownerTokenHash: string;
}
export interface CardRepository {
  createCard(record: StoredCard): OwnerCard;
  getOwnerCard(ownerTokenHash: string): OwnerCard | null;
  getPublicCard(publicToken: string): PublicCard | null;
  replaceCard(ownerTokenHash: string, input: CardInput,
    now: string): OwnerCard | null;
  setStatus(ownerTokenHash: string, status: CardStatus,
    now: string): OwnerCard | null;
  setProfilePhoto(ownerTokenHash: string, photoDataUrl: string | null,
    now: string): OwnerCard | null;
  rotatePublicToken(ownerTokenHash: string, token: string,
    now: string): OwnerCard | null;
  deleteCard(ownerTokenHash: string): boolean;
  close(): void;
}
