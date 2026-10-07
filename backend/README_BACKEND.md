# Backend Ризо

Node.js 24.x, TypeScript ESM, Express, tsx, Zod, dotenv и express-rate-limit.
Зависимости установлены через npm, реальные версии зафиксированы в `package-lock.json`.
Контракт скопирован в `src/contracts.ts` без изменения имён и типов.

## Интерфейс с Ади

`src/index.ts` импортирует `../../database/src/index.ts` напрямую:

```ts
openRepository({ databasePath: string }): CardRepository
```

Функция синхронная, применяет миграции и возвращает синхронный репозиторий.
Хранилище реализует Ади; единственный fake находится в `tests/`.
`createApp({ repo, publicWebOrigin, allowedOrigins })` не зависит от SQLite
и не открывает порт. Дополнительно принимает `webDistPath`, `rateLimits` и
проверенный список `trustedProxyAddresses` из конфигурации.
Обычные значения лимитов заданы в `security.ts`, переменные окружения — в `.env.example`.

Репозиторий обязан выдавать в `getPublicCard` только активные записи и
`importantInfo=null`, если публикация выключена. Тип `PublicCard` не содержит
флага публикации, поэтому это обязательная гарантия слоя БД. API дополнительно
выбирает только четыре публичных поля и три поля контакта; если ошибочно
передана полная строка с `publishImportantInfo=false`, заметка также скрывается.
Owner-ответы тоже формируются по списку разрешённых полей.

## API

Базовый путь `/api/v1`. JSON без обёртки `data`.

| Метод и путь | Успех | Доступ |
|---|---|---|
| GET /health | 200, ok + contractVersion | публичный |
| POST /cards | 201, CreateResult | публичный, CardInput |
| GET /me/card | 200, OwnerResult | Bearer ownerToken |
| PUT /me/card | 200, OwnerResult | Bearer, полный CardInput |
| PATCH /me/card/status | 200, OwnerResult | Bearer, active/inactive |
| POST /me/card/rotate-qr | 200, OwnerResult | Bearer, тело `{}` |
| DELETE /me/card | 204, без тела | Bearer |
| GET /public/cards/:publicToken | 200, PublicCard | публичный |

JSON-тело обязательно с `Content-Type: application/json`. Все поля входного
контракта обязательны, неизвестные и вложенные лишние поля запрещены.
Текстовые поля обрезаются по краям; phone проверяется точным международным
форматом без пробелов. Пустая заметка должна быть `null`, согласие строго `true`.

Ошибка: `{"error":{"code":"…","message":"…","fieldErrors":{}}}`.
`fieldErrors` присутствует только для ошибок полей.
400 — валидация/некорректный JSON; 401 — ключ отсутствует/неверен/запись удалена;
404 — публичная запись недоступна или путь неизвестен; 413 — больше 16 КБ;
415 — другой Content-Type/кодировка; 429 — лимит + Retry-After;
500 — скрытый внутренний сбой. Для 413/415 code=`VALIDATION_ERROR`.

OwnerToken выдаётся только один раз при создании; в БД передаётся SHA-256 hex.
Два случайных 32-байтовых base64url токена независимы. Публичный токен не
авторизует владельца. PUT сохраняет ID, QR, createdAt и status; замену и
сохранение соответствующих дат выполняет контракт репозитория.

## Запуск и проверки

```sh
npm ci
npm test
npm run typecheck
npm run test:integration
```

После настройки окружения через корневой `npm run configure`:

```sh
npm start
```

`npm run dev` запускает tsx watch. Путь к `.env` и двум каталогам не зависит
от cwd. Для телефона используйте корневой `configure`, а не loopback из примера.
Полные команды объединения — в корневом README.

Тесты Supertest поднимают временные локальные HTTP-соединения. В ограниченной
песочнице может понадобиться разрешение на дочерние процессы и localhost.
SQLite-тест использует только модуль Ади и отдельную временную базу; если
модуля нет, отмечается SKIP, не имитация успешной интеграции.

API, HTML и статические файлы имеют `no-store`; HTML также `noindex, nofollow`
и `no-referrer`. Нет логирования тел, Authorization, IP и путей карточек.
Неизвестные `/api/*` остаются JSON 404; отсутствующие JS/CSS не получают SPA.
Проверки статических файлов учитывают фактическую цель symlink/junction:
нельзя выйти за web-каталог или выдать через alias его скрытые и служебные файлы.
Скрытый родитель самого настроенного web-каталога допустим: SPA index выдаётся
относительно проверенного `WEB_DIST_PATH`.
Настройка CSP намеренно не добавлена без реального Expo export для проверки.
Секреты, SQLite-файлы, реальные `.env` и node_modules в архив не входят.

По умолчанию `trust proxy=false`. При известном reverse proxy задайте
`TRUST_PROXY` как список его IP-адресов/CIDR через запятую и обеспечьте
перезапись forwarded-заголовков на proxy. Значения `true`, hop counts,
имена хостов и CIDR `/0` отвергаются. При прямом локальном доступе оставьте
переменную пустой. Без этой настройки клиенты proxy делят один IP-лимит.
Access-логи proxy также не должны сохранять полные пути QR и публичных карточек.
Готовая конфигурация Caddy доверяет только фиксированному адресу контейнера;
подробности — в [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md). Проверена только
Compose-конфигурация: локальный Docker Engine недоступен, контейнеры и публичный
HTTPS пока не запущены и не проверены.

Результаты проверки объединённого backend с настоящей SQLite приведены в
`CHECKS_BACKEND.md`; этот отчёт отдельно перечисляет пропущенные проверки.

## Проверенные технические источники

- [Express 5 API](https://expressjs.com/en/5x/api/) — маршруты, middleware, ответы и static.
- [Zod API](https://zod.dev/api) — строгие объектные схемы и проверка входа.
- [express-rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration) — лимиты и обработчик ошибок.
