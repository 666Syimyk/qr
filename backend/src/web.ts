import { existsSync, realpathSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import express from 'express';
import { assertWebDirectory, isWithin } from './paths.ts';

function isProtectedPath(path: string): boolean {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.some(part => part.startsWith('.'))
    || /^(backend|database|data|node_modules|scripts)$/i.test(segments[0] ?? '');
}

function isAllowedTarget(dist: string, candidate: string): boolean {
  const root = realpathSync(dist);
  const target = realpathSync(candidate);
  return isWithin(root, target) && !isProtectedPath(relative(root, target));
}

export function webHost(webDistPath: string) {
  const router = express.Router();
  const dist = resolve(webDistPath);
  assertWebDirectory(dist);
  router.use((req, res, next) => {
    assertWebDirectory(dist);
    res.set('Cache-Control', 'no-store');
    let path: string;
    try { path = decodeURIComponent(req.path); } catch { res.status(400).type('text').send('Некорректный адрес.'); return; }
    if (isProtectedPath(path)) {
      res.status(404).type('text').send('Ресурс не найден.'); return;
    }
    // Resolve aliases before checking both the export boundary and private paths.
    const candidate = resolve(dist, '.' + path);
    if (existsSync(candidate) && existsSync(dist)) {
      if (!isAllowedTarget(dist, candidate)) {
        res.status(404).type('text').send('Ресурс не найден.'); return;
      }
    }
    next();
  });
  router.use(express.static(dist, { dotfiles: 'deny', index: false, redirect: false,
    etag: false, lastModified: false, cacheControl: false }));
  router.use((req, res, next) => {
    const path = decodeURIComponent(req.path);
    if (!['GET', 'HEAD'].includes(req.method) || extname(path) || /^\/(assets|_expo)(\/|$)/i.test(path)) {
      res.status(404).type('text').send('Ресурс не найден.'); return;
    }
    const index = resolve(dist, 'index.html');
    if (!existsSync(index)) {
      res.status(503).type('text').send('Сначала выполните npm run build:web'); return;
    }
    if (!isAllowedTarget(dist, index)) {
      res.status(404).type('text').send('Ресурс не найден.'); return;
    }
    // Keep hidden ancestors of the configured root out of sendFile's dotfile check.
    res.sendFile('index.html', { root: dist, cacheControl: false, lastModified: false }, error => {
      if (error) next(error);
    });
  });
  return router;
}
