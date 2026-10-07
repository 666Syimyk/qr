import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import type { CreateResult, OwnerResult, PublicCard } from '../src/types/contracts';

// Real backend + real SQLite, no page.route() and no fixture server.
// Only fictional card values are submitted. Temporary DB is removed after tests.
const root = resolve(__dirname, '../..');
const origin = 'http://127.0.0.1:3101';
const api = `${origin}/api/v1`;
const requireBackend = createRequire(resolve(root, 'backend/package.json'));
let tempDirectory: string;
let databasePath: string;
let server: ChildProcess | undefined;

async function stopServer() {
  const current = server;
  server = undefined;
  if (!current || current.exitCode !== null) return;
  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => current.kill('SIGKILL'), 5000);
    current.once('exit', () => { clearTimeout(timer); resolveStop(); });
    current.kill('SIGTERM');
  });
}

async function startServer() {
  const child = spawn(process.execPath, [
    '--import', pathToFileURL(requireBackend.resolve('tsx')).href,
    resolve(root, 'backend/src/index.ts'),
  ], {
    // Deliberately different cwd: config, TS imports and migrations must be path-independent.
    cwd: tempDirectory,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: '3101', HOST: '127.0.0.1', PUBLIC_WEB_ORIGIN: origin,
      ALLOWED_ORIGINS: origin, DATABASE_PATH: databasePath,
      WEB_DIST_PATH: resolve(root, '.integration/web'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = child;
  let diagnostic = '';
  child.stdout?.on('data', chunk => { diagnostic += String(chunk); });
  child.stderr?.on('data', chunk => { diagnostic += String(chunk); });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Backend exited during test startup: ${diagnostic}`);
    try {
      const response = await fetch(`${api}/health`, { signal: AbortSignal.timeout(600) });
      if (response.ok) return;
    } catch { /* Wait for the actual process to bind. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 150));
  }
  throw new Error(`Backend startup timeout: ${diagnostic}`);
}

test.beforeAll(async () => {
  let occupied = false;
  try { await fetch(`${api}/health`, {signal:AbortSignal.timeout(600)}); occupied = true; } catch { /* Free port. */ }
  if (occupied) throw new Error('Port 3101 is already in use; integration tests will not modify another running server.');
  tempDirectory = mkdtempSync(join(tmpdir(), 'emergency-qr-e2e-'));
  databasePath = join(tempDirectory, 'cards.sqlite');
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
  if (tempDirectory && resolve(tempDirectory).startsWith(resolve(tmpdir()) + sep + 'emergency-qr-e2e-')) {
    rmSync(tempDirectory, {recursive:true, force:true});
  }
});

test('real browser / API / SQLite lifecycle survives server restart and enforces public privacy', async ({page, browser}, testInfo) => {
  const browserErrors:string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.setViewportSize({width:1280,height:900});
  const landing = await page.goto('/create');
  expect(landing?.status()).toBe(200);
  await page.getByLabel('Имя на карточке', {exact:true}).fill('Демо-владелец');
  await page.getByRole('button',{name:'Далее',exact:true}).click();
  await page.getByLabel('Имя контакта', {exact:true}).fill('Демо-контакт');
  await page.getByLabel('Кем вам приходится · необязательно', {exact:true}).fill('Родственник');
  await page.getByLabel('Номер телефона', {exact:true}).fill('+999000000001');
  await page.getByRole('button',{name:'Далее',exact:true}).click();
  const hiddenNote = 'ДЕМОНСТРАЦИЯ. Скрытая вымышленная заметка.';
  await page.getByLabel('Что ещё стоит знать · необязательно', {exact:true}).fill(hiddenNote);
  await page.getByRole('checkbox').click();
  await expect(page.getByRole('checkbox')).toBeChecked();
  const createdResponse = page.waitForResponse(r=>r.url()===`${api}/cards` && r.request().method()==='POST');
  await page.getByRole('button', {name:'Создать карточку', exact:true}).click();
  const response = await createdResponse;
  expect(response.status()).toBe(201);
  const created:CreateResult = await response.json();
  expect(created.ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(created.ownerToken === created.card.publicToken).toBe(false);
  await expect(page).toHaveURL(`${origin}/my`);
  await expect(page.getByLabel('Публичная ссылка', {exact:true})).toHaveValue(created.publicUrl);
  await expect(page.getByLabel('Секретный ключ для сохранения')).toHaveCount(0);
  await page.getByLabel('QR с публичной ссылкой на карточку').screenshot({path:testInfo.outputPath('real-qr.png')});
  writeFileSync(testInfo.outputPath('expected-public-url.txt'), created.publicUrl);

  const database = new DatabaseSync(databasePath, {readOnly:true});
  const stored = database.prepare('SELECT owner_token_hash, important_info FROM cards').all();
  expect(stored).toHaveLength(1);
  expect(stored[0].owner_token_hash === createHash('sha256').update(created.ownerToken).digest('hex')).toBe(true);
  expect(stored[0].important_info).toBe(hiddenNote);
  const columns = database.prepare('PRAGMA table_info(cards)').all().map(column=>column.name);
  expect(columns).not.toContain('owner_token');
  database.close();

  const publicContext = await browser.newContext({viewport:{width:390,height:844}});
  const publicPage = await publicContext.newPage();
  const publicRequests:string[]=[];
  publicPage.on('request', request=>{if(request.url().includes('/api/'))publicRequests.push(request.headers().authorization??'');});
  await publicPage.goto(created.publicUrl);
  await expect(publicPage.getByRole('heading', {name:'Демо-владелец',exact:true})).toBeVisible();
  await expect(publicPage.getByRole('button', {name:'Демо-номер',exact:true})).toBeDisabled();
  await expect(publicPage.getByText(hiddenNote, {exact:true})).toHaveCount(0);
  const publicResponse = await fetch(`${api}/public/cards/${created.card.publicToken}`);
  expect(publicResponse.headers.get('cache-control')).toBe('no-store');
  const publicCard:PublicCard = await publicResponse.json();
  expect(Object.keys(publicCard).sort()).toEqual(['displayName','emergencyContact','importantInfo','updatedAt']);
  expect(publicCard.importantInfo).toBeNull();
  expect(publicRequests.every(header=>!header)).toBe(true);

  for (const ownerKey of [undefined, created.card.publicToken, 'x'.repeat(43)]) {
    const denied = await fetch(`${api}/me/card`, {method:'DELETE',headers:ownerKey?{Authorization:`Bearer ${ownerKey}`}:{}});
    expect(denied.status).toBe(401);
  }
  // A public URL cannot change the card and a malicious client cannot choose tokens/status.
  const injected = await fetch(`${api}/me/card`, {method:'PUT', headers:{Authorization:`Bearer ${created.ownerToken}`,'Content-Type':'application/json'},body:JSON.stringify({...created.card,status:'inactive'})});
  expect(injected.status).toBe(400);

  await page.getByRole('button',{name:'Изменить данные',exact:true}).click();
  await page.getByLabel('Имя на карточке',{exact:true}).fill('Демо-владелец после правки');
  await page.getByRole('button',{name:'Далее',exact:true}).click();
  await page.getByRole('button',{name:'Далее',exact:true}).click();
  await page.getByRole('switch',{name:'Показывать важную информацию',exact:true}).click();
  await expect(page.getByRole('switch')).toBeChecked();
  await page.getByRole('checkbox').click();
  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/my`);
  await expect(page.getByLabel('Публичная ссылка',{exact:true})).toHaveValue(created.publicUrl);
  await publicPage.getByRole('button',{name:'Обновить карточку',exact:true}).click();
  await expect(publicPage.getByRole('heading',{name:'Демо-владелец после правки',exact:true})).toBeVisible();
  await expect(publicPage.getByText(hiddenNote,{exact:true})).toBeVisible();

  await stopServer();
  await startServer();
  const afterRestart = await fetch(`${api}/me/card`,{headers:{Authorization:`Bearer ${created.ownerToken}`}});
  expect(afterRestart.status).toBe(200);
  const persisted:OwnerResult = await afterRestart.json();
  expect(persisted.card.id).toBe(created.card.id);
  expect(persisted.card.displayName).toBe('Демо-владелец после правки');
  expect(persisted.publicUrl).toBe(created.publicUrl);
  await publicPage.reload();
  await expect(publicPage.getByRole('heading',{name:'Демо-владелец после правки',exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Отключить карточку',exact:true}).click();
  await page.getByRole('button',{name:'Отключить карточку',exact:true}).last().click();
  await expect(page.getByText('Карточка отключена',{exact:true})).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.getByRole('heading',{name:'Демо-владелец после правки',exact:true})).toHaveCount(0);
  const inactive = await fetch(`${api}/public/cards/${created.card.publicToken}`);
  expect(inactive.status).toBe(404);
  const inactiveError = await inactive.json();

  await page.getByRole('button',{name:'Открыть профиль',exact:true}).click();
  await page.getByRole('button',{name:'Заменить публичный QR',exact:true}).click();
  await page.getByRole('button',{name:'Заменить QR',exact:true}).click();
  await expect(page.getByText('QR заменён. Сохраните новый код: старый больше не работает.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Мой QR-код',exact:true}).last().click();
  await expect(page.getByLabel('Публичная ссылка',{exact:true})).not.toHaveValue(created.publicUrl);
  const rotatedUrl = await page.getByLabel('Публичная ссылка',{exact:true}).inputValue();
  await expect(page.getByText('Карточка отключена',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Включить карточку',exact:true}).click();
  await expect(page.getByText('Карточка активна',{exact:true})).toBeVisible();
  const oldPublic = await fetch(`${api}/public/cards/${created.card.publicToken}`);
  expect(oldPublic.status).toBe(404);
  expect(await oldPublic.json()).toEqual(inactiveError);
  const missingPublic = await fetch(`${api}/public/cards/${'z'.repeat(43)}`);
  expect(missingPublic.status).toBe(404);
  expect(await missingPublic.json()).toEqual(inactiveError);
  await publicPage.goto(rotatedUrl);
  await expect(publicPage.getByRole('heading',{name:'Демо-владелец после правки',exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Открыть профиль',exact:true}).click();
  await page.getByRole('button',{name:'Удалить карточку',exact:true}).click();
  await page.getByRole('button',{name:'Удалить навсегда',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/`);
  await publicPage.reload();
  await expect(publicPage.getByText('Демо-контакт',{exact:true})).toHaveCount(0);
  const deletedPublic = await fetch(`${api}/public/cards/${rotatedUrl.split('/').pop()}`);
  expect(deletedPublic.status).toBe(404);
  expect(await deletedPublic.json()).toEqual(inactiveError);
  expect((await fetch(`${api}/me/card`,{headers:{Authorization:`Bearer ${created.ownerToken}`}})).status).toBe(401);
  const finalDatabase = new DatabaseSync(databasePath,{readOnly:true});
  expect(finalDatabase.prepare('SELECT count(*) AS total FROM cards').get()?.total).toBe(0);
  finalDatabase.close();
  expect(browserErrors).toEqual([]);
  await publicContext.close();
});

test('real static host serves SPA routes and prevents API/assets/private paths from falling through', async()=>{
  for(const route of ['/', '/create', `/q/${'p'.repeat(43)}`]){
    const response = await fetch(`${origin}${route}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.text()).toContain('lang="ru"');
  }
  for(const route of ['/api/unknown','/api/v1/unknown']){
    const response = await fetch(`${origin}${route}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  }
  for(const route of ['/missing.js','/.env','/backend/.env','/data/emergency-qr.sqlite','/database/src/index.ts']){
    const response = await fetch(`${origin}${route}`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('<html');
  }
});
