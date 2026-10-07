import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const jobs = {
  setup: [['frontend', 'install'], ['backend', 'install'], ['database', 'install']],
  test: [['backend', 'run', 'test'], ['database', 'run', 'test']],
  'test-all': [['frontend', 'run', 'test'], ['backend', 'run', 'test'], ['database', 'run', 'test'], ['backend', 'run', 'test:integration']],
  check: [['frontend', 'run', 'typecheck'], ['backend', 'run', 'typecheck'], ['database', 'run', 'typecheck']],
};
const task = process.argv[2];
if (!Object.hasOwn(jobs, task) || !process.env.npm_execpath) {
  console.error('Запускайте npm run setup, npm test или npm run check из общего проекта.');
  process.exitCode = 1;
} else {
  for (const [folder, ...args] of jobs[task]) {
    if (!existsSync(resolve(root, folder, 'package.json'))) {
      console.error(`Нет ${folder}/package.json. Объедините три архива в одном корне.`);
      process.exitCode = 1;
      break;
    }
    const child = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: resolve(root, folder), stdio: 'inherit' });
    if (child.error || child.status !== 0) { process.exitCode = child.status || 1; break; }
  }
}
