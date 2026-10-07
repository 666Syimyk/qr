import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { defaultRateLimits, normalizeOrigin, validateTrustedProxyAddresses, type RateLimits } from './security.ts';
import { assertWebDirectory } from './paths.ts';
export interface Config {
  port: number; host: string; publicWebOrigin: string; allowedOrigins: string[];
  databasePath: string; webDistPath: string; rateLimits: RateLimits;
  trustedProxyAddresses: string[];
}
export function loadConfig(options: { backendDir?: string; env?: NodeJS.ProcessEnv } = {}): Config {
  const backendDir = options.backendDir ?? fileURLToPath(new URL('..', import.meta.url));
  let fileEnv: Record<string, string> = {};
  try { fileEnv = parse(readFileSync(resolve(backendDir, '.env'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Не удалось прочитать backend/.env.'); }
  const env = { ...fileEnv, ...(options.env ?? process.env) };
  const integer = (name: string, fallback: number, max = 2147483647) => {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new Error(`Некорректная настройка ${name}.`);
    return Number(value);
  };
  if (!env.PUBLIC_WEB_ORIGIN || !env.ALLOWED_ORIGINS) throw new Error('Сначала выполните npm run configure или заполните backend/.env.');
  const publicWebOrigin = normalizeOrigin(env.PUBLIC_WEB_ORIGIN);
  const allowedOrigins = [...new Set(env.ALLOWED_ORIGINS.split(',').map(value => normalizeOrigin(value.trim())))];
  const trustedProxyAddresses = validateTrustedProxyAddresses(env.TRUST_PROXY?.trim() ? env.TRUST_PROXY.split(',') : []);
  const rateLimits = Object.fromEntries(Object.entries(defaultRateLimits).map(([kind, defaults]) => [kind, {
    limit: integer(`RATE_LIMIT_${kind.toUpperCase()}_MAX`, defaults.limit),
    windowMs: integer(`RATE_LIMIT_${kind.toUpperCase()}_WINDOW_MS`, defaults.windowMs),
  }])) as unknown as RateLimits;
  const databasePath = resolve(backendDir, env.DATABASE_PATH || '../data/emergency-qr.sqlite');
  const webDistPath = resolve(backendDir, env.WEB_DIST_PATH || '../frontend/dist');
  assertWebDirectory(webDistPath, backendDir);
  return { port: integer('PORT', 3001, 65535), host: env.HOST || '0.0.0.0', publicWebOrigin,
    allowedOrigins, databasePath, webDistPath, rateLimits, trustedProxyAddresses };
}
