# Stellar AI Trading Platform

## What We Built

A full-stack AI-powered leveraged trading platform on Stellar. Users connect a Stellar wallet, deposit USDC into an on-chain vault, take leveraged long/short positions on XLM/USDC priced from the real SDEX order book, and have their P&L settled automatically on-chain via Soroban smart contracts. An AI agent observes every user's active trading session and can act autonomously.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend (fin/)               │
│  Terminal | Pro | Portfolio                              │
│  Freighter Wallet → Soroban contract calls (user-signed)│
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼────────────────────────────────┐
│              Agent Bridge (Go, port 8090)                │
│  Token session store │ Matching engine │ Price oracle   │
│  Liquidation engine  │ Soroban client  │ SDEX watcher   │
└────────────────────────┬────────────────────────────────┘
                         │ JSON-RPC (Soroban)
┌────────────────────────▼────────────────────────────────┐
│              Stellar Testnet                             │
│  AgentVault contract   │  LeveragePool contract         │
│  CCNK5O3F…             │  CCNF3JMO…                    │
└─────────────────────────────────────────────────────────┘
```

---

## Smart Contracts (Soroban, Testnet)

### AgentVault — `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG`

The primary user-facing treasury. Holds USDC deposited by all participants.

| Function | Who calls it | What it does |
|---|---|---|
| `deposit(user, token, amount)` | User (wallet-signed) | Deposit USDC into vault |
| `withdraw(user, token, amount)` | User (wallet-signed) | Withdraw USDC from vault |
| `settle_pnl(user, token, pnl)` | Admin only (bridge) | Credit/debit user by P&L amount |
| `get_balance(user, token)` | Read-only | User's current vault balance |
| `get_terminal_pool(token)` | Read-only | Total USDC across all depositors |

`settle_pnl` is admin-gated — only the platform's admin keypair can call it. Positive P&L credits the user; negative P&L seizes funds (loss or liquidation).

### LeveragePool — `CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L`

Tracks open leveraged positions on-chain and manages collateral locking.

| Function | Who calls it | What it does |
|---|---|---|
| `deposit_collateral(user, token, amount)` | User (wallet-signed) | Post free margin |
| `withdraw_collateral(user, token, amount)` | User (wallet-signed) | Reclaim free margin |
| `open_synthetic_position(user, symbol, debt, token, collateral)` | Admin (bridge) | Lock collateral, record position |
| `close_position(user, token)` | Admin (bridge) | Release position record |
| `get_collateral_balance(user, token)` | Read-only | Free margin available |
| `get_position(user)` | Read-only | Current open position |

### Settlement token: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`

This is the Stellar Asset Contract (SAC) wrapping classic USDC on testnet. All USDC in both contracts is denominated in this token. Amounts are stored as i128 with 7 decimal places (1 USDC = 10,000,000).

---

## Agent Bridge (Go backend)

The bridge is the trusted server between the user-facing frontend and the Soroban contracts. It holds the admin secret key and is the only entity that can call `settle_pnl` and `open_synthetic_position`.

### Session system

Every browser session gets a unique token (`POST /api/token/generate`). The token is persisted in `localStorage` and used for all API calls. When a wallet connects, the frontend registers the Stellar address against the token (`POST /api/context`). This lets the bridge resolve which on-chain address to settle P&L to for any given session.

### Matching engine (`internal/matching/`)

An internal central-limit order book for each trading pair. Supports limit orders with price-time priority matching.

- `OrderBook` — price-sorted bid/ask queues, fills on crossing orders
- `Engine` — wraps all books, exposes `PlaceOrder` / `CancelOrder` / `BookSnapshot`
- `PriceSync` — distributes live mark prices from the SDEX watcher to all consumers

### Liquidation engine (`internal/matching/liquidation.go`)

Runs every 5 seconds, checks every open position against the current mark price.

**Liquidation threshold: 90% collateral loss**

```
Long  loss = (entryPrice - markPrice) / entryPrice × leverage × collateral
Short loss = (markPrice - entryPrice) / entryPrice × leverage × collateral
```

