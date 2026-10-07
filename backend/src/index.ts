import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import type { CardRepository } from './contracts.ts';

async function main() {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Требуется Node.js 24.x.');
  const config = loadConfig();
  // Exact cross-folder TypeScript import. No fallback production storage.
  const { openRepository } = await import('../../database/src/index.ts');
  const repo: CardRepository = openRepository({ databasePath: config.databasePath });
  const app = createApp({ repo, ...config });
  const server = app.listen(config.port, config.host, () => {
    console.log(`Emergency QR: порт ${config.port}. Адрес сайта: ${config.publicWebOrigin}`);
  });
  server.on('error', () => { repo.close(); console.error('Не удалось запустить сервер. Проверьте порт и настройки.'); process.exitCode = 1; });
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => server.closeAllConnections(), 5000);
    timeout.unref();
    server.close(() => { clearTimeout(timeout); repo.close(); });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(() => {
  console.error('Запуск не выполнен. Нужны Node.js 24.x, backend/.env и модуль database/src/index.ts от Ади. Проверьте npm run check.');
  process.exitCode = 1;
});
