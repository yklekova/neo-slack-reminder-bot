# GoIT → Slack Daily Digest

Бот раз на день читає календар GoIT і надсилає в Slack один ранковий дайджест:

- заняття протягом наступних 24 годин;
- дедлайни протягом наступних 3 діб;
- пряме посилання на зустріч, якщо GoIT уже його опублікував;
- посилання на домашнє завдання для дедлайнів;
- запасне посилання на календар, якщо пряме посилання недоступне.

Якщо актуальних подій немає, бот не надсилає порожнє повідомлення.

## Як це працює

```text
GoIT API → Cloudflare Worker → Slack-канал
                 ↓
          KV із GoIT-сесією
```

- **API** — спосіб отримати структурований список подій замість читання HTML.
- **Cloudflare Worker** — програма на сервері Cloudflare. Комп'ютер не повинен
  залишатися ввімкненим.
- **Cron Trigger** — автоматичний розклад запуску Worker.
- **Incoming Webhook** — секретна Slack-адреса для надсилання повідомлень.
- **KV** — сховище короткочасних токенів GoIT.
- **Secret** — захищене налаштування Cloudflare, якого немає у коді чи Git.

GoIT API не є публічно задокументованим. Якщо GoIT змінить його формат,
інтеграцію може знадобитися оновити.

## Розклад

У `wrangler.toml` установлено:

```text
0 6 * * *
```

Cloudflare використовує UTC. Це приблизно:

- 09:00 за Києвом у літній час;
- 08:00 за Києвом у зимовий час.

Cron запускається один раз на день. Тому це саме ранковий дайджест, а не
нагадування рівно за три години.

## Що потрібно

- Node.js 22 або новіший;
- акаунт Cloudflare;
- Slack workspace із правом створити застосунок або webhook;
- email і пароль власного GoIT-акаунта.

Перевірка Node.js:

```bash
node --version
npm --version
```

## 1. Відкрийте проєкт у Terminal

```bash
cd "/Users/oleksandrbabiuk/Documents/Codex/2026-08-06/new-chat/outputs/goit-slack-reminder-bot"
```

Перевірте:

```bash
pwd
ls
```

## 2. Створіть Slack-канал

1. У Slack біля **Channels** натисніть `+`.
2. Виберіть **Create a channel**.
3. Назвіть канал, наприклад `goit-reminders`.
4. Для особистого календаря краще вибрати приватний канал.

## 3. Створіть Slack Incoming Webhook

1. Відкрийте <https://api.slack.com/apps>.
2. Натисніть **Create New App → From scratch**.
3. Назвіть застосунок `GoIT Reminder Bot`.
4. Виберіть потрібний Slack workspace.
5. Відкрийте **Incoming Webhooks**.
6. Увімкніть **Activate Incoming Webhooks**.
7. Натисніть **Add New Webhook to Workspace**.
8. Виберіть канал `#goit-reminders` і підтвердьте доступ.
9. Скопіюйте URL виду:

```text
https://hooks.slack.com/services/...
```

Webhook URL є секретом. Не публікуйте його і не додавайте у Git.

## 4. Установіть залежності

```bash
npm ci --include=optional
```

`npm ci` встановлює точні версії з `package-lock.json`. `--include=optional`
потрібен для правильного нативного пакета `esbuild`.

Створіть локальний конфіг із безпечного шаблону:

```bash
cp wrangler.toml.example wrangler.toml
```

`wrangler.toml` доданий у `.gitignore`, тому реальні Cloudflare resource IDs не
потраплять у Git. У репозиторії зберігається тільки `wrangler.toml.example` із
placeholder.

## 5. Авторизуйте Wrangler

Wrangler — офіційна консольна програма Cloudflare.

```bash
npx wrangler login
npx wrangler whoami
```

Перша команда відкриє Cloudflare у браузері. Друга має показати ваш акаунт.

## 6. Створіть KV

```bash
npx wrangler kv namespace create GOIT_AUTH
```

Команда покаже `id`. Відкрийте локальний `wrangler.toml` і замініть:

```toml
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```

на отримане значення. Якщо реальний ID уже записаний у файлі, повторно
створювати KV не потрібно.

## 7. Додайте Secrets

Виконуйте команди по одній. Wrangler попросить секретне значення через
прихований prompt.

```bash
npx wrangler secret put SLACK_WEBHOOK_URL
npx wrangler secret put GOIT_USERNAME
npx wrangler secret put GOIT_PASSWORD
```

Значення:

