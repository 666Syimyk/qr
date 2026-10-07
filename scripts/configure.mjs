import { existsSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Укажите --host=<LAN_IP> либо --origin=<HTTPS_ORIGIN>. Доступные внешние IPv4:');
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`${name}: ${address.address}`);
      }
    }
    console.log('Выберите адрес сети, доступной телефону. VPN-интерфейс может не подходить.');
    return;
  }
  const hosts = args.filter(arg => arg.startsWith('--host='));
  const origins = args.filter(arg => arg.startsWith('--origin='));
  const force = args.includes('--force');
  if (hosts.length + origins.length !== 1 || args.filter(arg => arg === '--force').length > 1
      || args.some(arg => !arg.startsWith('--host=') && !arg.startsWith('--origin=') && arg !== '--force')) {
    throw new Error('Укажите ровно один --host=<LAN_IP> или --origin=<HTTPS_ORIGIN>, при необходимости --force.');
  }
  let origin;
  let allowed;
  if (hosts.length) {
    const host = hosts[0].slice('--host='.length);
    const first = Number(host.split('.')[0]);
    if (isIP(host) !== 4 || first === 0 || first === 127 || first >= 224) throw new Error('Нужен доступный LAN IPv4, не loopback, wildcard или multicast.');
    origin = `http://${host}:3001`;
    allowed = `${origin},http://${host}:8081,http://localhost:8081`;
  } else {
    const value = origins[0].slice('--origin='.length);
    const url = new URL(value);
    if (!/^https:\/\/[^/?#\\\s]+\/?$/.test(value) || url.protocol !== 'https:' || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) throw new Error('Нужен HTTPS origin без пути, query, fragment и пароля.');
    origin = url.origin;
    allowed = `${origin},http://localhost:8081`;
  }
  const files = [
    { path: resolve(root, 'frontend/.env'), body: `EXPO_PUBLIC_API_URL=${origin}/api/v1\n` },
    { path: resolve(root, 'backend/.env'), body: `PORT=3001\nHOST=0.0.0.0\nPUBLIC_WEB_ORIGIN=${origin}\nDATABASE_PATH=../data/emergency-qr.sqlite\nWEB_DIST_PATH=../frontend/dist\nALLOWED_ORIGINS=${allowed}\n` },
  ];
  for (const folder of ['frontend', 'backend']) {
    if (!existsSync(resolve(root, folder))) throw new Error(`Сначала распакуйте ${folder}/ в общий корень.`);
  }
  // Check both before changing either file.
  if (!force && files.some(file => existsSync(file.path))) throw new Error('Файл .env уже существует. Для перезаписи обоих файлов укажите --force.');
  for (const file of files) writeFileSync(file.path, file.body, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
  console.log(`Настройки записаны. Проверка с телефона: ${origin}/api/v1/health`);
  console.log('Перезапустите Expo и пересоберите web после смены адреса.');
}
try { main(); } catch (error) {
  console.error(error instanceof TypeError ? 'Некорректный адрес origin.' : error.message);
  process.exitCode = 1;
}
