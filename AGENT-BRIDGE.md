# Agent Bridge Architecture

Complete reference for the OpenClaw agent integration — how it works today and how to extend it for cross-chain trading.

---

## Current Architecture

```
OpenClaw Agent (Telegram)
    │
    │  1. GET /api/skills?token=X        → discover capabilities
    │  2. GET /api/bridge/pairs           → list tradeable pairs
    │  3. GET /api/bridge/orderbook?...   → read market data
    │  4. POST /api/bridge/order/limit    → build unsigned limit order XDR
    │  5. Agent signs XDR with its key
    │  6. POST /api/bridge/tx/submit      → submit signed XDR to Horizon
    │
    ▼
[Go Bridge]  (agent-bridge/ — fly.io)
    │  Token validation + CORS
    │  Strips /api/bridge → /api/agent
    ▼
[Next.js API Routes]  (fin/src/app/api/agent/)
    │  Calls centralized action functions
    ▼
[Action Layer]  (fin/src/actions/)
    │  trade.ts, account.ts, orderbook.ts
    │  Shared by UI (Freighter) AND agent API
    ▼
[Service Layer]  (fin/src/services/sdex.service.ts)
    │  Builds Stellar transactions, talks to Horizon
    ▼
[Stellar Network]  (Horizon API → SDEX)
```

## Connection Flow

1. User clicks "Connect Telegram" in RightSidebar
2. `POST /api/token/generate` → returns `{ token: "abc123" }`
3. SSE stream opens at `/api/logs/stream?token=abc123`
4. Config JSON displayed with token + endpoints
5. User sends token to OpenClaw Telegram bot
6. Bot uses token in `X-Agent-Token` header for all API calls

## Skills (Current)

### Read Skills (GET)

| Skill | Path | Params |
|-------|------|--------|
| `orderbook` | `/api/bridge/orderbook` | `symbol` (e.g. XLM/USDC) |
| `pairs` | `/api/bridge/pairs` | — |
| `offers` | `/api/bridge/offers` | `account` (G...) |
| `trades` | `/api/bridge/trades` | `account`, `limit` |
| `trustline` | `/api/bridge/trustline` | `account`, `asset` |
| `price` | `/api/bridge/price` | `symbol` |

### Write Skills (POST → unsigned XDR)

| Skill | Path | Body params |
|-------|------|-------------|
| `limit_order` | `/api/bridge/order/limit` | `account`, `symbol`, `side`, `amount`, `price` |
| `market_order` | `/api/bridge/order/market` | `account`, `symbol`, `side`, `amount`, `slippage?` |
| `cancel_order` | `/api/bridge/order/cancel` | `account`, `offerId`, `symbol` |
| `build_trustline` | `/api/bridge/trustline/build` | `account`, `asset` |
| `submit_tx` | `/api/bridge/tx/submit` | `signedXdr` |

### Write Flow (Agent)

```
1. POST /api/bridge/order/limit
   Body: { account: "G...", symbol: "XLM/USDC", side: "buy", amount: "100", price: "0.15" }
   Response: { xdr: "AAAA...", networkPassphrase: "Test SDF Network ; September 2015" }

2. Agent signs XDR with its ed25519 keypair (from ZK Auth session)

3. POST /api/bridge/tx/submit
   Body: { signedXdr: "AAAA..." }
   Response: { success: true, txHash: "abc...", offerId: "123" }
```

## File Map

```
agent-bridge/
├── main.go                          # HTTP server, route wiring
├── internal/
│   ├── handler/
│   │   ├── skills.go                # Skills manifest (add new skills here)
│   │   ├── proxy.go                 # Auth + proxy to Next.js
│   │   ├── token.go                 # Token generation
│   │   ├── logs.go                  # Agent log ingestion
│   │   └── stream.go                # SSE log streaming
│   ├── middleware/
│   │   └── cors.go                  # CORS with X-Agent-Token
│   └── store/
│       └── store.go                 # In-memory token + pub/sub store

fin/src/
├── types/sdex.types.ts              # Shared types (UnsignedTx, SignFn, etc.)
├── services/sdex.service.ts         # Low-level Stellar SDK calls
├── configs/
│   ├── assets.ts                    # Network + asset definitions
│   └── tradingPairs.ts              # Pair definitions per network
├── actions/
│   ├── trade.ts                     # Build + execute trade actions
│   │   ├── buildLimitOrderXdr()     # → UnsignedTx (used by API)
│   │   ├── buildMarketOrderXdr()    # → UnsignedTx (used by API)
│   │   ├── buildCancelOfferXdr()    # → UnsignedTx (used by API)
│   │   ├── placeLimitOrder()        # build + sign + submit (used by UI)
│   │   ├── placeMarketOrder()       # build + sign + submit (used by UI)
│   │   └── cancelOffer()            # build + sign + submit (used by UI)
│   ├── account.ts                   # Trustline + account queries
│   │   ├── buildTrustlineXdr()      # → UnsignedTx (used by API)
│   │   ├── ensureTrustline()        # check + build + sign (used by UI)
│   │   ├── getOpenOffers()
│   │   └── getTradeHistory()
│   └── orderbook.ts                 # Order book + mid-price queries
├── app/api/agent/
│   ├── orderbook/route.ts           # GET  — order book
│   ├── pairs/route.ts               # GET  — trading pairs
│   ├── offers/route.ts              # GET  — open offers
│   ├── trades/route.ts              # GET  — trade history
│   ├── trustline/route.ts           # GET  — check trustline
│   ├── price/route.ts               # GET  — mid-price
│   ├── order/
│   │   ├── limit/route.ts           # POST — build limit order XDR
│   │   ├── market/route.ts          # POST — build market order XDR
│   │   └── cancel/route.ts          # POST — build cancel offer XDR
│   ├── trustline/
│   │   └── build/route.ts           # POST — build trustline XDR
│   └── tx/
│       └── submit/route.ts          # POST — submit signed XDR
└── components/
    └── RightSidebar.tsx             # Agent connection UI
```