- `SLACK_WEBHOOK_URL` — адреса зі Slack;
- `GOIT_USERNAME` — email для входу в GoIT;
- `GOIT_PASSWORD` — пароль GoIT.

Email і пароль не записуються у код, `wrangler.toml` або GitHub. Worker
авторизується через `/auth/login`, а короткочасні токени зберігає у KV.

Якщо secrets уже додані до цього Worker, повторювати команди не потрібно.

## 8. Перевірте код

```bash
npm run typecheck
npm test
```

У тестах має бути `fail 0`.

## 9. Опублікуйте Worker

```bash
npm run deploy
```

Wrangler покаже адресу приблизно такого вигляду:

```text
https://goit-slack-reminder-bot.<subdomain>.workers.dev
```

## 10. Перевірте `/health`

Відкрийте:

```text
https://goit-slack-reminder-bot.<subdomain>.workers.dev/health
```

Очікувана відповідь:

```json
{"ok":true,"service":"goit-slack-reminder-bot"}
```

Endpoint `/health` лише підтверджує, що Worker доступний. Він не запускає
дайджест і не використовує GoIT-пароль.

## 11. Перевірте Cron

1. Відкрийте <https://dash.cloudflare.com/>.
2. Перейдіть у **Workers & Pages**.
3. Відкрийте `goit-slack-reminder-bot`.
4. Відкрийте **Triggers**.
5. Переконайтеся, що розклад дорівнює `0 6 * * *`.

Після deploy старий розклад кожні 15 хвилин має бути замінений новим щоденним.

## Формат дайджесту

```text
📅 GoIT: найближчі події

Заняття протягом наступних 24 годин
Тема 8. Елементи функціонального програмування
п'ятниця, 7 серпня, 19:30
Приєднатися до зустрічі

Дедлайни протягом наступних 3 діб
Тема 8. Елементи функціонального програмування
неділя, 9 серпня, 23:45
Перейти до завдання
```

## Якщо ви змінили пароль GoIT

```bash
npx wrangler secret put GOIT_PASSWORD
npx wrangler kv key delete --namespace-id YOUR_KV_ID "goit-auth-state"
npm run deploy
```

`YOUR_KV_ID` — значення `id` із секції `kv_namespaces` у `wrangler.toml`.

## Перегляд журналу роботи

```bash
npx wrangler tail
```

Для завершення натисніть `Ctrl + C`.

Успішний щоденний запуск записує структурований журнал
`daily_digest_complete`. Помилка записується як `daily_digest_failed`, а в Slack
надсилається службове попередження не частіше одного разу на 6 годин.

## Типові помилки

### `You installed esbuild for another platform`

```bash
rm -rf node_modules
npm ci --include=optional
npx esbuild --version
```

Не копіюйте `node_modules` між комп'ютерами.

### `GoIT login failed`

Перевірте вхід на сайті GoIT і повторно додайте:

```bash
npx wrangler secret put GOIT_USERNAME
npx wrangler secret put GOIT_PASSWORD
```

### У Slack немає повідомлення

Бот не надсилає порожній дайджест. Повідомлення буде лише тоді, коли є заняття
протягом 24 годин або дедлайн протягом 3 діб.

Перевірте журнал через `npx wrangler tail` після наступного Cron-запуску.

### `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`

Після першого deployment Cloudflare може кілька хвилин активувати TLS-сертифікат.
Зачекайте 10–15 хвилин і повторіть перевірку `/health`.

## Оновлення коду

Після змін:

```bash
npm run typecheck
npm test
npm run deploy
```

KV і secrets повторно створювати не потрібно.

## Що більше не використовується

- `/run` видалений — публічно доступного ручного запуску немає;
- `ADMIN_TOKEN` видалений;
- D1 видалена з конфігурації — щоденному дайджесту не потрібна дедуплікація;
- стару D1 `goit-slack-reminder-db` можна видалити вручну в Cloudflare Dashboard,
  якщо вона більше ніде не використовується.

## Контрольний список

- [ ] Slack-канал і Incoming Webhook створені.
- [ ] Wrangler авторизований.
- [ ] KV ID записаний у `wrangler.toml`.
- [ ] `SLACK_WEBHOOK_URL`, `GOIT_USERNAME`, `GOIT_PASSWORD` додані як secrets.
- [ ] `npm run typecheck` успішний.
- [ ] `npm test` показує `fail 0`.
- [ ] `npm run deploy` успішний.
- [ ] `/health` повертає `ok: true`.
- [ ] У Cloudflare видно Cron `0 6 * * *`.