When `loss >= 0.90 × collateral`, the engine calls `SettleTrade` with `pnl = -collateral` (full seizure) and removes the position.

### Soroban client (`internal/soroban/client.go`)

The Contract Controller — the only component that holds the admin secret and submits privileged Soroban transactions.

Flow for every call:
1. Fetch current sequence number from Horizon
2. Build unsigned `InvokeHostFunction` transaction
3. `simulateTransaction` → get ledger footprint + resource fee
4. Patch the XDR envelope with Soroban ext + updated fee
5. Sign with admin keypair
6. `sendTransaction` → poll `getTransaction` until `SUCCESS` or timeout (90s)
7. Retry up to 3× on `tx_bad_seq` (nonce collision)

### SDEX price oracle (`internal/sdex/client.go`)

Queries the Horizon order book for XLM/USDC and returns `(ask + bid) / 2` as the mark price. Used for:
- Position entry price when opening
- Position close price when closing
- Liquidation engine mark price updates

### Order book watcher (`internal/watcher/`)

Background goroutines that poll Horizon every few seconds for real order book snapshots on both TESTNET and MAINNET (XLM/USDC, XLM/EURC). Publishes updates to the in-process store, which the SSE stream delivers to connected browser sessions as market insight events.

Also watches individual Stellar accounts (streaming from Horizon SSE) so the AI agent gets notified of incoming transactions.

---

## Leveraged Position Lifecycle

```
User opens position (Long 5× on 100 XLM)
│
├─ 1. GET /api/positions/open
│       token, side="long", xlmAmount=100, leverage=5
│
├─ 2. Bridge fetches SDEX mid price          → entryPrice = 0.1006 USDC/XLM
│
├─ 3. Economics
│       totalUSDC  = 100 × 0.1006 = 10.06 USDC   (notional / debt)
│       collateral = 10.06 / 5   =  2.01 USDC   (margin required)
│
├─ 4. On-chain: LeveragePool.open_synthetic_position
│       Locks collateral record on-chain (admin-signed)
│
├─ 5. In-memory: position stored in bridge
│       Liquidation engine starts monitoring at 5s intervals
│
└─ Position is open. Entry recorded at real SDEX oracle price.

User closes position
│
├─ 1. POST /api/positions/close  { token }
│
├─ 2. Bridge fetches SDEX mid price          → closePrice = 0.1056 USDC/XLM
│
├─ 3. P&L calculation
│       pnl = (closePrice - entryPrice) × xlmAmount
│           = (0.1056 - 0.1006) × 100 = +0.50 USDC profit
│
├─ 4. On-chain: AgentVault.settle_pnl(user, USDC, +0.50)
│       User's vault balance increases by 0.50 USDC (admin-signed)
│
├─ 5. On-chain: LeveragePool.close_position(user, USDC)
│       Position record cleared on-chain (admin-signed)
│
└─ 6. Position removed from bridge store
```

**Both long and short are synthetic** — no actual USDC or XLM is swapped on SDEX during position open/close. The SDEX oracle provides real market prices; the pool settles the economic outcome. This is the same model used by GMX, Synthetix, and most on-chain perp protocols.

---

## Frontend (Next.js, `fin/`)

### Pages

| Page | Route | Description |
|---|---|---|
| Home | `/` | Landing page |
| Terminal | `/terminal` | Full SDEX trading terminal |
| Pro | `/pro` | Pro view with AI agent, order book, chart, vault panel |
| Portfolio | `/portfolio` | Account overview |

### Pro page layout

```
┌─────────────┬────────────────────────┬──────────────────┐
│ Left        │ Chart (TradingView)    │ ContractController│
│ Sidebar     │ Order Book             │ UserVault         │
│ (pairs)     │ Open Orders            │                   │
└─────────────┴────────────────────────┴──────────────────┘
```

### ContractController component

Connects to the agent bridge SSE stream. Displays the AI agent's live logs, market insight events, and context updates. The agent can observe the user's active pair, wallet, and on-chain activity in real time.

