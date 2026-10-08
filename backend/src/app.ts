import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import type { CardRepository, OwnerCard, OwnerResult, PublicCard } from './contracts.ts';
import { corsAllowlist, defaultRateLimits, errorHandler, hashOwnerToken, limiter, newToken,
  normalizeOrigin, notFound, securityHeaders, TOKEN_PATTERN, unauthorized, validateTrustedProxyAddresses, type RateLimits } from './security.ts';
import { cardSchema, parseBody, profilePhotoSchema, requireJson, rotateSchema, statusSchema } from './validation.ts';
import { webHost } from './web.ts';
import { fileURLToPath } from 'node:url';

export interface AppOptions {
  repo: CardRepository;
  publicWebOrigin: string;
  allowedOrigins: string[];
  rateLimits?: Partial<RateLimits>;
  webDistPath?: string;
  trustedProxyAddresses?: string[];
}
function ownerProjection(card: OwnerCard): OwnerCard {
  return { id: card.id, publicToken: card.publicToken, status: card.status, displayName: card.displayName,
    emergencyContact: { name: card.emergencyContact.name, relationship: card.emergencyContact.relationship, phone: card.emergencyContact.phone },
    importantInfo: card.importantInfo, publishImportantInfo: card.publishImportantInfo, consentToPublish: card.consentToPublish,
    consentAt: card.consentAt, createdAt: card.createdAt, updatedAt: card.updatedAt,
    photoDataUrl: card.photoDataUrl };
}
export function createApp(options: AppOptions) {
  const { repo } = options;
  const publicWebOrigin = normalizeOrigin(options.publicWebOrigin);
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  const trustedProxyAddresses = validateTrustedProxyAddresses(options.trustedProxyAddresses ?? []);
  app.set('trust proxy', trustedProxyAddresses.length ? trustedProxyAddresses : false);
  app.use(securityHeaders);
  const api = express.Router();
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);
  api.use(corsAllowlist(options.allowedOrigins));
  const limits = { ...defaultRateLimits, ...options.rateLimits };
  const createLimit = limiter(limits.create);
  const ownerLimit = limiter(limits.owner);
  const publicLimit = limiter(limits.public);
  const json = [requireJson, express.json({ limit: '16kb', strict: true, inflate: false })];
  const photoJson = [requireJson, express.json({ limit: '400kb', strict: true, inflate: false })];
  const authenticate: RequestHandler = (req, res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('Authorization') ?? '');
    if (!match) throw unauthorized();
    const hash = hashOwnerToken(match[1]);
    const card = repo.getOwnerCard(hash);
    if (!card) throw unauthorized();
    res.locals.ownerHash = hash;
    res.locals.ownerCard = card;
    next();
  };
  function ownerResult(card: OwnerCard | null): OwnerResult {
    if (!card) throw unauthorized();
    return { card: ownerProjection(card), publicUrl: `${publicWebOrigin}/q/${card.publicToken}` };
  }
  api.get('/v1/health', (_req, res) => res.json({ ok: true, contractVersion: 'emergency-qr-v1' }));
  api.post('/v1/cards', createLimit, ...json, (req, res) => {
    const input = parseBody(cardSchema, req.body);
    const ownerToken = newToken();
    const now = new Date().toISOString();
    const card = repo.createCard({ ...input, id: randomUUID(), publicToken: newToken(), ownerTokenHash: hashOwnerToken(ownerToken),
      status: 'active', consentAt: now, createdAt: now, updatedAt: now, photoDataUrl: null });
    res.status(201).json({ ...ownerResult(card), ownerToken });
  });
  api.get('/v1/me/card', ownerLimit, authenticate, (_req, res) => res.json(ownerResult(res.locals.ownerCard)));
  api.put('/v1/me/card', ownerLimit, authenticate, ...json, (req, res) => {
    const input = parseBody(cardSchema, req.body);
    res.json(ownerResult(repo.replaceCard(res.locals.ownerHash, input, new Date().toISOString())));
  });
  api.put('/v1/me/card/photo', ownerLimit, authenticate, ...photoJson, (req, res) => {
    const { photoDataUrl } = parseBody(profilePhotoSchema, req.body);
    res.json(ownerResult(repo.setProfilePhoto(res.locals.ownerHash, photoDataUrl, new Date().toISOString())));
  });
  api.patch('/v1/me/card/status', ownerLimit, authenticate, ...json, (req, res) => {
    const { status } = parseBody(statusSchema, req.body);
    res.json(ownerResult(repo.setStatus(res.locals.ownerHash, status, new Date().toISOString())));
  });
  api.post('/v1/me/card/rotate-qr', ownerLimit, authenticate, ...json, (req, res) => {
    parseBody(rotateSchema, req.body);
    res.json(ownerResult(repo.rotatePublicToken(res.locals.ownerHash, newToken(), new Date().toISOString())));
  });
  api.delete('/v1/me/card', ownerLimit, authenticate, (_req, res) => {
    if (!repo.deleteCard(res.locals.ownerHash)) throw unauthorized();
    res.status(204).end();
  });
  api.get('/v1/public/cards/:publicToken', publicLimit, (req, res) => {
    const token = req.params.publicToken;
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw notFound();
    const card = repo.getPublicCard(token);
    if (!card) throw notFound();
    // Repository enforces publication; also handle an accidentally returned storage row.
    const publication = (card as PublicCard & { publishImportantInfo?: boolean }).publishImportantInfo;
    const response: PublicCard = { displayName: card.displayName,
      emergencyContact: { name: card.emergencyContact.name, relationship: card.emergencyContact.relationship, phone: card.emergencyContact.phone },
      importantInfo: publication === false ? null : card.importantInfo, updatedAt: card.updatedAt,
      photoDataUrl: card.photoDataUrl };
    res.json(response);
  });
  api.use((_req, _res, next) => next(notFound()));
  app.use(webHost(options.webDistPath ?? fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
  app.use(errorHandler);
  return app;
}
