# Stellar DEX Terminal — Update Log

## Overview

This document summarises the changes made across two sessions to the Stellar DEX Terminal project (`/fin` frontend + `/agent-bridge` Go backend).

---

## 1. Frontend Routing

### What changed
- `/` now redirects immediately to `/terminal` via `redirect()` in `app/page.tsx`
- New route: `app/terminal/page.tsx` — the full trading terminal (chart + order book + agent sidebar)
- New route: `app/pro/page.tsx` — placeholder ("Pro coming soon")
- New route: `app/portfolio/page.tsx` — placeholder ("Portfolio coming soon")

### Header navigation
- `components/Header.tsx` now uses `usePathname` + `useRouter` from `next/navigation`
- Active nav button highlights based on current route
- Terminal / Pro / Portfolio buttons are all wired and working

---

## 2. Go Agent Bridge — Real-Time State Tracking

### Files added / modified under `agent-bridge/`

#### `internal/store/store.go` (rewritten)
- `Connection` struct gains `AccountID`, `Network`, `Context *UserContext`, `WatchCancel func()`
- New structs: `TradeRecord`, `OfferRecord`, `UserContext`, `ContextSnapshot`
- New methods: `PublishAll()`, `SetAccountWatch()`, `SetActiveView()`, `AddRecentTrade()`, `SetOpenOffers()`, `GetContextSnapshot()`
- `LogEntry` has a new `EventType` field (`"log"` / `"insight"` / `"context_update"`)

#### `internal/watcher/account.go` (new)
- `WatchAccount(ctx, store, token, accountID, network)` — long-polls Horizon SSE (`/accounts/{id}/transactions?cursor=now`)
- On each new transaction: calls `store.AddRecentTrade()` and publishes a `context_update` event to the token's SSE stream
- Reconnects automatically with 5 s back-off on failure or context cancellation

#### `internal/watcher/orderbook.go` (new)
- `WatchOrderBooks(ctx, store, network)` — polls Horizon every 10 s for:
  - XLM/USDC (both MAINNET and TESTNET)
  - XLM/EURC (MAINNET only)
- Fires an `insight` broadcast event to **all** connected clients when:
  - Mid-price moves ≥ 0.5% since last check
  - Top-of-book wall shrinks ≥ 50%

#### `internal/handler/context.go` (new)
- `POST /api/context` — update active pair / network for a token; start account watcher if `account_id` provided
- `GET /api/context?token=…` — return `ContextSnapshot` JSON for a token

#### `internal/handler/proxy.go` (updated)
- Reads `X-Stellar-Network` header; calls `store.SetActiveView()` with the detected network

#### `internal/handler/stream.go` (updated)
- Named SSE events: `event: insight` and `event: context_update` instead of plain `data:` lines
- Frontend can listen with `es.addEventListener('insight', ...)` etc.

#### `main.go` (updated)
- Starts `WatchOrderBooks` goroutines for both MAINNET and TESTNET at startup
- Registers `/api/context` route

---

## 3. Frontend — Bridge Sync Utilities

### `src/utils/bridge.ts` (new)
- `storeBridgeToken(token)` — saves agent token to localStorage
- `syncViewToBridge(pair, network)` — POSTs active pair + network to `/api/context`
- `registerAccountWithBridge(token, accountId, network)` — registers wallet address for account watching

### `src/hooks/useSdex.ts` (updated)
- Calls `syncViewToBridge(selectedPair, network)` on every pair or network change

### `src/components/RightSidebar.tsx` (updated)
- Calls `storeBridgeToken(newToken)` when generating an agent token
- Calls `registerAccountWithBridge` when token + wallet address + network are all present
- Listens for named SSE events: `insight` (yellow log) and `context_update` (green log)
- **Agent tab sub-toggle**: Helper ↔ OpenClaw (default: Helper)
  - OpenClaw panel is completely unchanged
  - Helper panel renders `<HelperChat selectedPair network />`

---

## 4. Helper AI Agent (Beginner Chat)

### Stack
- **Model**: `deepseek/deepseek-chat-v3-0324` via [OpenRouter](https://openrouter.ai)
- **SDK**: Vercel AI SDK v6 (`ai@6`, `@ai-sdk/react@3`, `@ai-sdk/openai@3`)
- **Framework**: Next.js App Router API route + `useChat` React hook

### `src/app/api/agent/chat/route.ts` (new)
Server-side streaming endpoint:

| Tool | Purpose |
|------|---------|
| `get_price` | Mid-price for a pair |
| `get_order_book` | Top 5 bids + asks |
| `get_my_orders` | Open offers for connected wallet |
| `get_my_trades` | Recent trade history |
| `check_trustline` | Does wallet have a trustline for asset? |
| `build_trustline` | Build + return unsigned trustline XDR |
| `build_limit_order` | Build + return unsigned limit order XDR |
| `build_market_order` | Build + return unsigned market order XDR |

Key implementation details:
- Uses `convertToModelMessages()` to convert v6 UIMessages → CoreMessages for `streamText`
- Uses `stopWhen: stepCountIs(5)` (v6 replacement for `maxSteps`)
- Returns `result.toUIMessageStreamResponse()` (v6 replacement for `toDataStreamResponse`)
- Tool definitions use `inputSchema:` (v6 — was `parameters:` in v4)

### `src/components/HelperChat.tsx` (new)
Client-side chat UI:

- `DefaultChatTransport` with `prepareSendMessagesRequest` injects `walletAddress`, `network`, `activePair` into every request body via refs (avoids transport recreation on prop change)
- Message rendering iterates `msg.parts` (v6 — was `msg.content` + `msg.toolInvocations` in v4):
  - `part.type === 'text'` → chat bubble
  - `part.type === 'dynamic-tool'` + `state === 'input-streaming' | 'input-available'` → spinner with tool label
  - `part.type === 'dynamic-tool'` + `state === 'output-available'` + `output.xdr` → **SignCard** inline
- `status === 'streaming' | 'submitted'` replaces the old `isLoading` boolean
- **SignCard**: prompts Freighter to sign the XDR, then POSTs to `/api/agent/tx/submit`; shows hash on success or error message on failure

---

## 5. API SDK v6 Migration Notes

If you ever need to reference the API differences between the old v4 code and the current v6:

| v4 | v6 |
|----|-----|
| `maxSteps: N` | `stopWhen: stepCountIs(N)` |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` |
| `parameters: z.object(...)` in tools | `inputSchema: z.object(...)` |
| `msg.content` (string) | `msg.parts` (array of `UIMessagePart`) |
| `msg.toolInvocations` | `part.type === 'dynamic-tool'` inside `msg.parts` |
| `isLoading` from `useChat` | `status === 'streaming' \| 'submitted'` |
| `useChat({ api, body })` | `useChat({ transport: new DefaultChatTransport({ api, prepareSendMessagesRequest }) })` |
| `handleSubmit(e, { body })` | `sendMessage({ text: input })` |
| `part.state === 'result'` | `part.state === 'output-available'` |