### UserVault component

Two-tab panel in the Pro right sidebar:

**Pool tab**
- Shows total vault pool balance (`get_terminal_pool`)
- Deposit / Withdraw USDC (user-signed Soroban transaction via Freighter)

**Leverage tab**
- Live SDEX mark price + free margin
- Inline margin deposit to LeveragePool (`deposit_collateral`)
- Long / Short position entry: XLM amount + leverage slider (2×–20×)
- Live preview: Notional and Margin required
- Open position → calls bridge `/api/positions/open`
- Active position card: entry price, unrealised P&L, close button

### Soroban integration (`utils/contracts.ts`)

User-signed operations (deposit, withdraw, open position) follow this pattern:

1. `simulate` the transaction via Soroban RPC to get the assembled XDR
2. Pass XDR to Freighter wallet for user signature
3. Submit signed XDR via **raw JSON-RPC fetch** (bypasses `stellar-base`'s `fromXDR`, which fails on protocol-22 XDR types with "Bad union switch: 4")
4. Poll `getTransaction` until `SUCCESS`

### AI agent integration (`app/api/agent/`)

The frontend exposes API routes that proxy to an LLM (via OpenRouter). The agent has access to:
- Live order book data
- Current trading pair prices
- The user's bridge context (active pair, wallet address)
- Skill definitions from the bridge

The bridge's SSE stream delivers real-time account and market events to the agent, allowing it to proactively comment on market conditions or suggest trades.

---

## Environment Variables

### Agent Bridge (`.env`)

| Variable | Default | Description |
|---|---|---|
| `ADMIN_SECRET` | — | Stellar secret key for admin account (S...) |
| `SOROBAN_RPC_URL` | testnet | Soroban JSON-RPC endpoint |
| `HORIZON_URL` | testnet | Horizon REST endpoint |
| `NETWORK_PASSPHRASE` | testnet | Stellar network passphrase |
| `AGENT_VAULT_ID` | CCNK5O3F… | AgentVault contract address |
| `LEVERAGE_POOL_ID` | CCNF3JMO… | LeveragePool contract address |
| `SETTLEMENT_TOKEN` | CBIELTK6… | USDC SAC contract address |
| `FRONTEND_URL` | localhost:3000 | CORS allowed origin |
| `PORT` | 8090 | Bridge listen port |

### Frontend (`.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_AGENT_BRIDGE_URL` | Bridge base URL |
| `OPENROUTER_API_KEY` | LLM API key for AI agent |

---

## Running Locally

```bash
# 1. Start the agent bridge
cd stellar/agent-bridge
./bridge-server        # or: go run .

# 2. Start the frontend
cd stellar/fin
npm run dev

# Frontend: http://localhost:3000
# Bridge:   http://localhost:8090
```

---

## Key Design Decisions

**Why Go for the bridge?**
The admin secret must never touch the browser. Go runs server-side, holds the keypair in memory, and is the sole authority for privileged contract calls.

**Why raw JSON-RPC for Soroban submission?**
Stellar testnet runs protocol 22 which introduced XDR types not present in `stellar-base` v13. After Freighter signs the transaction, calling `fromXDR` on the signed envelope throws "Bad union switch: 4". Submitting via raw `fetch` to the RPC endpoint skips that parse step entirely.

**Why synthetic positions instead of real SDEX swaps?**
Classic SDEX `PathPaymentStrictSend` requires classic Stellar USDC (`GBBD47...` issuer). The pool holds Soroban SAC USDC (`CBIELTK6...`). These are the same underlying asset but live in different protocol layers and cannot be directly exchanged without a SAC withdraw step. Synthetic positions using the SDEX oracle price give users identical economic exposure without the classic USDC bootstrapping problem. This is also the standard design for all on-chain perp protocols (GMX, Synthetix, dYdX).

**i128 scaling**
All monetary values in Soroban contracts are i128 integers with 7 decimal places. 1 USDC = 10,000,000. The bridge applies `× ScaleFactor` before every call and `/ ScaleFactor` when reading results.
