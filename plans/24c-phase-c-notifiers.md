# Phase C: Popular Notifiers

**Branch:** `feature/notifiers-phase-c`
**Parent:** [24-integration-expansion.md](24-integration-expansion.md)

---

## Goal

Add four popular notification services: **Telegram**, **Gotify**, **ntfy**, and **Pushover**. All are simple HTTP POST notifiers — each is a single file, ~80-120 lines, following the Discord/Slack pattern.

**No framework changes needed.**

---

## Plugin 1: Telegram

### File: `plugins/notifications/telegram/plugin.go`

**Config:**
```go
type Config struct {
    BotToken string `json:"bot_token"`
    ChatID   string `json:"chat_id"`
}
```

- API: `POST https://api.telegram.org/bot{token}/sendMessage`
- Body: `{"chat_id": "...", "text": "...", "parse_mode": "HTML"}`
- Sanitizer: redact `bot_token`
- Test: `POST .../getMe` (validates token)

---

## Plugin 2: Gotify

### File: `plugins/notifications/gotify/plugin.go`

**Config:**
```go
type Config struct {
    URL   string `json:"url"`    // e.g. "http://gotify.local"
    Token string `json:"token"`  // application token
}
```

- API: `POST {url}/message?token={token}`
- Body: `{"title": "Luminarr", "message": "...", "priority": 5}`
- Uses `safedialer.LANTransport()` (self-hosted)
- Sanitizer: redact `token`
- Test: send message with priority 1

---

## Plugin 3: ntfy

### File: `plugins/notifications/ntfy/plugin.go`

**Config:**
```go
type Config struct {
    URL      string `json:"url"`       // e.g. "https://ntfy.sh" or self-hosted
    Topic    string `json:"topic"`
    Token    string `json:"token,omitempty"` // optional auth token
    Priority int    `json:"priority,omitempty"` // 1-5, default 3
}
```

- API: `POST {url}/{topic}` with plain text body
- Headers: `Title: Luminarr — {eventType}`, `Priority: {1-5}`, optionally `Authorization: Bearer {token}`
- Uses `safedialer.LANTransport()` (may be self-hosted)
- Sanitizer: redact `token`
- Test: send message with tag "test"

---

## Plugin 4: Pushover

### File: `plugins/notifications/pushover/plugin.go`

**Config:**
```go
type Config struct {
    APIToken string `json:"api_token"` // application token
    UserKey  string `json:"user_key"`  // user/group key
}
```

- API: `POST https://api.pushover.net/1/messages.json`
- Body: `{"token": "...", "user": "...", "title": "Luminarr", "message": "..."}`
- Sanitizer: redact `api_token`
- Test: `POST https://api.pushover.net/1/users/validate.json` with token + user

---

## Frontend Changes

### File: `web/ui/src/pages/settings/notifications/NotificationList.tsx`

For each plugin:
1. Kind dropdown option
2. Settings sub-component (2-3 input fields each)
3. KindBadge color/label
4. Form state fields + formToRequest/notifToForm mappings

---

## Wiring: `cmd/luminarr/main.go`

Four blank imports:
```go
_ "github.com/davidfic/luminarr/plugins/notifications/telegram"
_ "github.com/davidfic/luminarr/plugins/notifications/gotify"
_ "github.com/davidfic/luminarr/plugins/notifications/ntfy"
_ "github.com/davidfic/luminarr/plugins/notifications/pushover"
```

---

## Implementation Order

| # | Commit |
|---|--------|
| 1 | Telegram plugin + test |
| 2 | Gotify plugin + test |
| 3 | ntfy plugin + test |
| 4 | Pushover plugin + test |
| 5 | Frontend: all four notifiers |
