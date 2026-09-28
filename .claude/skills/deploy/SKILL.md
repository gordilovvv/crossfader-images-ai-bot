---
name: deploy
description: Деплой serega-bot-images на прод-тачку avito-ai (bump версии в package.json + rsync + docker compose build/up + проверка логов). Использовать, когда просят задеплоить, выкатить или перезапустить бота на сервере.
---

# Деплой на avito-ai

Одна тачка на два бота (avito-bot и этот). Сервер: `avito-ai`, папка `/root/images-ai`. Базы у этого бота нет, процесс один (`src/main.ts`, polling) — входящие порты не нужны.

`.env` живёт только на сервере (`/root/images-ai/.env`) — никогда не перезаписывать и не читать.

## Версия

Версия хранится в `package.json` (`version`). Перед деплоем поднять patch (или minor, если есть новая фича) и закоммитить. Тег docker-образа = версия, бот пишет её в лог на старте.

## Шаги

```bash
# 1. версия (patch по умолчанию)
pnpm version patch --no-git-tag-version
git add package.json && git commit -m "v$(grep '"version"' package.json | cut -d'"' -f4)"

# 2. код на сервер
rsync -az --exclude '.git' --exclude 'node_modules' --exclude '.env' \
  --exclude 'tests/output' --exclude '.probe' --exclude '*.tsbuildinfo' --exclude '.DS_Store' \
  ./ avito-ai:/root/images-ai/

# 3. сборка и запуск с тегом версии
ssh avito-ai 'cd /root/images-ai && export VERSION=$(grep "\"version\"" package.json | cut -d"\"" -f4) && docker compose build && docker compose up -d'

# 4. логи
ssh avito-ai 'cd /root/images-ai && docker compose logs --tail 30 bot'
```

Ждём в логах `[main] serega-bot-images vX.Y.Z` и `[Telegram] @<bot> polling started`. Без `--delete`: удалённые локально файлы на сервере остаются — чистить руками.

Откат: `git switch -d <sha>` → тот же rsync + build/up (VERSION возьмётся из старого package.json) → `git switch master`.
