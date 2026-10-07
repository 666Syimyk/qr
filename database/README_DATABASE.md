# Emergency QR — база данных Ади

Готовый синхронный TypeScript-репозиторий контракта `emergency-qr-v1`.
Node.js **24.x**, встроенный `node:sqlite`, без runtime-зависимостей.

## Передача команде

Распакуйте `database.zip` в корень `emergency-qr`, чтобы `database/`
находилась рядом с `backend/` и `frontend/`. Не создавайте вложенность
`database/database`. Эта поставка содержит только часть Ади.

```text
emergency-qr/
  backend/
  frontend/
  database/
    src/contracts.ts
    src/index.ts
    src/repository.ts
    migrations/001_init.sql
    tests/repository.test.ts
    package.json
    package-lock.json
    tsconfig.json
    .env.example
    README_DATABASE.md
    CHECKS_DATABASE.md
```

## Установка и проверка

В терминале из папки `database/`:

```sh
node --version
npm ci
npm run typecheck
npm test
```

TypeScript, tsx и типы Node нужны только для разработки и тестов.
Backend запускает свой TypeScript через свой `tsx`, импортируя исходники
напрямую. Отдельный сервер БД, сборка или команда миграции не требуются.

## Подключение из backend

Точный пример для файла **`backend/src/database.ts`**:

```typescript
import { fileURLToPath } from 'node:url';
import { openRepository } from '../../database/src/index.ts';
import type { CardRepository } from '../../database/src/index.ts';

export const repository: CardRepository = openRepository({
  databasePath: fileURLToPath(new URL('../../data/emergency-qr.sqlite', import.meta.url)),
});

export function closeDatabase(): void {
  repository.close();
}
```

В этом примере файл создаётся в `emergency-qr/data/emergency-qr.sqlite` независимо
от текущей папки терминала. Backend вызывает `closeDatabase()` при завершении,
после прекращения приёма запросов. Повторный `close()` допустим.
Для короткой операции используйте `try { ... } finally { repository.close(); }`.

`openRepository({ databasePath: ':memory:' })` создаёт временную базу в памяти.
Для постоянного хранения передавайте обычный файловый путь; родительские папки
создаются автоматически. Относительный **путь базы** разрешается относительно
рабочей папки процесса, поэтому в backend рекомендуется абсолютный путь.
Пути **миграций** всегда вычисляются относительно модуля через `import.meta.url`.

`.env.example` — пример настройки для backend. Репозиторий не читает `.env`:
выбранный путь backend передаёт явно через `databasePath`.

## Методы

| Метод | Результат |
| --- | --- |
| `createCard(record: StoredCard)` | Создаёт запись, возвращает `OwnerCard` без хеша |
| `getOwnerCard(ownerTokenHash)` | `OwnerCard` или `null` |
| `getPublicCard(publicToken)` | Только разрешённые поля активной карточки либо `null` |
| `replaceCard(ownerTokenHash, input, now)` | Заменяет пользовательские поля и даты согласия/обновления |
| `setStatus(ownerTokenHash, status, now)` | Меняет статус и дату обновления |
| `rotatePublicToken(ownerTokenHash, token, now)` | Меняет публичный токен и дату обновления, сохраняет статус |
| `deleteCard(ownerTokenHash)` | Физически удаляет запись; `true` при удалении, иначе `false` |
| `close()` | Закрывает соединение |

Все методы синхронные. Обновления возвращают `OwnerCard | null`; неизвестный
хеш ничего не меняет. `replaceCard` сохраняет id, публичный токен, хеш владельца,
дату создания и текущий статус. Замена QR немедленно делает старый токен
недоступным, в том числе после последующей реактивации.

Backend заранее валидирует и нормализует `CardInput`, отклоняет неизвестные
поля, генерирует UUID, независимые токены и ISO 8601 UTC даты. В репозиторий
передаётся только SHA-256 управляющего токена в lowercase hex (64 символа).
Сам репозиторий не генерирует и не заменяет значения, переданные backend.
Общие типы без переименований находятся в `src/contracts.ts`.

## Хранение и ограничения

В базе две таблицы: `cards` и `schema_migrations`. Один контакт хранится
в строке карточки. `UNIQUE` защищает публичные токены и хеши владельца;
`CHECK` ограничивает длины, формат телефона, токенов, статус, согласие и boolean.
Boolean хранится как 0/1, наружу возвращается как boolean; null остаётся null.

Публичный запрос выбирает поля по разрешённому списку и скрывает заметку уже
в SQL: при выключенном `publishImportantInfo` она всегда `null`.
Скрытая заметка остаётся доступной владельцу. Хеш не выбирается для ответов.
В базе нет сырого ownerToken, автоматического seed, пользователей или истории
сканирований. Демонстрационные данные находятся только в тестах, а тестовые
токены и хеши генерируются заново при каждом запуске.

При открытии включены `foreign_keys=ON`, `busy_timeout=5000`, для файловой
базы — WAL. Миграции применяются по версии внутри `BEGIN IMMEDIATE`, с откатом
при ошибке. Повторное открытие сохраняет строки и даты применённых миграций.
Для будущей миграции добавьте SQL-файл и следующий номер в список `migrations`
в `src/repository.ts`; уже применённую миграцию не редактируйте.

Запись и возврат результата выполняются одним атомарным `INSERT/UPDATE ...
RETURNING`; пользовательские значения передаются параметрами prepared statements.
Конфликты уникальности завершаются ошибкой, не перезаписывают чужие строки.
Ошибки наружу имеют фиксированные сообщения `Database operation failed` или
`Database initialization failed`, без SQL-значений и исходного `cause`.

Официальная документация использованной версии:
[Node.js 24.18.0 — SQLite](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html).
Проверки выполнены на Node.js 24.18.0; в этой версии `node:sqlite` имеет
статус release candidate. Точные результаты — в `CHECKS_DATABASE.md`.

Прототип предназначен для демонстрации с вымышленными данными. Номер
`+999000000001` из тестов искусственный, звонить на него не нужно.
Файлы SQLite с данными, node_modules и секреты в архив не включаются.
HTTP API, web и мобильное приложение проверяются при объединении с частями команды.
