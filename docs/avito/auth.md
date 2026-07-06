# Avito API — Авторизация

Источник: swagger `developers.avito.ru/api-catalog/auth/documentation`.

## POST https://api.avito.ru/token

**Content-Type:** `application/x-www-form-urlencoded`

**Body:**

| Поле | Значение |
|------|---------|
| `grant_type` | `client_credentials` |
| `client_id` | ID приложения |
| `client_secret` | секрет приложения |

**Response:**
```json
{
  "access_token": "...",
  "expires_in": 86400,
  "token_type": "Bearer"
}
```

## Использование

```
Authorization: Bearer <access_token>
```

## Лимиты

- Токен живёт 24 часа (`expires_in: 86400`)
- Кешировать и переиспользовать до истечения
- `refresh_token` не возвращается — при истечении заново `POST /token`
