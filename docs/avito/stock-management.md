# Управление остатками (ru) — stock-management

**Version:** 1.0.0
**OpenAPI:** 3.0.0

Методы для работы с остатками в объявлении.

**Авито API для бизнеса предоставляется согласно [Условиям использования](https://www.avito.ru/legal/pro_tools/public-api).**

## Base URL

| URL |
|-----|
| `https://api.avito.ru/` |

## Security

### AuthorizationCode (oauth2)

Это API использует OAuth 2 с механизмом `authorization_code`. Используйте его для доступа к данным других пользователей при разработке стороннего приложения. [Подробнее](#tag/ApplicationAccess)

- **Flow:** `authorizationCode`
- **Authorization URL:** `https://avito.ru/oauth`
- **Token URL:** `https://api.avito.ru/token`
- **Scopes:** `null`

### ClientCredentials (oauth2)

Это API использует OAuth 2 с механизмом `client_credentials`. Используйте его для доступа к возможностям своей личной учетной записи. [Подробнее](#tag/Access)

- **Flow:** `clientCredentials`
- **Token URL:** `https://api.avito.ru/token`
- **Scopes:** `{}`

## Endpoints

### POST /stock-management/1/info

**Summary:** Получение остатков

**Description:**

Максимальное количество элементов в одном запросе - 10

Максимальное количество запросов в минуту - 100

Возвращает в ответ массив объектов со следующей структурой:
- `itemId` - идентификатор объявления
- `isUnlimited` - признак неограниченности остатков
- `isMultiple` - флаг с подачи или редактирования "Несколько штук в наличии"
- `quantity` - доступное количество товара (количество с подачи или редактирования минус бронь)
- `isOutOfStock` - признак того, что у объявления закончилось доступное кол-во товара

**Rate limit (x-rate-limiter):** default = 100 (в минуту)

**x-gateway.exportTo:** `open-api-gateway`

**Security:** `ClientCredentials: []`

#### Parameters

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| Authorization | header | string (example: `Bearer ACCESS_TOKEN`) | true | Токен для авторизации (`$ref: #/components/parameters/authHeader`) |

#### Request Body (required)

Content-Type: `application/json`

Schema (inline, `type: object`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| item_ids | array of integer (minItems: 1, maxItems: 500) | true | Массив идентификаторов объявлений |
| strong_consistency | boolean | false | Пропустить поход в кеш, отдать данные из базы |

#### Responses

| Status | Description | Schema |
|--------|-------------|--------|
| 200 | Success | `#/components/schemas/stocksInfoResult` (application/json) |
| 400 | Bad request | `#/components/responses/badRequest` → `errorMessage` |
| 401 | Unauthorized | `#/components/responses/unauthorized` → `unauthError` |
| 429 | Too Many Requests | `#/components/responses/tooManyRequests` → `errorMessage` |
| 500 | Internal Error | `#/components/responses/internalError` → `errorMessage` |

---

### PUT /stock-management/1/stocks

**Summary:** Редактирование остатков

**Description:**

Максимальное количество элементов в одном запросе - 200

Максимальное количество запросов в минуту - 100

Возвращает в ответ массив объектов со следующей структурой:
- `errors` – массив, который содержит информацию о ошибках, возникших при обновлении остатков.
- `item_id` – идентификатор объявления, для которого мы обновляем остатки.
- `external_id` – идентификатор объявления во внешней системе, для которого мы обновляем остатки.
- `success` – флаг, успешно ли прошло обновление остатка для объявления.

**Rate limit (x-rate-limiter):** default = 100 (в минуту)

**Security:** `ClientCredentials: []`

#### Parameters

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| Authorization | header | string (example: `Bearer ACCESS_TOKEN`) | true | Токен для авторизации (`$ref: #/components/parameters/authHeader`) |

#### Request Body (required)

Content-Type: `application/json`

Schema (inline, `type: object`, required: `stocks`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| stocks | array (minItems: 1, maxItems: 200) of object | true | Остатки в объявлении |

Items of `stocks` (required: `item_id`, `quantity`):

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| external_id | string | false | Идентификатор объявления во внешней системе | `AB123456` |
| item_id | integer (int64) | true | Идентификатор объявления на сайте | `123321` |
| quantity | integer (int64, min: 0, max: 999999) | true | Количество товара | `500` |

#### Responses

| Status | Description | Schema |
|--------|-------------|--------|
| 200 | Success | `#/components/schemas/stockEditResult` (application/json) |
| 400 | Bad request | `#/components/responses/badRequest` → `errorMessage` |
| 401 | Unauthorized | `#/components/responses/unauthorized` → `unauthError` |
| 429 | Too Many Requests | `#/components/responses/tooManyRequests` → `errorMessage` |
| 500 | Internal Error | `#/components/responses/internalError` → `errorMessage` |

## Reusable Components

### Parameters

#### authHeader

| Property | Value |
|----------|-------|
| name | Authorization |
| in | header |
| required | true |
| description | Токен для авторизации |
| schema.type | string |
| schema.example | `Bearer ACCESS_TOKEN` |

### Responses

| Name | Description | Content-Type | Schema |
|------|-------------|--------------|--------|
| badRequest | Bad request | application/json | `#/components/schemas/errorMessage` |
| forbidden | Forbidden | application/json | `#/components/schemas/errorMessage` |
| internalError | Internal Error | application/json | `#/components/schemas/errorMessage` |
| notFound | Not found | application/json | `#/components/schemas/errorMessage` |
| timeout | Timeout | application/json | `#/components/schemas/errorMessage` |
| tooManyRequests | Too Many Requests | application/json | `#/components/schemas/errorMessage` |
| unauthorized | Unauthorized | application/json | `#/components/schemas/unauthError` |

## Schemas

### errorMessage

- `type`: object
- `additionalProperties`: false
- `required`: `message`

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| message | string | true | Текст ошибки | `Что-то пошло не так` |

### unauthError

- `type`: object
- `additionalProperties`: false
- `required`: `message`

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| message | string | true | Сообщение о том, что пользователь не авторизован. Если текст ошибки "Unsupported flow for endpoint", значит в авторизационном заголовке "X-Oauth-Flow" не передан "authorization_code" | `Unsupported flow for endpoint` |

### stocksInfoResult

- `type`: object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| stocks | array of object | false | Информация по остаткам |

Items of `stocks` (required: `item_id`, `is_unlimited`, `is_multiple`, `quantity`, `is_out_of_stock`):

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| is_multiple | boolean | true | Флаг с подачи или редактирования "Несколько штук в наличии" | `true` |
| is_out_of_stock | boolean | true | Признак того, что у объявления закончилось доступное кол-во товара | `false` |
| is_unlimited | boolean | true | Признак неограниченности стоков | `true` |
| item_id | integer (int64) | true | Идентификатор объявления на сайте | `123321` |
| quantity | integer (int64) | true | Доступное количество товара (количество с подачи или редактирования минус бронь) | `100` |

### stockEditResult

- `type`: object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| stocks | array of object | false | Остатки в объявлении |

Items of `stocks` (required: `item_id`, `success`):

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| errors | array of string | false | Ошибки при обновлении остатка | `[]` |
| external_id | string, nullable | false | Идентификатор объявления во внешней системе | `AB123456` |
| item_id | integer (int64) | true | Идентификатор объявления на сайте | `123321` |
| success | boolean | true | Успешно ли прошло обновление остатков | `true` |
