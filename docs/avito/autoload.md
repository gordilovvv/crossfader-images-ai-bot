# Автозагрузка (autoload)

- OpenAPI: 3.0.0
- Title: Автозагрузка
- Version: 1

## Описание

Получение отчётов о публикации и редактировании объявлений через Автозагрузку.

**Авито API для бизнеса предоставляется согласно [Условиям использования](https://www.avito.ru/legal/pro_tools/public-api).**

## Важно: предварительная настройка профиля

Перед использованием любых ручек автозагрузки необходимо создать профиль автозагрузки через `POST /autoload/v2/profile` (или старый `POST /autoload/v1/profile`). Пока профиль не создан, все ручки автозагрузки (включая `GET /autoload/v2/profile`, `POST /autoload/v1/upload`, `GET /autoload/v2/reports` и т.д.) будут возвращать `403 Forbidden`. После создания профиля 403 пропадёт и ручки начнут отвечать штатно.

## Base URL / Servers

| URL |
|-----|
| `https://api.avito.ru/` |

## Tags

| Name | x-displayName | Description |
|------|---------------|-------------|
| `Autoload` | Сервис Автозагрузка | Методы API для получения информации об автозагрузке объявлений |

## Security schemes

### `AuthorizationCode` (OAuth2 — authorization_code)

- type: `oauth2`
- description: Это API использует OAuth 2 с механизмом `authorization_code`. Используйте его для доступа к данным других пользователей при разработке стороннего приложения.
- flows.authorizationCode:
  - authorizationUrl: `https://avito.ru/oauth`
  - tokenUrl: `https://api.avito.ru/token`
  - scopes:

| Scope | Description |
|-------|-------------|
| `autoload:reports` | Получение отчетов Автозагрузки |
| `items:apply_vas` | Применение дополнительных услуг |
| `items:info` | Получение информации об объявлениях |
| `job:applications` | Получение информации об откликах на вакансии |
| `job:cv` | Получение информации резюме |
| `job:write` | Изменение объявлений вертикали Работа |
| `messenger:read` | Чтение сообщений в мессенджере Авито |
| `messenger:write` | Модифицирование сообщений в мессенджере Авито |
| `short_term_rent:read` | Получение информации об объявлениях краткосрочной аренды |
| `short_term_rent:write` | Изменение объявлений краткосрочной аренды |
| `stats:read` | Получение статистики объявлений |
| `user:read` | Получение информации о пользователе |
| `user_balance:read` | Получение баланса пользователя |
| `user_operations:read` | Получение истории операций пользователя |

### `ClientCredentials` (OAuth2 — client_credentials)

- type: `oauth2`
- description: Это API использует OAuth 2 с механизмом `client_credentials`. Используйте его для доступа к возможностям своей личной учетной записи.
- flows.clientCredentials:
  - tokenUrl: `https://api.avito.ru/token`
  - scopes: `{}`

---

## Endpoints

Tag: `Autoload`.

### GET `/autoload/v1/profile` — Получение профиля пользователя автозагрузки (deprecated)

- operationId: `getProfile`
- deprecated: `true`

**Описание:**
Возвращает настройки профиля пользователя автозагрузки. С 23.12.2024 вместо поля `upload_url` используйте поле `feeds_data`. В нём содержится название файла и ссылка на него. [Новая версия](https://developers.avito.ru/api-catalog/autoload/documentation#operation/getProfileV2).

**Path-level parameters:** `authHeader` ref.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `Authorization` | header | string (example `Bearer ACCESS_TOKEN`) | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline object (см. ниже) | Успешное получение данных пользователя |
| 400 | application/json | `FieldErrorV2` | Неверный запрос |
| 403 | application/json | `FieldErrorV2` | Доступ запрещён |
| 404 | application/json | `FieldErrorV2` | Профиль не найден |
| 500 | application/json | `FieldErrorV2` | Внутренняя ошибка метода API |

200 inline schema (required: `upload_url`, `autoload_enabled`, `report_email`, `schedule`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `autoload_enabled` | boolean | yes | Статус автозагрузки (вкл/выкл) |
| `report_email` | string, nullable | yes | Почта, на которую будут приходить отчеты о выгрузках |
| `schedule` | `ExportSchedule` | yes | — |
| `upload_url` | string, nullable | yes | URL-адрес фида, для которого настроены регулярные выгрузки. Должен начинаться с http или https |

---

### POST `/autoload/v1/profile` — Создание/редактирование настроек профиля пользователя автозагрузки (deprecated)

- operationId: `createOrUpdateProfile`
- deprecated: `true`

**Описание:**
Предназначен для создания и управления профилем автозагрузки. Если профиля еще не существует — через этот метод можно его создать.

С 23.12.2024 вместо поля `upload_url` используйте поле `feeds_data`. [Новая версия](https://developers.avito.ru/api-catalog/autoload/documentation#operation/createOrUpdateProfileV2).

#### Parameters (path-level)

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `Authorization` | header | string (example `Bearer ACCESS_TOKEN`) | yes | Токен для авторизации |

#### Request body (`application/json`)

Schema ref: `UpsertProfileIn`.

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | — | — | Успешное обновление настроек профиля |
| 400 | application/json | `FieldErrorV2` | Неверный запрос |
| 403 | application/json | `FieldErrorV2` | Доступ запрещён |
| 500 | application/json | `FieldErrorV2` | Внутренняя ошибка метода API |

---

### POST `/autoload/v1/upload` — Загрузка файла по ссылке

- operationId: `upload`

**Описание:**
Метод запускает процесс выгрузки объявлений из файла по ссылке, которая указана в настройках автозагрузки в профиле Авито. В течение часа таким способом можно запустить только одну выгрузку.

**Важно:** на загрузки с помощью этого метода не распространяются лимиты на количество публикаций, которые указаны в настройках автозагрузки в профиле Авито. Все объявления из файла, которые могут быть опубликованы или активированы, будут опубликованы или активированы.

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | — | — | Выгрузка файла по ссылке запущена успешно |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v1/user-docs/node/{node_slug}/fields` — Получения полей категории

- operationId: `userDocsNodeFields`

**Описание:**
Метод позволяет получить поля конкретной категории и их параметры, зависимости полей, возможные значения и их типы, предупреждения (например, когда поле станет обязательным) и ссылки на каталоги значений.

#### Parameters (path-level)

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `node_slug` | path | string (example `remont`) | yes | slug узла дерева категории |
| `If-Modified-Since` | header | string, nullable (example `Mon, 01 Jan 0001 00:00:00 UTC`) | no | Дата и время последней полученной версии в формате RFC1123 в UTC |

#### Responses

| Status | Content-Type | Schema | Response headers | Description |
|--------|--------------|--------|------------------|-------------|
| 200 | application/json | `APIFieldsOut` | `Last-Modified` → `LastModifiedSinceHeader` | Успешное получение полей для переданной категории |
| 304 | — | — | `Last-Modified` → `LastModifiedSinceHeader` | Вернётся пустой ответ, если дата в заголовке `If-Modified-Since` раньше даты последней сборки документации. |
| 400 | application/json | inline (см. ниже) | — | Неправильный запрос |
| 403 | application/json | inline (см. ниже) | — | Ошибка авторизации пользователя |
| 404 | application/json | inline (см. ниже) | — | Запрашиваемый ресурс не найден |

Inline error schema (400/403/404, required: `code`, `message`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | integer | yes | Код ошибки |
| `message` | string | yes | Текст ошибки |

---

### GET `/autoload/v1/user-docs/tree` — Получение дерева категорий

- operationId: `userDocsTree`

**Описание:**
Метод позволяет получить дерево категорий Авито в виде массива.

#### Parameters (path-level)

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `If-Modified-Since` | header | string, nullable | no | Дата и время последней полученной версии в формате RFC1123 в UTC |

#### Responses

| Status | Content-Type | Schema | Response headers | Description |
|--------|--------------|--------|------------------|-------------|
| 200 | application/json | `APICategoryTreeOut` | `Last-Modified` → `LastModifiedSinceHeader` | Успешное получение дерева категорий |
| 304 | — | — | `Last-Modified` → `LastModifiedSinceHeader` | Вернётся пустой ответ, если дата в заголовке `If-Modified-Since` раньше даты последней сборки документации. |
| 403 | application/json | inline (code, message) | — | Ошибка авторизации пользователя |

---

### GET `/autoload/v2/items/ad_ids` — ID объявлений из файла

- operationId: `getAdIdsByAvitoIds`

**Описание:**
Метод позволяет получить идентификаторы (ID) объявлений из файла автозагрузки по ID объявлений на Авито.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `query` | query | string | yes | Список ID объявлений. Формат значения: строка с идентификаторами объявлений на Авито, перечисленными через «,» или «\|». |
| `Authorization` | header | string (example `Bearer ACCESS_TOKEN`) | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline (required: `items`) | Успешный ответ |
| default | application/json | `FieldErrorV2` | Все ошибки |

200 inline schema:

```
{ items: array<{ ad_id?: string|null (описание: Идентификатор объявления из файла),
                 avito_id: integer (required, Идентификатор объявления на Авито) }> (required) }
```

---

### GET `/autoload/v2/items/avito_ids` — ID объявлений на Авито

- operationId: `getAvitoIdsByAdIds`

**Описание:**
Метод позволяет получить идентификаторы (ID) объявлений на Авито по идентификаторам объявлений из файла автозагрузки.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `query` | query | string | yes | Список ID объявлений. Формат значения: строка с идентификаторами объявлений из файла, перечисленными через «,» или «\|». |
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline (required: `items`) | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

200 inline schema:

```
{ items: array<{ ad_id: string (required, Идентификатор объявления из файла),
                 avito_id?: integer|null (Идентификатор объявления на Авито) }> (required) }
```

---

### GET `/autoload/v2/profile` — Получение профиля пользователя автозагрузки

- operationId: `getProfileV2`

**Описание:**
Возвращает настройки профиля пользователя автозагрузки. С 23.12.2024 вместо поля `upload_url` используйте поле `feeds_data`.

**Path-level parameters:** `authHeader` ref.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline (см. ниже) | Успешное получение данных пользователя |
| 400 | application/json | `FieldErrorV2` | Неверный запрос |
| 403 | application/json | `FieldErrorV2` | Доступ запрещён |
| 404 | application/json | `FieldErrorV2` | Профиль не найден |
| 500 | application/json | `FieldErrorV2` | Внутренняя ошибка метода API |

200 inline schema (required: `feeds_data`, `autoload_enabled`, `report_email`, `schedule`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `autoload_enabled` | boolean | yes | Статус автозагрузки (вкл/выкл) |
| `feeds_data` | `FeedsData` | yes | — |
| `report_email` | string, nullable | yes | Почта, на которую будут приходить отчеты о выгрузках |
| `schedule` | `ExportSchedule` | yes | — |

---

### POST `/autoload/v2/profile` — Создание/редактирование настроек профиля пользователя автозагрузки

- operationId: `createOrUpdateProfileV2`

**Описание:**
Предназначен для создания и управления профилем автозагрузки. Если профиля еще не существует — через этот метод можно его создать. С 23.12.2024 вместо поля `feed_url` используйте поле `feeds_data`.

#### Request body (`application/json`)

Schema ref: `UpsertProfileInV2`.

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | — | — | Успешное обновление настроек профиля |
| 400 | application/json | `FieldErrorV2` | Неверный запрос |
| 403 | application/json | `FieldErrorV2` | Доступ запрещён |
| 500 | application/json | `FieldErrorV2` | Внутренняя ошибка метода API |

---

### GET `/autoload/v2/reports` — Список отчётов автозагрузки

- operationId: `getReportsV2`

**Описание:**
По запросу вы получите список отчётов автозагрузки. Они будут отсортированы в порядке убывания: самый свежий отчёт — в начале списка.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `per_page` | query | integer (default 50) | no | Количество отчётов на странице: целое число больше 0 и меньше или равно 200 |
| `page` | query | integer (default 0) | no | Номер страницы: целое число больше или равно 0 |
| `date_from` | query | string, date-time (RFC3339, example `2022-05-27T14:48:50.52Z`) | no | Фильтр по дате создания отчёта «от» (от такой-то даты) |
| `date_to` | query | string, date-time (RFC3339) | no | Фильтр по дате создания отчёта «до» (до такой-то даты) |
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline: `{ meta: MetaReportsAutoloadV2, reports: ReportShortAutoloadV2 }` | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v2/reports/items` — Объявления по ID в автозагрузке

- operationId: `getAutoloadItemsInfoV2`

**Описание:**
По запросу API отдаст данные по конкретным объявлениям.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `query` | query | string | yes | Идентификаторы объявлений из файла (параметр Id). Формат значения: строка, содержащая от 1 до 100 идентификаторов, перечисленных через «,» или «\|». |
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline: `{ items: array<ItemInfoAutoloadV2> }` (required: `items`) | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v2/reports/last_completed_report` — Статистика по последней выгрузке (deprecated)

- operationId: `getLastCompletedReport`
- deprecated: `true`

**Описание:**
Метод возвращает сводную статистику с результатами последней завершённой выгрузки. С 23.12.2024 вместо поля `feed_url` используйте поле `feeds_urls`. [Новая версия](https://developers.avito.ru/api-catalog/autoload/documentation#operation/getLastCompletedReportV3).

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `ReportAutoloadV2` | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v2/reports/{report_id}` — Статистика по конкретной выгрузке (deprecated)

- operationId: `getReportByIdV2`
- deprecated: `true`

**Описание:**
Метод возвращает сводную статистику с результатами конкретной выгрузки — по ID отчёта.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `report_id` | path | integer | yes | Идентификатор отчёта (ID) |
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `ReportAutoloadV2` | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v2/reports/{report_id}/items` — Все объявления из конкретной выгрузки

- operationId: `getReportItemsById`

**Описание:**
С помощью этого метода можно получить результаты обработки каждого объявления в конкретной выгрузке. С 23.12.2024 добавляется поле `feed_name`.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `report_id` | path | integer | yes | Идентификатор отчёта (ID) |
| `per_page` | query | integer (default 50) | no | Количество объявлений на странице: целое число больше 0 и меньше или равно 200 |
| `page` | query | integer (default 0) | no | Номер страницы: целое число больше или равно 0 |
| `query` | query | string | no | Фильтр по ID объявления. Формат значения: строка с идентификаторами объявлений из файла или идентификаторами объявлений на Авито, перечисленными через «,» или «\|». |
| `sections` | query | string | no | Фильтр объявлений по разделам. Формат значения: строка с идентификаторами разделов через «,» или «\|». |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline: `{ report_id: integer (required), items: array<ItemInfoReportAutoloadV2> (required), meta: MetaReportItemsAutoloadV2 (required) }` | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v2/reports/{report_id}/items/fees` — Списания за объявления в конкретной выгрузке

- operationId: `getReportItemsFeesById`

**Описание:**
С помощью этого метода можно получить информацию о списаниях за размещение каждого объявления в конкретной выгрузке.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `report_id` | path | integer | yes | Идентификатор отчёта (ID) |
| `per_page` | query | integer (default 100) | no | Количество объявлений на странице: целое число больше 0 и меньше или равно 200 |
| `page` | query | integer (default 0) | no | Номер страницы: целое число больше или равно 0 |
| `ad_ids` | query | string | no | Фильтр по ID объявления. Формат значения: строка с идентификаторами объявлений из файла через «,» или «\|». |
| `avito_ids` | query | string | no | Фильтр по AvitoID объявления. Формат значения: строка с идентификаторами объявлений на Авито через «,» или «\|». |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | inline (см. ниже) | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

200 inline schema (required: `report_id`, `items`, `meta`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `report_id` | integer | yes | Идентификатор отчёта (ID) |
| `fees` | array<`ItemFeesInfoReportAutoloadV2`> | no | Список списаний за размещение объявлений |
| `meta` | object `{ page: integer, pages: integer, per_page: integer, total: integer }` | no | Данные пагинации |

(Обратите внимание: в required перечислены `items`, но в properties есть `fees`.)

---

### GET `/autoload/v3/reports/last_completed_report` — Статистика по последней выгрузке

- operationId: `getLastCompletedReportV3`

**Описание:**
Метод возвращает сводную статистику с результатами последней завершённой выгрузки. С 23.12.2024 вместо поля `feed_url` используйте поле `feeds_urls`.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `ReportAutoloadV3` | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

### GET `/autoload/v3/reports/{report_id}` — Статистика по конкретной выгрузке

- operationId: `getReportByIdV3`

**Описание:**
Метод возвращает сводную статистику с результатами конкретной выгрузки — по ID отчёта. С 23.12.2024 вместо поля `feed_url` используйте поле `feeds_urls`.

#### Parameters

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| `report_id` | path | integer | yes | Идентификатор отчёта (ID) |
| `Authorization` | header | string | yes | Токен для авторизации |

#### Responses

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `ReportAutoloadV3` | Успешный ответ |
| default | application/json | `FieldErrorV2` | Информация об ошибке |

---

## Components

### Parameters (`components.parameters`)

| Name | in | Required | Schema | Description |
|------|----|----------|--------|-------------|
| `IfModifiedSinceHeader` | header (`If-Modified-Since`) | no | string, nullable, example `Mon, 01 Jan 0001 00:00:00 UTC` | Дата и время последней полученной версии в формате RFC1123 в UTC |
| `NodeSlug` | path (`node_slug`) | yes | string, example `remont` | slug узла дерева категории |
| `authHeader` | header (`Authorization`) | yes | string, example `Bearer ACCESS_TOKEN` | Токен для авторизации |
| `chatId` | path (`chat_id`) | yes | string | Идентификатор чата (клиента) |
| `itemIds` | query (`item_ids`) | no | string, example `12345,6789` | — |
| `limit` | query (`limit`) | no | integer int32, default 100, example 50 | Количество сообщений на странице (положительное число больше 0 и меньше 100) |
| `messageId` | path (`message_id`) | yes | string | Идентификатор сообщения |
| `offset` | query (`offset`) | no | integer int32, default 0, example 50 | — |
| `page` | query (`page`) | no | integer int32 | Номер страницы |
| `pathItemId` | path (`item_id`) | yes | integer int64 | Идентификатор объявления на сайте |
| `pathUserId` | path (`user_id`) | yes | integer int64 | Номер пользователя в Личном кабинете Авито |
| `pathVacancyId` | path (`vacancy_id`) | yes | integer int64 | Идентификатор вакансии на сайте |
| `perPage` | query (`per_page`) | no | integer int32 | Количество ресурсов на страницу |
| `unreadOnly` | query (`unread_only`) | no | boolean, example `true` | — |
| `userId` | path (`user_id`) | yes | integer int64 | Идентификатор пользователя (клиента) |

### Headers (`components.headers`)

| Name | Schema | Example | Description |
|------|--------|---------|-------------|
| `LastModifiedSinceHeader` | string | `Mon, 01 Jan 0001 00:00:00 UTC` | Дата и время последней полученной версии в формате RFC1123 в UTC |
| `StoreFrontCacheHeader` | string | — | Заголовок говорит нужно ли кэшировать ответ на стороне фронта |
| `X-RateLimit-Limit` | integer int32 | — | Количество запросов в минуту |
| `X-RateLimit-Remaining` | integer int32 | — | Доступное количество запросов в текущем временном окне |

### Schemas (`components.schemas`)

#### `APFieldsNodeAlert`
- type: `object`, nullable, description: «Предупреждение для запрошенной категории»

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `description` | string | no | Описание предупреждения | `Категория будет разбита на подкатегории` |
| `title` | string | no | Заголовок предупреждения | `Изменения в категории` |
| `type` | string, enum: `error`,`warning`,`info` | no | Тип предупреждения | `warning` |

#### `APICategoryNode`
- type: `object`, required: `name`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Название категории |
| `nested` | array (items: object with additionalProperties `{ items: APICategoryNode[] }`) | no | Дочерние категории |
| `slug` | string | no | Slug категории для получения полей |

#### `APICategoryTreeOut`
- type: `object`, required: `categories`

| Field | Type | Required |
|-------|------|----------|
| `categories` | array<`APICategoryNode`> | yes |

#### `APIDependency`
- type: `object`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string, enum: `visible`,`required`,`hidden` | no | Что нужно сделать с полем после применения правил. `visible` — поле доступно для заполнения; `required` — становится обязательным; `hidden` — недоступно |
| `clause` | string, enum: `or`,`and` | no | Логический оператор для определения применимости |
| `pairs` | array<`APIDependencyPair`> | no | Список правил |

#### `APIDependencyPair`
- type: `object`

| Field | Type | Required |
|-------|------|----------|
| `clause` | string, enum: `value`,`filled`,`empty` | no |
| `source_field_tag` | string | no |
| `values` | array<string> | no |

#### `APIField`
- type: `object`, description: «Поля для категории, включая поля вложенных подкатегорий»

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `children` | array<`ChildAPIField`> | no | — | — |
| `content` | array<`APIFieldContent`> | no | Набор правил для заполнения тега | — |
| `descriptions` | string | no | Описание тега | `Категория объявления` |
| `feed_format` | array<string, enum: `xml`,`excel`> | no | — | `{xml:null}` |
| `label` | string | no | Label (на русском) для указания в файле загрузки | `Категория` |
| `tag` | string | no | Тег для указания в файле загрузки | `Category` |

#### `APIFieldContent`
- type: `object`, required: `field_type`, `data_type`, `required`, `required_by_dependency`

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `data_type` | string, enum: `string`,`integer`,`float` | yes | Тип данных в поле | `string` |
| `default` | `FieldValue` | no | — | — |
| `dependencies` | array<`APIDependency`> | no | Список зависимостей одного поля от других | — |
| `dependencies_text` | array<string> | no | Текстовое представление описания зависимостей поля | — |
| `field_type` | string, enum: `input`,`select`,`checkbox` | yes | Тип поля: `input` — произвольное значение; `select` — одно значение из заданных; `checkbox` — одно или несколько из заданных | `select` |
| `is_catalog` | boolean | no | Являются ли значения поля каталожными | `true` |
| `name_in_catalog` | string, nullable | no | Название поля в каталоге | `vendor` |
| `required` | boolean | yes | Признак обязательности поля | `true` |
| `required_by_dependency` | boolean | yes | Признак того, что поле может быть обязательным в зависимости от значения другого поля | `true` |
| `values` | array<`FieldValue`> | no | Список возможных значений для поля | — |
| `values_link_json` | string, nullable | no | Ссылка для получения списка полей в формате json | `https://api.avito.ru/autoload/v1/user-docs/node/zapchasti_i_aksessuary/field/115633/values-json` |
| `values_link_xml` | string, nullable | no | Ссылка для получения списка полей в формате xml | `https://api.avito.ru/autoload/v1/user-docs/node/zapchasti_i_aksessuary/field/115633/values-xml` |
| `values_range` | `FieldValueRange` | no | — | — |
| `warnings` | array<`FieldWarning`>, nullable | no | — | — |

#### `APIFieldsNode`
- type: `object`, required: `name`, `slug`, description: «Данные запрашиваемой категории»

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | yes | Название категории | `Ремонт` |
| `slug` | string | yes | Уникальный идентификатор категории (slug) | `remont` |

#### `APIFieldsOut`
- type: `object`, required: `node`, `fields`

| Field | Type | Required |
|-------|------|----------|
| `alert` | `APFieldsNodeAlert` | no |
| `fields` | array<`APIField`> | yes |
| `node` | `APIFieldsNode` | yes |

#### `CategoryNode`
- type: `object`, required: `name`, `id`, `is_support_rus_label`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | yes | Id категории |
| `is_support_rus_label` | boolean | yes | Поддерживается ли русские значения тегов |
| `name` | string | yes | Название категории |
| `nested` | array<`CategoryNode`> | no | Вложенный объект ноды |
| `show_fields` | boolean | no | Можно ли показывать поля для этого узла |

Example:
```
{"id":1,"name":"Животные","nested":[{"id":2,"name":"Кошки","show_fields":true},{"id":3,"name":"Собаки","nested":[{"id":4,"name":"Злые","show_fields":true},{"id":5,"name":"Добрые","show_fields":true}],"show_fields":true}]}
```

#### `CategoryTreeOut`
- type: `object`

| Field | Type | Required |
|-------|------|----------|
| `categories` | array<`CategoryNode`> | no |

#### `ChildAPIField`
- type: `object`, description: «Поля для категории, включая поля вложенных подкатегорий»

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `content` | array<`APIFieldContent`> | no | Набор правил для заполнения тега | — |
| `descriptions` | string | no | Описание тега | `Категория объявления` |
| `feed_format` | array<string, enum: `xml`,`excel`> | no | — | `{xml:null}` |
| `label` | string | no | Label (на русском) для указания в файле загрузки | `Категория` |
| `tag` | string | no | Тег для указания в файле загрузки | `Category` |

#### `ErrorAutoload`
- type: `object`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error` | object (см. ниже) | no | — |

`error` (required: `code`, `message`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string, enum: `fail`,`success` | yes | Код ошибки |
| `fields` | object (additionalProperties `FieldError`) | no | Поля, в которых возникла ошибка |
| `message` | string | yes | Описание ошибки |

#### `ExportSchedule`
- type: `array<object>`, description: «Расписание регулярных выгрузок. Содержит периоды и сколько объявлений загружать за каждый период. Каждый период — часовой промежуток, в течение которого будет запущена выгрузка. Время указывается по Москве.»

Element (required: `rate`, `weekdays`, `time_slots`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rate` | integer | yes | Количество объявлений за период |
| `time_slots` | array<integer> | yes | Период, в который будет запущена выгрузка. Допустимые значения: целые числа от 0 до 23, где 0 — 00:00–01:00, 23 — 23:00–24:00 |
| `weekdays` | array<integer> | yes | День недели периода. Допустимые значения: целые числа от 0 до 6, где 0 — понедельник, 6 — воскресенье |

#### `FeedsData`
- type: `array<object>`, nullable

Element (required: `feed_name`, `feed_url`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `feed_name` | string | yes | Название фида. Будет отображаться в отчёте, показывает откуда взято объявление |
| `feed_url` | string | yes | URL-адрес фида, для которого настроены регулярные выгрузки. Должен начинаться с http или https |

#### `FieldError`
- type: `object`, required: `code`, `message`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Код ошибки |
| `message` | string | yes | Описание ошибки |

#### `FieldErrorV2`
- type: `object`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error` | object `{ code: integer (required, Код ошибки), message: string (required, Описание ошибки) }` | no | — |

#### `FieldValue`
- type: `object`, nullable

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `description` | string | no | Опциональное описание значения | — |
| `value` | string | no | Текстовое значение | `Предложение услуг` |

#### `FieldValueRange`
- type: `object`, nullable, description: «Промежуток допустимых значений. Применимо для типов данных int и float. Для типа string — ограничение длины строки.»

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `max` | integer, nullable | no | `42` |
| `min` | integer, nullable | no | `0` |

#### `FieldWarning`
- type: `object`, required: `title`, `content`

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `content` | string | yes | Содержание предупреждения | `Поле станет обязательным после 12.12.2022` |
| `title` | string | yes | Заголовок предупреждения | `Изменяется обязательность` |

#### `ItemFeesInfoReportAutoloadV2`
- type: `object`, required: `ad_id`, `avito_id`, `fees_type`, `fees_amount`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ad_id` | string | yes | Идентификатор объявления из файла (параметр Id) |
| `avito_id` | integer | yes | Идентификатор объявления на Авито |
| `fees_amount` | integer | yes | Сумма средств, списанных из кошелька при разовой оплате, либо количество размещений, списанных из пакета |
| `fees_package_id` | integer, nullable | no | ID пакета размещений |
| `fees_type` | string, enum: `single`,`package` | yes | Тип списания (разовая оплата или из пакета размещений) |

#### `ItemInfoAutoload`
- type: `object`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `alarm` | array<`ItemInfoErrorAutoload`> | no | Ошибки, при которых публикация/обновление происходит, но при этом с объявлением есть проблема, требующая вмешательства пользователя |
| `applied_vas` | array<string, enum: `vip`,`highlight`,`pushup`,`premium`,`turbo_sale`,`quick_sale`> | no | Список применённых при выгрузке дополнительных услуг (`premium` — премиум-объявление, `vip` — VIP, `pushup` — поднятие в поиске, `highlight` — выделение, `turbo_sale` — Турбо-продажа, `quick_sale` — Быстрая продажа) |
| `avito_id` | integer int32, nullable | no | Идентификатор объявления на сайте |
| `errors` | array<`ItemInfoErrorAutoload`> | no | Ошибки, при возникновении которых публикация не происходит |
| `event_time` | string, date-time | no | Дата последнего изменения состояния (статуса) выгрузки объявления |
| `fee_info` | object, nullable: `{ amount: number float (Сумма списания), package_id: integer int32 (ID пакета), type: string enum single|package }` | no | Информация о платном размещении |
| `processing_time` | string, date-time | no | Дата последнего цикла обработки |
| `status` | string, enum: `success`,`problem`,`error`,`not_publish`,`will_publish_later`,`duplicate`,`without_id`,`deleted`,`unknown` | no | Статус выгрузки объявления |
| `status_detail` | string, enum (см. ниже) | no | Подробный статус выгрузки объявления |
| `url` | string, nullable | no | URL объявления на сайте |
| `warnings` | array<`ItemInfoErrorAutoload`> | no | Ошибки, которые информируют, но не требуют вмешательства |

`status_detail` допустимые значения:
`success_added`, `success_activated`, `success_activated_updated`, `success_updated`, `success_skipped`, `problem_obsolete`, `problem_params_critical`, `problem_params`, `problem_phone`, `problem_images`, `problem_vas`, `problem_other`, `problem_several`, `error_fee`, `error_params`, `error_phone`, `error_rejected`, `error_blocked`, `error_deleted`, `error_other`, `error_several`, `stopped_end_date_complete`, `stopped_end_date_error`, `date_in_future`, `publish_later`, `linker`, `removed_complete`, `removed_error`, `need_sync`, `duplicate`, `without_id`.

Расшифровка статусов:
- `success_added` — Объявление добавлено на сайт в последний цикл автозагрузки
- `success_activated` — Активировано из ранее снятых с публикации или завершённых
- `success_activated_updated` — Активировано из ранее снятых с публикации или завершённых и изменено
- `success_updated` — Объявление было изменено
- `success_skipped` — Без изменений оставлено активным на сайте
- `problem_obsolete` — Устаревший формат XML
- `problem_params_critical` — Ошибки, связанные с описанием или значениями параметров; объявление может исчезнуть с сайта
- `problem_params` — Ошибки, связанные с описанием или значениями параметров
- `problem_phone` — Проблемы с телефонным номером в контактной информации
- `problem_images` — Ошибки размещения фотографий
- `problem_vas` — Ошибки активации дополнительных услуг
- `problem_other` — Прочие ошибки
- `problem_several` — Несколько разных ошибок
- `error_fee` — Не опубликовано из-за проблем с оплатой размещения
- `error_params` — Не удалось опубликовать из-за ошибок параметров
- `error_phone` — Не удалось опубликовать из-за проблем с телефонным номером
- `error_rejected` — Отклонено модерацией
- `error_blocked` — Заблокировано модерацией
- `error_deleted` — Невозможно обработать: ранее объявление было удалено с сайта
- `error_other` — Прочие ошибки
- `error_several` — Несколько ошибок
- `stopped_end_date_complete` — Снято/не опубликовано по истечении срока экспозиции
- `stopped_end_date_error` — Ошибки при попытке снятия с публикации
- `date_in_future` — Дата начала экспозиции ещё не наступила
- `publish_later` — Не добавлено из-за ограничения на количество публикуемых за цикл
- `linker` — Похоже на размещённое ранее через ЛК, требуется решение
- `removed_complete` — Снято с публикации, т.к. удалено из XML
- `removed_error` — Ошибки при попытке снятия с публикации
- `need_sync` — Ожидает синхронизации с сайтом
- `duplicate` — Объявления имеют одинаковое описание
- `without_id` — Объявление без идентификатора

#### `ItemInfoAutoloadV2`
- type: `object`, required: `ad_id`, `avito_id`, `url`, `messages`, `fee_info`, `processing_time`, `avito_date_end`, `avito_status`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ad_id` | string | yes | Идентификатор объявления из файла (параметр Id) |
| `avito_date_end` | string, date-time, nullable | yes | Дата окончания оплаченного периода размещения объявления |
| `avito_id` | integer, nullable | yes | Идентификатор объявления на Авито |
| `avito_status` | string, enum: `active`,`old`,`blocked`,`rejected`,`archived`,`removed`, nullable | yes | Статус объявления на Авито: `active` — активно, `old` — срок размещения истёк, `blocked` — заблокировано, `rejected` — отклонено для исправления, `archived` — в Архиве, `removed` — удалено навсегда |
| `fee_info` | object, nullable: `{ amount: integer nullable (если type=single), package_id: integer nullable (если type=package), type: string enum single|package (required) }` | yes | Информация о списании за размещение объявления |
| `messages` | array<`ItemInfoError`> | yes | Ошибки или предупреждения по объявлению |
| `processing_time` | string, date-time, nullable | yes | Дата и время последней обработки объявления |
| `section` | object `{ slug: string (required, ID раздела), title: string (required, Название раздела) }` | no | Раздел отчёта, в котором находится объявление |
| `url` | string, nullable | yes | Ссылка на объявление на Авито |

#### `ItemInfoError`
- type: `object`, required: `code`, `title`, `type`, `description`, `updated_at`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | integer | yes | Код ошибки или предупреждения |
| `description` | string | yes | Описание ошибки или предупреждения |
| `title` | string | yes | Название ошибки или предупреждения |
| `type` | string, enum: `error`,`warning`,`info`,`alarm` | yes | Тип: `error` — критическая, влияет на выгрузку; `warning` — некритическая; `alarm` — не влияет на выгрузку; `info` — информационное |
| `updated_at` | string, date-time | yes | Дата актуальности ошибки или предупреждения |

#### `ItemInfoErrorAutoload`
- type: `object`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | integer int32 | no | Идентификатор события |
| `description` | string | no | Описание |
| `manual` | string, nullable | no | Ссылка на документацию |
| `title` | string | no | Заголовок |

#### `ItemInfoReportAutoloadV2`
- type: `object`, required: `section`, `ad_id`, `avito_id`, `url`, `messages`, `avito_date_end`, `avito_status`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ad_id` | string | yes | Идентификатор объявления из файла (параметр Id) |
| `applied_vas` | array<`ItemInfoVas`> | no | Список применённых в конкретной выгрузке услуг продвижения |
| `avito_date_end` | string, format ISO 8601, nullable | yes | Дата окончания оплаченного периода размещения объявления |
| `avito_id` | integer, nullable | yes | Идентификатор объявления на Авито |
| `avito_status` | string, enum: `active`,`old`,`blocked`,`rejected`,`archived`,`removed`, nullable | yes | Статус объявления на Авито |
| `feed_name` | string, nullable | no | Название фида, из которого было взято объявление |
| `messages` | array<`ItemInfoError`> | yes | Ошибки или предупреждения по объявлению |
| `section` | object `{ slug: string (required), title: string (required) }` | yes | Раздел отчёта, в котором находится объявление |
| `url` | string, nullable | yes | Ссылка на объявление на Авито |

#### `ItemInfoVas`
- type: `object`, required: `slug`, `title`, `price`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `price` | integer | yes | Сумма средств, списанных из кошелька за эту услугу |
| `slug` | string, enum: `xl`,`highlight`,`x2_1`,`x2_7`,`x5_1`,`x5_7`,`x10_1`,`x10_7`,`x15_1`,`x15_7`,`x20_1`,`x20_7` | yes | ID услуги: `highlight` — Выделение цветом (7 дней), `xl` — XL-объявление (7 дней), `x2_1`..`x20_7` — до N раз больше просмотров на 1 или 7 дней |
| `title` | string | yes | Название услуги |

#### `MetaAutoload`
- type: `object`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | integer int32 | no | Количество ресурсов на страницу |
| `pages` | integer int32 | no | Количество страниц |
| `per_page` | integer int32 | no | Количество ресурсов на страницу |

#### `MetaReportItemsAutoloadV2`
- type: `object`, description: «Данные пагинации»

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | integer | no | Номер страницы |
| `pages` | integer | no | Общее количество страниц |
| `per_page` | integer | no | Количество объявлений на странице |
| `total` | integer | no | Общее количество объявлений в отчёте |

#### `MetaReportsAutoloadV2`
- type: `object`, description: «Данные пагинации»

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | integer | no | Номер страницы |
| `pages` | integer | no | Общее количество страниц |
| `per_page` | integer | no | Количество отчётов на странице |
| `total` | integer | no | Общее количество отчётов |

#### `ReportAutoload`
- type: `object`, required: `id`, `ads`, `finished_at`, `started_at`, `status`, `customer_name`, `generated_at`, `version`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ads` | array<object> (см. ниже) | yes | Список объявлений |
| `customer_name` | string | yes | Название организации |
| `finished_at` | string, date-time | yes | Время окончания выгрузки объявлений на сайт |
| `generated_at` | string, date-time | yes | Время генерации данного отчета |
| `listing_fee` | array<object> (см. ниже) | no | Использованные при публикации пакеты размещения |
| `started_at` | string, date-time | yes | Время создания отчёта |
| `status` | string | yes | Общий статус выгрузки |
| `vas` | array<object> (см. ниже) | no | Какие были применены услуги при данной выгрузке |
| `version` | string | yes | Версия формата отчёта |

`ads[]` элемент:

| Field | Type | Description |
|-------|------|-------------|
| `ad_id` | string | ID объявления в исходном XML-файле клиента |
| `avito_date_end` | string, date-time | Дата окончания публикации объявления |
| `avito_id` | string | ID опубликованного объявления в Авито |
| `messages` | object `{ code: integer int32 (условный код), description: string nullable, element_name: string nullable (название элемента в XML), help_url: string (URL-адрес документации), type: string (warning, alarm, error) }` | Сообщения о событиях |
| `statuses` | object `{ avito: { help: string, value: string } (Статус размещения на сайте), general: { help, value } (Общий статус), processing: { help, value } (Статус предварительной обработки) }` | Статусы обработки объявления |
| `url` | string | URL-адрес объявления на сайте Авито |

`listing_fee[]` элемент (required: `description`):

| Field | Type | Description |
|-------|------|-------------|
| `amount` | number | Сумма списания за размещение из кошелька |
| `description` | string (required) | Описание пакета/разового размещения (при оплате из кошелька) |
| `finish_time` | string, date-time | Время окончания пакета |
| `listing_left` | integer | Сколько размещений в пакете осталось |
| `listing_used` | integer | Сколько размещений из пакета использовано |
| `package_id` | integer | id пакета |
| `package_size` | integer | Сколько размещений в пакете предоплачено |
| `type` | string | Тип размещения |

`vas[]` элемент:

| Field | Type | Description |
|-------|------|-------------|
| `activated` | integer | В процессе применения |
| `active` | integer | Активна на текущий момент |
| `error` | integer | Ошибка применения |
| `name` | string | Название услуги |
| `type` | string, enum: `service`,`package` | Тип услуги: `service` — одна услуга, `package` — пакет услуг |

#### `ReportAutoloadV2`
- type: `object`, required: `report_id`, `started_at`, `finished_at`, `status`, `section_stats`, `feed_url`, `source`, `events`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `events` | array<object> | no | Ошибки и предупреждения, которые относятся ко всей выгрузке |
| `feed_url` | string | yes | Ссылка на копию файла с объявлениями в момент начала загрузки |
| `finished_at` | string, date-time | yes | Дата и время закрытия отчёта (окончания выгрузки) |
| `listing_fees` | object (см. ниже) | no | Статистика по списаниям за размещения |
| `report_id` | integer | yes | Идентификатор отчёта (ID) |
| `section_stats` | object (см. ниже) | yes | Разделы отчёта с количеством объявлений в каждом |
| `source` | string, enum: `email`,`url`,`web`,`openapi` | yes | Источник загрузки: `email` — по почте, `url` — по ссылке, `web` — вручную, `openapi` — через OpenAPI |
| `started_at` | string, date-time | yes | Дата и время создания отчёта (начала выгрузки) |
| `status` | string, enum: `processing`,`success`,`success_warning`,`error` | yes | Статус отчёта |

`events[]` элемент (required: `code`, `type`, `description`):

| Field | Type | Description |
|-------|------|-------------|
| `code` | integer | Код события |
| `description` | string | Описание события |
| `type` | string | Тип события |

`listing_fees` (required: `single`, `packages`):

| Field | Type | Description |
|-------|------|-------------|
| `packages` | array<object `{ count: integer, package_id: integer }`> | Статистика по списаниям из пакетов |
| `single` | object `{ count: integer (Количество объявлений, оплаченных из кошелька), total_amount: integer (Общая сумма) }` | Статистика по списаниям из кошелька |

`section_stats` (required: `slug`, `title`, `count`):

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer | Количество объявлений в разделе |
| `slug` | string | ID раздела |
| `title` | string | Название раздела |
| `sections` | array<object> | Разделы второго уровня (вложенная структура с теми же полями плюс `sections` третьего уровня) |

Вложенные `sections` второго и третьего уровня имеют поля `slug`, `count`, `title` (required) и, для второго уровня, вложенный массив `sections` третьего уровня с полями `slug`, `count`, `title`.

#### `ReportAutoloadV3`
- type: `object`, required: `report_id`, `started_at`, `finished_at`, `status`, `section_stats`, `feed_url`, `source`, `events`  (Примечание: в required указан `feed_url`, однако в properties присутствует `feeds_urls`.)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `events` | array<object `{ code: integer (required), description: string (required), type: string (required) }`> | no | Ошибки и предупреждения, которые относятся ко всей выгрузке |
| `feeds_urls` | array<object `{ name: string (Название фида), url: string (Ссылка на копию файла с объявлениями) }`> | no | — |
| `finished_at` | string, date-time | yes | Дата и время закрытия отчёта |
| `listing_fees` | object (структура как в V2) | no | Статистика по списаниям |
| `report_id` | integer | yes | Идентификатор отчёта (ID) |
| `section_stats` | object (структура как в V2: `slug`/`title`/`count` + вложенные `sections` до 3 уровня) | yes | Разделы отчёта |
| `source` | string, enum: `email`,`url`,`web`,`openapi` | yes | Источник загрузки |
| `started_at` | string, date-time | yes | Дата и время создания отчёта |
| `status` | string, enum: `processing`,`success`,`success_warning`,`error` | yes | Статус отчёта |

#### `ReportCollectionAutoload`
- type: `array<object>`, description: «Список отчётов»

Element (required: `id`, `started_at`, `finished_at`, `status`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `export_success` | boolean | no | Успешно ли прошла выгрузка объявления на сайте |
| `finished_at` | string, date-time | yes | Время окончания выгрузки объявлений на сайт |
| `id` | integer | yes | ID отчёта |
| `import_success` | boolean | no | Успешно ли прошёл импорт файла |
| `report_status` | string | no | Сокращённый статус обработки отчёта |
| `started_at` | string, date-time | yes | Время создания отчёта |
| `stat` | object (см. ниже) | no | Суммарная статистика по объявлениям в данном отчёте |
| `status` | string | yes | Статус обработки отчёта на русском языке |

`stat`:

| Field | Type | Description |
|-------|------|-------------|
| `duplicate` | integer | Сколько с одинаковым описанием |
| `error` | integer | Сколько не опубликовано из-за ошибок |
| `error_fee` | integer | Сколько не опубликовано из-за отсутствия средств |
| `fees` | integer | Сколько платных |
| `problem` | integer | Сколько с незначительными проблемами |
| `problem_obsolete` | integer | Сколько в устаревшем формате или с устаревшими элементами |
| `publish_later` | integer | Сколько будут опубликованы позже |
| `published` | integer | Сколько опубликовано на сайте |
| `stopped` | integer | Сколько остановлено |
| `success` | integer | Сколько успешно опубликовано на сайте |
| `total` | integer | Всего объявлений в пакете |
| `unknown` | integer | Неизвестный статус обработки |
| `vas` | integer | К скольким объявлениям применены VAS-услуги |

#### `ReportShortAutoloadV2`
- type: `array<object>`, description: «Список отчётов (новый)»

Element (required: `id`, `started_at`, `finished_at`, `status`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `finished_at` | string, date-time | yes | Дата и время закрытия отчёта |
| `id` | integer | yes | Идентификатор отчёта (ID) |
| `started_at` | string, date-time | yes | Дата и время создания отчёта |
| `status` | string, enum: `processing`,`success`,`success_warning`,`error` | yes | Статус отчёта |

#### `UpsertProfileIn`
- type: `object`, required: `upload_url`, `schedule`, `autoload_enabled`, `report_email`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agreement` | boolean, nullable | no | Согласие с правилами использования Авито Автозагрузки. Обязательно, если профиль ещё не существует |
| `autoload_enabled` | boolean | yes | Статус автозагрузки (вкл/выкл) |
| `report_email` | string | yes | Почта, на которую будут приходить отчёты о выгрузках |
| `schedule` | `ExportSchedule` | yes | — |
| `upload_url` | string | yes | URL-адрес фида, для которого настроены регулярные выгрузки. Должен начинаться с http или https |

#### `UpsertProfileInV2`
- type: `object`, required: `feeds_data`, `schedule`, `autoload_enabled`, `report_email`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agreement` | boolean, nullable | no | Согласие с правилами использования Авито Автозагрузки. Обязательно, если профиль ещё не существует |
| `autoload_enabled` | boolean | yes | Статус автозагрузки (вкл/выкл) |
| `feeds_data` | `FeedsData` | yes | — |
| `report_email` | string | yes | Почта, на которую будут приходить отчёты о выгрузках |
| `schedule` | `ExportSchedule` | yes | — |
