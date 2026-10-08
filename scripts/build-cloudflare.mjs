import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(args, extraEnv = {}) {
  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed: npm ${args.join(' ')}`);
}

const localEnv = join(process.cwd(), 'frontend', '.env');
const temporaryEnv = `${localEnv}.cloudflare-build-${process.pid}`;
const hadLocalEnv = existsSync(localEnv);
if (hadLocalEnv) renameSync(localEnv, temporaryEnv);
try {
  run(['--prefix', 'cloudflare', 'ci']);
  run(['--prefix', 'frontend', 'ci']);
  run(['--prefix', 'frontend', 'run', 'build:web'], { EXPO_BASE_URL: '/', EXPO_PUBLIC_API_URL: '' });
} finally {
  if (hadLocalEnv && existsSync(temporaryEnv)) renameSync(temporaryEnv, localEnv);
}
