# Agent Bridge — Telegram Agent Connection

## Overview
A token-based authentication bridge that connects the frontend to a Telegram agent via OpenClaw. The frontend generates a token, the user gives it to their Telegram bot, and the bot streams logs back to the frontend in real-time via SSE.

## Architecture
- **Go backend** at `agent-bridge/` (port 8090) — pure stdlib, zero dependencies
- **In-memory storage** — map of tokens to SSE subscriber channels
- **SSE** for real-time log streaming

## Flow
1. User clicks "Connect Telegram" → `POST /api/token/generate` → returns 8-char token
2. Frontend opens SSE connection to `GET /api/logs/stream?token=xxx`
3. User gives token to Telegram bot
4. Bot posts `POST /api/logs` with token + message → fans out to SSE subscribers
5. Frontend displays logs in real-time terminal view

## Files Created

### Go Backend (`agent-bridge/`)
| File | Purpose |
|------|---------|
| `go.mod` | Module definition (Go 1.21, no external deps) |
| `main.go` | Entrypoint — wires store, handlers, CORS middleware, listens on :8090 |
| `internal/store/store.go` | In-memory token registry with pub/sub channels. 8-char hex tokens via `crypto/rand`. Buffered subscriber channels (64). |
| `internal/handler/token.go` | `POST /api/token/generate` — creates token, returns JSON |
| `internal/handler/logs.go` | `POST /api/logs` — validates token, publishes message to subscribers |
| `internal/handler/stream.go` | `GET /api/logs/stream?token=xxx` — SSE endpoint with `event: connected` init + real-time log streaming |
| `internal/middleware/cors.go` | CORS middleware (`Access-Control-Allow-Origin: *`, handles OPTIONS preflight) |

### Frontend (`fin/`)
| File | Change |
|------|--------|
| `src/components/RightSidebar.tsx` | Replaced static CTA with state machine (`disconnected` → `generating` → `token_ready` → `connected`). Added token display with copy button, EventSource SSE connection, terminal-style log viewer with auto-scroll. |
| `src/app/globals.css` | Added `.agent-panel`, `.agent-token-*`, `.agent-terminal-*`, `.agent-log-*` styles. Green pulsing dot for live status. Monospace font for token and logs. Matches existing theme (#0a0a0a, #1a1a1a, #00ff94). |
| `.env.local` | Added `NEXT_PUBLIC_AGENT_BRIDGE_URL=http://localhost:8090` |

## API Endpoints

### `POST /api/token/generate`
**Response:** `{"token": "a1b2c3d4"}`

### `POST /api/logs`
**Body:** `{"token": "a1b2c3d4", "message": "...", "source": "telegram"}`
**Response:** `{"status": "ok"}` or `401` if invalid token

### `GET /api/logs/stream?token=a1b2c3d4`
**SSE stream.** Sends `event: connected` on open, then `data: {"message":"...","source":"...","timestamp":"..."}` for each log.

## Running

```bash
# Terminal 1 — backend
cd agent-bridge && go run .

# Terminal 2 — frontend
cd fin && npm run dev

# Test with curl
curl -X POST http://localhost:8090/api/logs \
  -H "Content-Type: application/json" \
  -d '{"token":"<token>","message":"Agent connected","source":"telegram"}'
```
