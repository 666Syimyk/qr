# Бесплатное размещение в Cloudflare

Сайт и API публикуются одним Cloudflare Worker по одному HTTPS-адресу. Карточки хранятся в Cloudflare D1, поэтому они доступны на других устройствах и переживают перезапуски.

## Повторная публикация

Для текущего аккаунта база уже создана и её ID записан в `wrangler.jsonc`. Чтобы опубликовать свежий код, выполните:

1. `npm run cf:build`
2. `npm run cf:db:migrate`
3. `npm run cf:deploy`

Wrangler напечатает публичный адрес вида `https://<worker>.<account>.workers.dev`. После изменения кода повторите сборку и публикацию.

Для нового Cloudflare-аккаунта сначала выполните `npm run cf:db:create` и замените `database_id` в `wrangler.jsonc` на выданный ID.

## Лимиты бесплатного тарифа

Cloudflare Workers Free включает до 100 000 запросов в сутки. D1 Free включает до 5 млн прочитанных строк и 100 000 записанных строк в сутки, а также 5 ГБ суммарного хранилища. При превышении дневных лимитов запросы к API могут временно завершаться ошибкой до сброса квот. См. [лимиты Cloudflare Workers и D1](https://developers.cloudflare.com/workers/platform/pricing/).
