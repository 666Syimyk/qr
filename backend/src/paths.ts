import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isWithin(parent: string, child: string): boolean {
  // path.relative follows the host filesystem's case semantics on Windows.
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
function canonicalPath(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute ? absolute : resolve(canonicalPath(parent), basename(absolute));
}
export function assertWebDirectory(path: string, backendDir = fileURLToPath(new URL('..', import.meta.url))): void {
  const web = canonicalPath(path);
  const root = canonicalPath(resolve(backendDir, '..'));
  const protectedPaths = [backendDir, resolve(root, 'database'), resolve(root, 'data'), resolve(root, 'scripts'), resolve(root, 'node_modules')];
  if (isWithin(web, root) || protectedPaths.some(protectedPath => isWithin(canonicalPath(protectedPath), web))) {
    throw new Error('WEB_DIST_PATH должен указывать на каталог веб-сборки, вне служебных каталогов.');
  }
}