## Centralized Action Pattern

Both UI and agent use the **same action functions**:

```
                    ┌── UI (Freighter) ──► placeLimitOrder(signFn)
                    │                       └── buildLimitOrderXdr() + signAndSubmit()
buildLimitOrderXdr()│
                    │
                    └── Agent API ──► POST /order/limit
                                       └── buildLimitOrderXdrBySymbol()
                                            └── buildLimitOrderXdr()
```

The `build*Xdr()` functions contain the core logic (side resolution, price conversion, XDR construction). The `place*()` functions add trustline checks + signing on top.

---

## Extending for Cross-Chain Trading

When adding cross-chain support (e.g. hold assets on Stellar but trade on Ethereum/Solana/etc.), here's the extension pattern:

### 1. Add a new service file

```
fin/src/services/
├── sdex.service.ts          # Stellar SDEX (existing)
├── evm.service.ts           # EVM DEX (new — Uniswap, 1inch, etc.)
└── solana.service.ts        # Solana DEX (new — Jupiter, Raydium, etc.)
```

Each service exports the same pattern:
- `buildSwapTransaction(params)` → returns unsigned transaction (hex/bytes for EVM, base58 for Solana)
- `submitTransaction(signedTx)` → submits to target chain RPC

### 2. Add action functions

```
fin/src/actions/
├── trade.ts                 # Stellar SDEX trades (existing)
├── trade-evm.ts             # EVM trades (new)
│   ├── buildEvmSwapTx()     # → { unsignedTx, chainId }
│   └── placeEvmSwap()       # build + sign + submit (UI with MetaMask)
└── trade-solana.ts          # Solana trades (new)
    ├── buildSolanaSwapTx()  # → { unsignedTx, network }
    └── placeSolanaSwap()    # build + sign + submit (UI with Phantom)
```

### 3. Add API routes

```
fin/src/app/api/agent/
├── order/limit/route.ts     # Stellar (existing)
├── evm/
│   ├── swap/route.ts        # POST — build EVM swap tx
│   ├── approve/route.ts     # POST — build ERC20 approve tx
│   └── submit/route.ts      # POST — submit signed EVM tx
└── solana/
    ├── swap/route.ts        # POST — build Solana swap tx
    └── submit/route.ts      # POST — submit signed Solana tx
```

### 4. Add skills to manifest

In `agent-bridge/internal/handler/skills.go`, add entries to the `skills` slice:

```go
// ── Cross-chain skills ──
{
    Name:        "evm_swap",
    Description: "Build an unsigned EVM swap transaction (Uniswap/1inch)",
    Method:      "POST",
    Path:        "/api/bridge/evm/swap",
    Params:      map[string]string{
        "fromToken": "Token address or symbol",
        "toToken":   "Token address or symbol",
        "amount":    "Amount to swap",
        "chain":     "Chain name: ethereum, polygon, arbitrum, base",
        "account":   "EVM wallet address (0x...)",
    },
},
{
    Name:        "evm_submit",
    Description: "Submit a signed EVM transaction",
    Method:      "POST",
    Path:        "/api/bridge/evm/submit",
    Params:      map[string]string{"signedTx": "Signed transaction hex"},
},
```

### 5. Config extension

```
fin/src/configs/
├── assets.ts            # Stellar assets (existing)
├── tradingPairs.ts      # Stellar pairs (existing)
├── chains.ts            # NEW — chain definitions (RPC URLs, chain IDs)
└── crossChainPairs.ts   # NEW — cross-chain pair definitions
```

### 6. Bridge routing

The Go proxy already handles this — any `/api/bridge/*` path gets forwarded to `/api/agent/*`. No bridge changes needed for new routes.

### Key Decisions for Cross-Chain

| Decision | Options |
|----------|---------|
| **Bridge protocol** | Wormhole, Axelar, or custom lock/mint on Stellar |
| **Agent signing** | Separate key per chain vs. single key with chain adapters |
| **Settlement** | Instant (atomic swap) vs. async (bridge + confirm) |
| **Oracle** | Shared oracle contract on Stellar or per-chain feeds |

### The Pattern

Every new chain follows the same 4-layer pattern:

```
skills.go  →  API route  →  action function  →  chain service
  (discovery)   (HTTP)      (shared logic)      (SDK calls)
```

The agent always:
1. Discovers skills via `/api/skills`
2. Calls build endpoint → gets unsigned tx
3. Signs with its key
4. Calls submit endpoint → gets result

This pattern is chain-agnostic. The agent doesn't need to know Stellar vs EVM vs Solana — it just follows the build → sign → submit flow for each chain.

---

## Running

```bash
# Terminal 1 — Go bridge
cd agent-bridge && go run .

# Terminal 2 — Next.js frontend
cd fin && npm run dev

# Test read skill
curl -H "X-Agent-Token: <token>" http://localhost:8090/api/bridge/pairs

# Test write skill (build limit order)
curl -X POST -H "X-Agent-Token: <token>" -H "Content-Type: application/json" \
  http://localhost:8090/api/bridge/order/limit \
  -d '{"account":"G...","symbol":"XLM/USDC","side":"buy","amount":"100","price":"0.15"}'

# Test submit
curl -X POST -H "X-Agent-Token: <token>" -H "Content-Type: application/json" \
  http://localhost:8090/api/bridge/tx/submit \
  -d '{"signedXdr":"AAAA..."}'
```
