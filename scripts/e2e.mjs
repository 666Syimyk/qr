// Compile a separate test web bundle. Never overwrite the configured LAN build.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const frontend = resolve(root, 'frontend');
const requireFrontend = createRequire(resolve(frontend, 'package.json'));
const expo = resolve(requireFrontend.resolve('expo/package.json'), '..', 'bin', 'cli');
const playwright = resolve(requireFrontend.resolve('@playwright/test/package.json'), '..', 'cli.js');
const env = { ...process.env, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3101/api/v1' };

for (const args of [
  [expo, 'export', '--platform', 'web', '--clear', '--output-dir', '../.integration/web'],
  [playwright, 'test', '--config', 'playwright.integration.config.ts'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: frontend, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
