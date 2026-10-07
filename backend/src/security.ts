import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ApiError } from './contracts.ts';

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const newToken = () => randomBytes(32).toString('base64url');
export const hashOwnerToken = (token: string) => createHash('sha256').update(token).digest('hex');
export class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: ApiError['error']['code'], message: string,
    readonly fieldErrors?: Record<string, string>) { super(message); }
}
export const unauthorized = () => new ApiFailure(401, 'UNAUTHORIZED', 'Недействительный ключ владельца.');
export const notFound = () => new ApiFailure(404, 'NOT_FOUND', 'Карточка или ресурс недоступны.');

export function validateTrustedProxyAddresses(values: string[]): string[] {
  return [...new Set(values.map(value => {
    const address = value.trim();
    const parts = address.split('/');
    const version = isIP(parts[0]);
    const prefix = parts[1];
    if (!version || parts.length > 2 || (prefix !== undefined
      && (!/^[1-9]\d*$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY допускает только явные IP-адреса и CIDR без /0.');
    }
    return address;
  }))];
}

export function normalizeOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Укажите корректный HTTP(S) origin.'); }
  // Check the raw shape too: URL normalizes dot paths, empty ?/# and credentials.
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/.test(value) || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Origin должен содержать только протокол, адрес и необязательный порт.');
  }
  return url.origin;
}
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({ 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  next();
};
export function corsAllowlist(origins: string[]): RequestHandler {
  const allowed = new Set(origins.map(normalizeOrigin));
  return (req, res, next) => {
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin) {
      if (!allowed.has(origin)) return next(new ApiFailure(400, 'VALIDATION_ERROR', 'Этот источник запросов не разрешён.'));
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  };
}
export interface RatePolicy { limit: number; windowMs: number }
export interface RateLimits { create: RatePolicy; owner: RatePolicy; public: RatePolicy }
export const defaultRateLimits: RateLimits = {
  create: { limit: 10, windowMs: 600000 }, owner: { limit: 120, windowMs: 60000 }, public: { limit: 120, windowMs: 60000 },
};
export function limiter(policy: RatePolicy): RequestHandler {
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1 || !Number.isSafeInteger(policy.windowMs)
      || policy.windowMs < 1 || policy.windowMs > 2147483647) throw new Error('Некорректное ограничение запросов.');
  return rateLimit({
    windowMs: policy.windowMs, limit: policy.limit, standardHeaders: 'draft-8', legacyHeaders: false,
    // Ignore untrusted proxy headers without logging request/header diagnostics.
    validate: { xForwardedForHeader: false, forwardedHeader: false },
    handler: (_req, _res, next) => next(new ApiFailure(429, 'RATE_LIMITED', 'Слишком много запросов. Повторите позже.')),
  });
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  let failure = error instanceof ApiFailure ? error : undefined;
  const parserError = error as { type?: string; status?: number } | null;
  if (!failure && parserError?.type === 'entity.too.large') {
    failure = new ApiFailure(413, 'VALIDATION_ERROR', 'Тело запроса превышает 16 КБ.');
  } else if (!failure && parserError?.status === 415) {
    failure = new ApiFailure(415, 'VALIDATION_ERROR', 'Неподдерживаемый формат или кодировка тела запроса.');
  } else if (!failure && (parserError?.type === 'entity.parse.failed' || parserError?.status === 400 || error instanceof URIError)) {
    failure = new ApiFailure(400, 'VALIDATION_ERROR', 'Некорректный JSON или запрос.');
  }
  failure ??= new ApiFailure(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера.');
  const body: ApiError = { error: { code: failure.code, message: failure.message } };
  if (failure.fieldErrors) body.error.fieldErrors = failure.fieldErrors;
  res.set('Cache-Control', 'no-store').status(failure.status).json(body);
};
