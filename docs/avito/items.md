# Объявления (items)

**OpenAPI spec**: `info.title` = "Объявления", `version` = "1"

**Описание:** API для получения статистики по объявлениям, применения дополнительных услуг, а также просмотр статусов объявлений.

Авито API для бизнеса предоставляется согласно [Условиям использования](https://www.avito.ru/legal/pro_tools/public-api).

Контакт: supportautoload@avito.ru

## Servers

| URL |
|-----|
| `https://api.avito.ru/` |

## Tags

| Name | x-displayName | Description |
|------|---------------|-------------|
| `Item` | Объявления | Общие методы API для работы с объявлениями на Авито. Описание API в формате Swagger 3.0. |

## Security Schemes

### AuthorizationCode (OAuth2 authorization_code)
- `authorizationUrl`: `https://avito.ru/oauth`
- `tokenUrl`: `https://api.avito.ru/token`
- Описание: Используется для доступа к данным других пользователей при разработке стороннего приложения.
- Scopes:
  - `autoload:reports` — Получение отчетов Автозагрузки
  - `items:apply_vas` — Применение дополнительных услуг
  - `items:info` — Получение информации об объявлениях
  - `job:applications` — Получение информации об откликах на вакансии
  - `job:cv` — Получение информации резюме
  - `job:write` — Изменение объявлений вертикали Работа
  - `messenger:read` — Чтение сообщений в мессенджере Авито
  - `messenger:write` — Модифицирование сообщений в мессенджере Авито
  - `short_term_rent:read` — Получение информации об объявлениях краткосрочной аренды
  - `short_term_rent:write` — Изменение объявлений краткосрочной аренды
  - `stats:read` — Получение статистики объявлений
  - `user:read` — Получение информации о пользователе
  - `user_balance:read` — Получение баланса пользователя
  - `user_operations:read` — Получение истории операций пользователя

### ClientCredentials (OAuth2 client_credentials)
- `tokenUrl`: `https://api.avito.ru/token`
- Описание: Используется для доступа к возможностям своей личной учётной записи.
- Scopes: (пусто)

## Reusable Headers

| Name | Type | Description |
|------|------|-------------|
| `X-RateLimit-Limit` | integer(int32) | Количество запросов в минуту |
| `X-RateLimit-Remaining` | integer(int32) | Доступное количество запросов в текущем временном окне |

## Reusable Parameters

| Ref | Name | In | Required | Type | Description |
|-----|------|----|---------|------|-------------|
| `applicationJsonHeader` | `Content-Type` | header | true | string (enum: `application/json`) | Тип данных запроса |
| `authHeader` | `Authorization` | header | true | string (example: `Bearer ACCESS_TOKEN`) | Токен для авторизации |
| `chatId` | `chat_id` | path | true | string | Идентификатор чата (клиента) |
| `itemIds` | `item_ids` | query | — | string (example: `12345,6789`) | — |
| `limit` | `limit` | query | — | integer(int32), default 100 | Количество сообщений на странице (положительное число больше 0 и меньше 100) |
| `messageId` | `message_id` | path | true | string | Идентификатор сообщения |
| `offset` | `offset` | query | — | integer(int32), default 0 | — |
| `page` | `page` | query | — | integer(int32) | Номер страницы |
| `pathItemId` | `item_id` | path | true | integer(int64) | Идентификатор объявления на сайте |
| `pathUserId` | `user_id` | path | true | integer(int64) | Номер пользователя в Личном кабинете Авито |
| `pathVacancyId` | `vacancy_id` | path | true | integer(int64) | Идентификатор вакансии на сайте |
| `perPage` | `per_page` | query | — | integer(int32) | Количество ресурсов на страницу |
| `unreadOnly` | `unread_only` | query | — | boolean | — |
| `userId` | `user_id` | path | true | integer(int64) | Идентификатор пользователя (клиента) |

---

# Endpoints

All endpoints are tagged `Item`. Security is declared per-operation; all listed operations accept either `AuthorizationCode` (with listed scopes) or `ClientCredentials`.

## POST `/core/v1/accounts/{userId}/vas/prices`

- **operationId**: `vasPrices`
- **summary**: Получение информации о стоимости услуг продвижения и доступных значках
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:info` OR `ClientCredentials`

**Description:**
Возвращает в ответ список объектов со следующей структурой:
- `itemId` – идентификатор объявления
- `vas` – список объектов, которые содержат информацию о стоимости дополнительных услуг и пакетов дополнительных услуг для каждого объявления. Структура объекта:
  - `slug` – идентификатор услуги или пакета услуг:
    - `highlight` — услуга продвижения "Выделить"
    - `xl` – услуга продвижения "XL-объявление"
    - `stickerpack_x1` — 1 значок на XL-объявлении
    - `stickerpack_x2` — 2 значка на XL-объявлении
    - `stickerpack_x3` — 3 значка на XL-объявлении
    - `x2_1` / `x2_7` — пакет "до 2 раз больше просмотров на 1/7 дней"
    - `x5_1` / `x5_7` — пакет "до 5 раз больше просмотров на 1/7 дней"
    - `x10_1` / `x10_7` — пакет "до 10 раз больше просмотров на 1/7 дней"
    - `x15_1` / `x15_7` — пакет "до 15 раз больше просмотров на 1/7 дней"
    - `x20_1` / `x20_7` — пакет "до 20 раз больше просмотров на 1/7 дней"
  - `price` – цена в рублях с учётом скидки
  - `priceOld` – цена в рублях до применения скидки
- `stickers` – список объектов значков:
  - `id` – идентификатор значка
  - `title` – название значка
  - `description` – описание значка

**Parameters:** `pathUserId` (ref), `authHeader` (ref)

**Request body** (`application/json`): schema `pricesItemIdsRequestBody`. Описание: "Набор идентификаторов объявлений на сайте". Пример: `{"itemIds":[1234567,7654321]}`.

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | oneOf [`VasPricesResp`, `badRequestError`, `authError`] | Успешный ответ |
| default | application/json | `validatingError` | Информация об ошибке |

---

## POST `/core/v1/accounts/{user_id}/calls/stats/`

- **operationId**: `postCallsStats`
- **summary**: Получение статистики по звонкам
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:info` OR `ClientCredentials`

**Description:** Получение агрегированной статистики звонков, полученных пользователем.

**Parameters:** `pathUserId` (ref), `authHeader` (ref), `applicationJsonHeader` (ref)

**Request body** (`application/json`, required): schema `CallsStatsRequest`. Пример: `{"dateFrom":"2020-04-01","dateTo":"2020-04-08","itemIds":[1853257996]}`.

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `CallsStatsResponse` | Успешный ответ |
| 400 | application/json | `badRequestError` | Неверный запрос |
| 401 | application/json | `authError` | Требуется аутентификация |
| 404 | application/json | `notFoundError` | Неверный user_id в запросе |
| 500 | application/json | `serviceError` | Внутренняя ошибка метода API |
| 503 | application/json | `serviceUnavailableError` | Метод API временно недоступен |

---

## GET `/core/v1/accounts/{user_id}/items/{item_id}/`

- **operationId**: `getItemInfo`
- **summary**: Получение информации по объявлению
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:info` OR `ClientCredentials`

**Description:** Возвращает данные об объявлении — его статус, список применённых услуг. Максимальное количество запросов в минуту — 500. Для получения статистики объявления должен использоваться метод «получение статистики по списку объявлений» (`itemStatsShallow`).

**Parameters:** `pathUserId` (ref), `pathItemId` (ref), `authHeader` (ref)

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `ItemInfoAvito` | Успешный ответ |
| 429 | application/json | `tooManyRequests` | Превышено допустимое количество запросов |
| default | application/json | `FieldError` | Информация об ошибке |

---

## PUT `/core/v1/accounts/{user_id}/items/{item_id}/vas`

- **operationId**: `putItemVas`
- **summary**: Применение дополнительных услуг
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:apply_vas` OR `ClientCredentials`

**Description:** Метод объявлен устаревшим и больше не поддерживается — используйте `/core/v2/items/{itemId}/vas/`. Применение дополнительной услуги к объявлению; в ответе данные о применённой услуге и сумма списания. Получение ошибки не означает, что услуга точно не была куплена — подождите несколько минут и проверьте.

**Parameters:** `pathUserId` (ref), `pathItemId` (ref), `authHeader` (ref)

**Request body** (`application/json`): schema `vasIdRequestBody`. Пример: `{"vas_id":"highlight"}`.

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `VasApplyAvito` | Успешный ответ |
| default | application/json | `validatingError` | Информация об ошибке |

---

## GET `/core/v1/items`

- **operationId**: `getItemsInfo`
- **summary**: Получение информации по объявлениям
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:info` OR `ClientCredentials`

**Description:** Возвращает список объявлений авторизованного пользователя — статус, категорию и ссылку на сайте. Внимание: в настоящий момент этот метод не работает с объявлениями сотрудников. Он позволяет получить объявления только для пользователя, указанного владельцем. В случае сотрудника это будет главный аккаунт компании; для авторизованного сотрудника вернётся пустой список. Максимальное количество запросов в минуту — 25.

**Parameters:**

| Name | In | Required | Type | Default | Example | Description |
|------|----|---------|------|---------|---------|-------------|
| `authHeader` (ref) | header | true | string | — | `Bearer ACCESS_TOKEN` | Токен |
| `per_page` | query | — | integer(int32) | 25 | 50 | Количество записей на странице (целое число больше 0 и меньше 100) |
| `page` | query | — | integer(int32) | 1 | 1 | Номер страницы (целое число больше 0) |
| `status` | query | — | string (enum: `active`, `removed`, `old`, `blocked`, `rejected`) | `active` | `active,old` | Статус объявления на сайте (можно указать несколько значений через запятую) |
| `updatedAtFrom` | query | — | string | — | `2023-12-18` | Фильтр больше либо равно по дате обновления/редактирования объявления в формате YYYY-MM-DD |
| `category` | query | — | integer(int32) | — | 111 | Идентификатор категории объявления (см. справочник https://www.avito.st/s/openapi/catalog-categories.xml) |

**Responses:**

| Status | Content-Type | Schema | Headers | Description |
|--------|--------------|--------|---------|-------------|
| 200 | application/json | `ItemsInfoWithCategoryAvito` | — | Успешный ответ |
| 429 | — | — | `X-RateLimit-Limit`, `X-RateLimit-Remaining` | Превышено допустимое количество запросов |
| default | application/json | `FieldError` | — | Информация об ошибке |

---

## POST `/core/v1/items/{item_id}/update_price`

- **operationId**: `updatePrice`
- **summary**: Обновление цены объявления
- **tags**: — (тег не указан)
- **security**: `AuthorizationCode` (scopes: нет) OR `ClientCredentials`

**Description:** Обновляет цену товара по id. Максимальное количество запросов в минуту — 150. Доступно для категорий: Товары, Запчасти, Авто, Недвижимость (кроме краткосрочной).

**Parameters:** `pathItemId` (ref)

**Request body** (`application/json`): schema `UpdatePriceRequest`. Описание: "Набор параметров в теле запроса."

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `UpdatePriceResponse` | Успешный ответ |
| 400 | application/json | `badRequestError` | Неверный запрос |
| 401 | application/json | `authError` | Требуется аутентификация |
| 404 | application/json | `notFoundError` | Неверный user_id в запросе |
| 429 | application/json | `tooManyRequests` | Превышено количество запросов |

---

## PUT `/core/v2/accounts/{user_id}/items/{item_id}/vas_packages`

- **operationId**: `putItemVasPackageV2`
- **summary**: Применение пакета дополнительных услуг
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:apply_vas` OR `ClientCredentials`

**Description:** Метод объявлен устаревшим и больше не поддерживается — используйте `/core/v2/items/{itemId}/vas/`. Применение пакета дополнительных услуг к объявлению; в ответе сумма списания. Получение ошибки не означает, что пакет точно не был куплен.

**Parameters:** `pathUserId` (ref), `pathItemId` (ref), `authHeader` (ref)

**Request body** (`application/json`): schema `packageIdRequestBodyV2`. Пример: `{"package_id":"x10_7"}`.

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `VasAmountAvito` | Успешный ответ |
| default | application/json | `validatingError` | Информация об ошибке |

---

## PUT `/core/v2/items/{itemId}/vas/`

- **operationId**: `applyVas`
- **summary**: Применение услуг продвижения
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `items:apply_vas` OR `ClientCredentials`

**Description:** С помощью этого метода вы можете применить к опубликованному объявлению одну или несколько услуг продвижения (например, «XL-объявление», «Выделение цветом» и «До 10 раз больше просмотров на 7 дней»). В рамках одного запроса услуга может быть применена только один раз.

Если для вашего объявления доступны значки («Без ДТП», «Срочно», «1 владелец»), при подключении услуги «XL-объявление» можно передать список (не более трёх значков). В этом случае добавьте соответствующую услугу на 1, 2 или 3 значка.

Чтобы получить список доступных услуг и значков, используйте метод `/core/v1/accounts/{userId}/vas/prices`.

Если заказ сформирован успешно — в ответе уникальные идентификаторы операций покупки для каждой услуги.

В случае некорректного запроса — код 400 и структура с полем `code`. Возможные коды ошибок:
- **1001** – один или несколько заголовков неправильно передаются;
- **1002** – ошибка в URL;
- **1003** – неверный идентификатор объявления из запроса;
- **1004** – JSON из тела запроса не соответствует схеме или список идентификаторов услуг пустой;
- **1005** – объявление, к которому вы хотите применить услуги, неактивно;
- **1006** – неправильное количество выбранных значков для объявления. Убедитесь, что в списке идентификаторов услуг есть услуга для покупки значков и она совпадает с количеством выбранных значков:
  - `stickerpack_x1` — 1 значок
  - `stickerpack_x2` — 2 значка
  - `stickerpack_x3` — 3 значка
- **1007** – некоторые из выбранных услуг не могут быть применены;
- **1008** – в объявлении появились обязательные поля, которые нужно заполнить;
- **1009** – в кошельке не хватает средств для покупки услуг;
- **1010** – вы пытались купить больше одной услуги увеличения просмотров;
- **1011** – вы пытались купить значки, недоступные для выбранного объявления.

В случае внутренней ошибки на стороне Авито — код 500 и структура с полем `code`:
- **1000** – ошибка на стороне Авито.

Важно: если ответ пришёл без кода ошибки или его значения нет в списке — возможно, услуга всё-таки была куплена. Подождите несколько минут.

**Parameters:** `pathItemId` (ref), `authHeader` (ref)

**Request body** (`application/json`): inline schema

```
type: object
required: [slugs]
properties:
  slugs:
    type: array
    items: { type: string }
    description: Список идентификаторов услуг
    example: ["x10_1", "xl", "stickerpack_x2"]
  stickers:
    type: array
    items: { type: integer }
    description: Список значков
    example: [1, 2]
```

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | object with `additionalProperties: ApplyVasResp` (пример: `{"x10_1":{"operationId":123456789}, "xl":{"operationId":123456790}, "stickerpack_x2":{"operationId":123456791}}`) | Успешный ответ |
| 500 | application/json | object `{ code: integer (enum: 1000..1011) }`, required `code` | Ответ с ошибкой |

---

## POST `/stats/v1/accounts/{user_id}/items`

- **operationId**: `itemStatsShallow`
- **summary**: Получение статистики по списку объявлений
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `stats:read` OR `ClientCredentials`

**Description:** Получение счётчиков по переданному списку объявлений пользователя.

Внимание: в запросе может быть передано не более 200 идентификаторов объявлений. Глубина запроса — 270 дней.

### Счётчики
- ~~`views`~~ — DEPRECATED (будет удалено в апреле 2021 г.). Используйте `uniqViews`.
- `uniqViews` — число уникальных пользователей, просмотревших объявление.
- ~~`contacts`~~ — DEPRECATED. Используйте `uniqContacts`.
- `uniqContacts` — число уникальных пользователей, совершивших контакты.
- ~~`favorites`~~ — DEPRECATED. Используйте `uniqFavorites`.
- `uniqFavorites` — число уникальных пользователей, добавивших объявление в избранное.

### Группировка счётчиков
- дни
- недели — в поле `date` первый день недели
- месяцы — в поле `date` первый день месяца

Период группировки передаётся в `periodGrouping`: `day` (по умолчанию), `week`, `month`.

Примечания:
- Под контактом понимаются: запросы телефона продавца, начатый чат, отклик на резюме и пр.
- Группировка уникальных пользователей происходит только в рамках одного дня.

**Parameters:** `userId` (ref), `authHeader` (ref), `applicationJsonHeader` (ref)

**Request body** (`application/json`): schema `StatisticsShallowRequestBody`. Описание: "Набор параметров в теле запроса."

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `StatisticsResponse` | Успешный ответ |
| 400 | application/json | `badRequestError` | Неверный запрос |
| 401 | application/json | `authError` | Требуется аутентификация |
| 404 | application/json | `notFoundError` | Неверный user_id в запросе |
| 500 | application/json | `serviceError` | Внутренняя ошибка метода API |
| 503 | application/json | `serviceUnavailableError` | Метод API временно недоступен |

---

## POST `/stats/v2/accounts/{user_id}/items`

- **operationId**: `itemAnalytics`
- **summary**: Получение статистических показателей по профилю
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `stats:read` OR `ClientCredentials`
- **x-rate-limiter**: `{ default: 1 }`

**Description:** Получение статистических показателей по профилю.

### Группировки показателей
- **totals** — по общему значению показателя за период, без детализации
- **item** — по объявлениям
- **day** — по дням
- **week** — по неделям
- **month** — по месяцам

### Доступные показатели по объявлениям

#### Основные
- **views** — Просмотры. Несколько показов за сутки одному пользователю считаются как один.
- **contacts** — Контакты.
  - **contactsShowPhone** — Посмотрели телефон.
  - **contactsMessenger** — Написали в чат.
  - **contactsShowPhoneAndMessenger** — Посмотрели телефон и написали в чат.
  - **contactsSbcDiscount** — Откликнулись на скидку в чате.
- **viewsToContactsConversion** — Конверсия из просмотров в контакты.
- **favorites** — Добавили в избранное.
- **averageViewCost** — Средняя цена просмотра.
- **averageContactCost** — Средняя цена контакта.
- **impressions** — Показы.
- **impressionsToViewsConversion** — Конверсия из показов в просмотры.

#### Целевые действия
- **clickPackages** — Целевые просмотры.
- **jobContacts** — Отклики на вакансии.

#### Заказы с Авито Доставкой
- **viewsToOrderedItemsConversion** — Конверсия из просмотров в заказанные товары.
- **orderedItems** — Заказано товаров.
- **orderedItemsPrice** — Стоимость заказанных товаров в копейках.
- **deliveredItems** — Доставлено товаров.
- **deliveredItemsPrice** — Стоимость доставленных товаров в копейках.

#### Посуточная аренда
- **bookingPlacedCount** — Получено заявок.
- **bookingPlacedPrice** — Стоимость полученных заявок в копейках.
- **bookingApprovedCount** — Подтверждено заявок.
- **bookingApprovedPrice** — Стоимость подтверждённых заявок в копейках.
- **bookingAcceptedCount** — Заявки с заселением.
- **bookingAcceptedPrice** — Стоимость заявок с заселением в копейках.

#### Расходы
- **allSpending** — Все расходы в копейках.
  - **spending** — Расходы на объявления в копейках.
    - **presenceSpending** — Расходы на размещение и целевые действия в копейках.
    - **promoSpending** — Расходы на продвижение в копейках.
    - **restSpending** — Остальные расходы в копейках.
    - **commission** — Комиссия в копейках.
  - **spendingBonus** — Списано бонусов на объявления.

#### Количество объявлений за период
- **activeItems** — Активные объявления.
  - **newActiveItems** — Новые и опубликованные заново объявления.
  - **oldActiveItems** — Активны с прошлого периода.

### Примечания
- Из ручки возвращается не более чем по 1000 сущностей. Используйте `limit` и `offset` для регулировки диапазона.
- Глубина данных — 270 дней.
- В случае недоступности метрики для пользователя она не приходит в ответе.
- Не более одного запроса в минуту.

**Parameters:** `userId` (ref), `authHeader` (ref), `applicationJsonHeader` (ref)

**Request body** (`application/json`, required): schema `AnalyticsRequest`.

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `AnalyticsResponse` | Successful response |
| 400 | application/json | `ErrorResponse` | Неверный запрос |
| 401 | application/json | `ErrorResponse` | Требуется аутентификация |
| 403 | application/json | `ErrorResponse` | Доступ запрещён |
| 429 | application/json | `ErrorResponse` | Слишком много запросов |
| 500 | application/json | `ErrorResponse` | Error response |

---

## POST `/stats/v2/accounts/{user_id}/spendings`

- **operationId**: `accountSpendings`
- **summary**: Получение статистики расходов профиля
- **tags**: `Item`
- **security**: `AuthorizationCode` scopes: `stats:read` OR `ClientCredentials`
- **x-rate-limiter**: `{ default: 1 }`

**Description:** Получение статистики расходов профиля.

Глубина данных — 270 дней. Не более одного запроса в минуту.

### Группировки расходов
- **day** — по дням
- **week** — по неделям
- **month** — по месяцам

### Доступные типы расходов
- **all** — Все расходы в копейках.
  - **promotion** — Расходы на продвижение в копейках.
  - **presence** — Расходы на размещение и целевые действия в копейках.
  - **commission** — Комиссия в копейках.
  - **rest** — Остальные расходы в копейках.

**Parameters:** `userId` (ref), `authHeader` (ref), `applicationJsonHeader` (ref)

**Request body** (`application/json`, required): schema `SpendingsRequest`.

**Responses:**

| Status | Content-Type | Schema | Description |
|--------|--------------|--------|-------------|
| 200 | application/json | `SpendingsResponse` | Successful response |
| 400 | application/json | `ErrorResponse` | Неверный запрос |
| 401 | application/json | `ErrorResponse` | Требуется аутентификация |
| 403 | application/json | `ErrorResponse` | Доступ запрещён |
| 429 | application/json | `ErrorResponse` | Слишком много запросов |
| 500 | application/json | `ErrorResponse` | Error response |

---

# Component Schemas

## `AnalyticsRequest`
type: object; required: `dateFrom`, `dateTo`, `metrics`, `grouping`, `limit`, `offset`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dateFrom` | string(date) | yes | Дата (YYYY-MM-DD), с которой (включительно) получить статистику. example `2020-09-01` |
| `dateTo` | string(date) | yes | Дата (YYYY-MM-DD), по которую (включительно). example `2021-10-15` |
| `filter` | object, nullable | no | Набор ограничений. Поля: `categoryIDs: integer[]` (example [11,12]), `employeeIDs: integer[]` (example [41042142, 41042143]) — оба nullable |
| `grouping` | `Groupings` (ref) | yes | — |
| `limit` | integer, nullable, min 0, max 1000 | yes | Пагинация — ограничение количества сущностей в response. example 1000 |
| `metrics` | string[] | yes | Набор доступных показателей, которые должны присутствовать в ответе. example `["views","contacts","presenceSpending"]` |
| `offset` | integer, nullable, min 0 | yes | Инструмент пагинации — смещение. example 0 |
| `sort` | object, nullable | no | Сортировка: `key: string` (показатель), `order: string (enum asc, desc)`; оба required |

## `AnalyticsResponse`
type: object

- `result` (object):
  - `dataTotalCount` integer, example 1
  - `groupings` array of object:
    - `id` integer
    - `metrics` array of object: `slug` string (example `views`), `value` number(float); оба required
    - `type` `Groupings` (ref)
  - `timestamp` string, example `"2021-11-25 15:19:21"`

## `ApplyVasResp`
type: object; required: `operationId`.

| Field | Type | Description |
|-------|------|-------------|
| `operationId` | integer | Уникальный идентификатор операции покупки |

## `CallsStatsDay`
type: object.

| Field | Type | Description |
|-------|------|-------------|
| `answered` | integer | Отвеченные звонки |
| `calls` | integer | Звонки всего |
| `date` | string | Дата (YYYY-MM-DD) |
| `new` | integer | Новые звонки |
| `newAnswered` | integer | Новые и одновременно отвеченные звонки |

## `CallsStatsItem`
type: object; required: `employeeId`, `itemId`.

| Field | Type | Description |
|-------|------|-------------|
| `days` | array of `CallsStatsDay` | Массив статистики звонков объявления в разрезе дней |
| `employeeId` | integer | Идентификатор сотрудника в сервисе иерархии аккаунтов (0 означает, что звонок не аттрибуцирован до сотрудника) |
| `itemId` | integer | Идентификатор объявления (0 означает, что звонок не аттрибуцирован до объявления) |

## `CallsStatsRequest`
type: object; required: `dateFrom`, `dateTo`.

| Field | Type | Description |
|-------|------|-------------|
| `dateFrom` | string | Начальная дата периода (YYYY-MM-DD) |
| `dateTo` | string | Конечная дата периода (YYYY-MM-DD) |
| `itemIds` | integer[] | Идентификаторы объявлений |

## `CallsStatsResponse`
type: object

- `result` object:
  - `items` array of `CallsStatsItem` — required — массив статистики по объявлениям

## `ErrorItemsVas`
type: array of integer. description: "Список идентификаторов, которые не удалось обработать по разным причинам (например, они не принадлежат текущему пользователю)".

## `ErrorResponse`
type: object

- `error` object:
  - `code` integer(int32), example 123 — required
  - `message` string, example `"message about error occurred"` — required

## `FieldError`
type: object; required: `code`, `message`.

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Код ошибки |
| `message` | string | Описание ошибки |

## `Groupings`
type: string; enum: `day`, `week`, `month`, `item`, `totals`.

## `InfoVas`
type: object.

| Field | Type | Description |
|-------|------|-------------|
| `finish_time` | string(date-time), nullable | Дата завершения услуги |
| `schedule` | array of string(date-time), nullable | Информация о следующих применениях услуги |
| `vas_id` | string, enum `vip`, `highlight`, `pushup`, `premium`, `xl` | Идентификатор услуги |

## `ItemInfoAvito`
type: object.

| Field | Type | Description |
|-------|------|-------------|
| `autoload_item_id` | string, nullable | Идентификатор объявления из файла автозагрузки |
| `finish_time` | string(date-time), nullable | Дата завершения объявления |
| `start_time` | string(date-time), nullable | Дата создания объявления |
| `status` | string, enum `active`, `removed`, `old`, `blocked`, `rejected`, `not_found`, `another_user` | Статус объявления на сайте |
| `url` | string, nullable | URL-адрес объявления |
| `vas` | array of `InfoVas`, nullable | Список применённых платных услуг |

## `ItemVasPricesResp`
type: object; required: `vas`.

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | integer | Идентификатор объявления на сайте |
| `stickers` | array of `StickerResp` | — |
| `vas` | array of `VasResp` | — |

## `ItemsInfoWithCategoryAvito`
type: object.

- `meta` object:
  - `page` integer, example 1 — Номер страницы
  - `per_page` integer, example 25 — Количество записей на странице
- `resources` array of object:
  - `address` string, example `"Москва, Лесная улица 7"` — Адрес объявления
  - `category` object:
    - `id` integer(int32), example 111 — Идентификатор категории
    - `name` string, example `"Вакансии"` — Наименование категории
  - `id` integer(int32), example 24122231 — Идентификатор объявления
  - `price` integer, nullable, example 35000 — Цена объявления (null = не указана)
  - `status` string, enum `active`, `removed`, `old`, `blocked`, `rejected` — Статус объявления на сайте
  - `title` string, example `"Продавец-кассир"` — Наименование объявления
  - `url` string, nullable, example `"https://www.avito.ru/rostov-na-donu/vakansii/prodavets_magazina_2142"` — URL-адрес объявления

## `SpendingsGroupings`
type: string; enum: `day`, `week`, `month`. description: "Группировка статистики расходов (по дням, неделям, месяцам)".

## `SpendingsRequest`
type: object; required: `dateFrom`, `dateTo`, `spendingTypes`, `grouping`.

| Field | Type | Description |
|-------|------|-------------|
| `dateFrom` | string(date), example `2020-09-01` | Дата начала периода статистики расходов в формате YYYY-MM-DD |
| `dateTo` | string(date), example `2021-10-15` | Дата конца периода статистики расходов в формате YYYY-MM-DD |
| `filter` | object, nullable | Набор ограничений. Поля (все nullable): `categoryIDs` integer[], `itemIDs` integer[], `locationIDs` integer[] |
| `grouping` | `SpendingsGroupings` (ref) | — |
| `spendingTypes` | string[], example `["promotion","presence"]` | Набор необходимых типов расходов (all, promotion, presence, commission, rest) |

## `SpendingsResponse`
type: object; required: `result`.

- `result` object; required: `groupings`, `timestamp`:
  - `groupings` array of object; required: `date`, `type`, `spendings`:
    - `date` string, example `"2025-05-02"` — Дата группировки (YYYY-MM-DD)
    - `spendings` array of object; required: `slug`, `value`:
      - `slug` string, example `"presence"` — Слаг типа расходов
      - `value` number(float), example 123.95 — Сумма расходов в рублях
    - `type` `SpendingsGroupings` (ref)
  - `timestamp` integer, example 1746133200 — Временная метка ответа (UTC)

## `StatisticsCounters`
type: array of object.

Элемент массива (type: object):
- `itemId` integer(int64) — Идентификатор объявления
- `stats` array of object:
  - `contacts` integer, deprecated — DEPRECATED (удалено в апреле 2021). Используйте `uniqContacts`. Запросы контактов объявления.
  - `date` string(date), required — Дата (YYYY-MM-DD). Для группировок по периодам — дата начала периода.
  - `favorites` integer, deprecated — DEPRECATED. Используйте `uniqFavorites`.
  - `uniqContacts` integer — Уникальные пользователи, запрашивавшие контакты объявления
  - `uniqFavorites` integer — Уникальные пользователи, добавившие в избранное
  - `uniqViews` integer — Уникальные пользователи, просматривавшие объявления
  - `views` integer, deprecated — DEPRECATED. Используйте `uniqViews`.

## `StatisticsDateFrom`
type: string. example `2020-01-01`. description: "Дата (YYYY-MM-DD), с которой (включительно) надо получить статистику".

## `StatisticsDateTo`
type: string. example `2020-01-01`. description: "Дата (YYYY-MM-DD), по которую (включительно) надо получить статистику".

## `StatisticsFields`
type: array of string. items enum: `views`, `uniqViews`, `contacts`, `uniqContacts`, `favorites`, `uniqFavorites`. description: "Набор счётчиков, которые должны присутствовать в ответе".

## `StatisticsItemIDs`
type: array of integer. example `[123456789, 987654321]`. required: `items`. description: "Набор идентификаторов объявлений на сайте".

## `StatisticsPeriodGrouping`
type: string. enum: `day`, `week`, `month`. description: "Период группировки".

## `StatisticsResponse`
type: object.

- `errors` object
- `result` object — Статистические счётчики объявления:
  - `items` `StatisticsCounters` (ref)

## `StatisticsShallowRequestBody`
type: object. required: `itemIds`, `dateFrom`, `dateTo`.

| Field | Ref |
|-------|-----|
| `dateFrom` | `StatisticsDateFrom` |
| `dateTo` | `StatisticsDateTo` |
| `fields` | `StatisticsFields` |
| `itemIds` | `StatisticsItemIDs` |
| `periodGrouping` | `StatisticsPeriodGrouping` |

## `StickerResp`
type: object; required: `id`, `title`, `description`. description: "Информация о значках для переданного списка объявлений".

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Описание значка |
| `id` | integer | Идентификатор значка |
| `title` | string | Название значка |

## `UpdatePriceRequest`
type: object; required: `price`.

| Field | Type | Description |
|-------|------|-------------|
| `price` | integer, example 100 | Цена |

## `UpdatePriceResponse`
type: object; required: `result`.

- `result` object:
  - `success` boolean

## `VasAmountAvito`
type: object.

| Field | Type | Description |
|-------|------|-------------|
| `amount` | number(float) | Сумма списания за применение услуги или пакета |

## `VasApplyAvito`
type: object.

| Field | Type | Description |
|-------|------|-------------|
| `amount` | number(float) | Сумма списания за применение услуги |
| `vas` | `InfoVas` (ref) | — |

## `VasPricesResp`
type: array of `ItemVasPricesResp`.

## `VasResp`
type: object; required: `slug`, `price`, `priceOld`. description: "Информация об услугах и пакетах дополнительных услуг для переданного списка объявлений".

| Field | Type | Description |
|-------|------|-------------|
| `price` | integer, example 200 | Цена со скидкой |
| `priceOld` | integer, example 300 | Цена до применения скидки |
| `slug` | string, example `x2_1` | Идентификатор услуги или пакета услуг |

## `authError`
type: object.

- `error` object; required: `code`, `message`:
  - `code` integer(int32), example 401 — Код ошибки
  - `message` string, example `"Unauthorized"` — Сообщение об ошибке

## `badRequestError`
type: object.

- `error` object; required: `code`, `message`:
  - `code` integer(int32), example 400 — Код ошибки
  - `message` string, example `"Bad Request"` — Сообщение об ошибке

## `itemIdsRequestBody`
type: object; required: `item_ids`.

| Field | Type | Description |
|-------|------|-------------|
| `item_ids` | integer[] | Набор идентификаторов объявлений на сайте |

## `notFoundError`
type: object.

- `error` object; required: `code`, `message`:
  - `code` integer(int32), example 404 — Код ошибки
  - `message` string, example `"Not found"` — Сообщение об ошибке

## `packageIdRequestBodyV2`
type: object; required: `package_id`.

- `package_id` string, enum: `x2_1`, `x2_7`, `x5_1`, `x5_7`, `x10_1`, `x10_7`, `x15_1`, `x15_7`, `x20_1`, `x20_7` — Идентификатор пакета услуг:
  - `x2_1` — пакет "до 2 раз больше просмотров на 1 день"
  - `x2_7` — пакет "до 2 раз больше просмотров на 7 дней"
  - `x5_1` — пакет "до 5 раз больше просмотров на 1 день"
  - `x5_7` — пакет "до 5 раз больше просмотров на 7 дней"
  - `x10_1` — пакет "до 10 раз больше просмотров на 1 день"
  - `x10_7` — пакет "до 10 раз больше просмотров на 7 дней"
  - В некоторых регионах и категориях также доступны: `x15_1`, `x15_7`, `x20_1`, `x20_7`. Если попытаться применить их в недоступных регионе/категории — оплата не пройдёт.

## `pricesItemIdsRequestBody`
type: object; required: `itemIds`.

| Field | Type | Description |
|-------|------|-------------|
| `itemIds` | integer[] | Набор идентификаторов объявлений на сайте |

## `serviceError`
type: object.

- `error` object; required: `code`, `message`:
  - `code` integer(int32), example 500 — Код ошибки
  - `message` string, example `"Error while processing request. Please, contact support"` — Описание ошибки

## `serviceUnavailableError`
type: object.

- `error` object; required: `code`, `message`:
  - `code` integer(int32), example 503 — Код ошибки
  - `message` string, example `"Service temporarily unavailable. Please, contact support"` — Описание ошибки

## `tooManyRequests`
type: object. (пустая схема)

## `validatingError`
type: object.

- `error` object; required: `code`, `message`:
  - `code` integer(int32), example 400 — Код ошибки
  - `fields` object, nullable — Информация об ошибке валидации параметров в формате ключ-значение
  - `message` string, example `"Validation error"` — Сообщение об ошибке

## `vasIdRequestBody`
type: object; required: `vas_id`.

- `vas_id` string, enum: `highlight`, `xl` — Идентификатор услуги:
  - `highlight` — выделение объявления
  - `xl` — XL-объявление
