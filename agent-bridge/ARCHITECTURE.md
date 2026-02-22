# Agent-Bridge Architecture

## Overview

```
Browser (fin/)          agent-bridge (Go)           Stellar Network
─────────────           ─────────────────           ───────────────
/terminal    ──SSE──►  /api/logs/stream             Horizon REST
/pro (admin) ──HTTP──► /api/admin/*   ──Soroban──►  AgentVault
AI agent     ──HTTP──► /api/bridge/*  ──proxy──►    /api/agent (Next.js)
                        /api/orders                  LeveragePool
                        /api/prices
```

---

## 1. Matching Engine

`internal/matching/`

The in-process central limit order book. It is NOT the SDEX — it is an internal
synthetic market that the AI agent trades against.

### Components

| File | Role |
|---|---|
| `orderbook.go` | Per-symbol price-time priority CLOB. `AddOrder` returns fills immediately. |
| `price.go` | `PriceSync` — thread-safe mark-price map. Fed by `POST /api/price/update` (TradingView webhook) or mock updater. |
| `liquidation.go` | Polls open positions every 5 s. If unrealised loss ≥ 90 % of collateral, triggers settlement. |
| `engine.go` | Glues the three above. Exposes `PlaceOrder`, `CancelOrder`, `BookSnapshot`. |

### Settlement flow

```
LiquidationEngine.checkAll()
  │  unrealised loss ≥ 90 % threshold
  ▼
Engine.submitSettle()  (default: HTTP POST to SETTLE_URL)
  OR
soroban.Client.SettleTrade()  (when ADMIN_SECRET is set — direct on-chain)
```

`Engine.SetSettleFunc(fn)` replaces the HTTP fallback with the direct Soroban
call so liquidations bypass the network round-trip to the frontend.

---

## 2. Contract Controller (Soroban)

`internal/soroban/`

The **only** component that holds `ADMIN_SECRET` and can mutate the on-chain
contracts.

### Why Go, not the browser?

The browser SDKs (`vault_sdk`, `leverage_sdk` in `contracts/packages/`) are
generated TypeScript bindings that require the **user's wallet** to sign. Admin
operations (`settle_pnl`, `open_synthetic_position`) must be signed by the
**protocol admin key** — which must never reach the browser.

### Transaction lifecycle

```
1. getSequence()          — GET /accounts/{adminAddr} from Horizon
2. txnbuild.NewTransaction — InvokeHostFunction op, no Soroban data yet
3. rpc.simulateTransaction — returns SorobanTransactionData + minResourceFee
                             (this is the "ledger footprint")
4. Patch envelope          — set TransactionExt.V=1, SorobanData, updated Fee
5. network.HashTransactionInEnvelope + keypair.SignDecorated
6. rpc.sendTransaction    — broadcast signed envelope
7. rpc.getTransaction     — poll until SUCCESS / FAILED (90 s timeout)
```

### Retry on tx_bad_seq

If `sendTransaction` returns an error containing `tx_bad_seq`, the sequence
number is re-fetched and the transaction is rebuilt and resubmitted (up to 3×).
This handles the case where two concurrent calls race on the same nonce.

### i128 scaling

All monetary amounts are stored as Soroban `i128` (128-bit signed integer).
The contract uses **7 decimal places** (same as Stellar's native precision).

```
Go float64  1.5 USDC
× ScaleFactor (10_000_000)
= int64     15_000_000
→ xdr.Int128Parts { Hi: 0, Lo: 15_000_000 }   // positive
```

For negative PnL (loss):
```
-90.0 USDC → int64 -900_000_000
→ xdr.Int128Parts { Hi: -1, Lo: uint64(-900_000_000) }  // sign-extended
```

### Symbol handling

The leverage contract stores the synthetic asset name as a Soroban `Symbol`
(short string ≤ 32 chars). In Go:

```go
sym := xdr.ScSymbol("XLM")
xdr.ScVal{Type: xdr.ScValTypeScvSymbol, Sym: &sym}
```

---

## 3. HTTP Endpoints

### Public / Agent endpoints

| Method | Path | Handler | Description |
|---|---|---|---|
| POST | `/api/token/generate` | TokenHandler | Create a session token |
| POST | `/api/logs` | LogsHandler | Agent posts a log line |
| GET  | `/api/logs/stream?token=` | StreamHandler | SSE — terminal live feed |
| GET  | `/api/skills` | SkillsHandler | Agent discovers capabilities |
| GET/POST | `/api/context` | ContextHandler | Sync UI state / account watcher |
| `*` | `/api/bridge/*` | ProxyHandler | Proxy to Next.js `/api/agent/*` |
| GET/POST | `/api/orders` | OrdersHandler | Engine order book snapshot / place order |
| GET  | `/api/prices` | PricesHandler | All mark prices |
| POST | `/api/price/update` | PricesHandler | Admin: push new mark price |

### Admin / Contract Controller endpoints

All require `Authorization: Bearer $ADMIN_SECRET`.

| Method | Path | Body | Contract call |
|---|---|---|---|
| POST | `/api/admin/settle` | `{userAddr, pnl, tokenAddr}` | `AgentVault.settle_pnl` |
| POST | `/api/admin/position` | `{user, assetSymbol, debtAmount, collateralToken, collateralLocked}` | `LeveragePool.open_synthetic_position` |
| POST | `/api/admin/position/close` | `{user, collateralToken}` | `LeveragePool.close_position` |

`pnl`, `debtAmount`, `collateralLocked` are **human-scale floats** (e.g. `100.5`).
The handler multiplies by `ScaleFactor = 10_000_000` before calling the contract.

---

## 4. Contracts

| Contract | ID (testnet) | Admin-only functions |
|---|---|---|
| AgentVault | `CCNK5O3F…HXJFWG` | `settle_pnl`, `fund_terminal_pool`, `add_supported_token` |
| LeveragePool | `CCNF3JMO…RY7L` | `open_synthetic_position`, `close_position`, `add_collateral_token` |

The TypeScript bindings in `contracts/packages/vault_sdk` and `leverage_sdk`
are used by the **browser** for read calls (`get_balance`, `get_position`) and
**user-signed** write calls (`deposit`, `withdraw`, `deposit_collateral`).

---

## 5. Environment Variables

```
ADMIN_SECRET          Stellar secret key (S…) — enables on-chain settlement
AGENT_VAULT_ID        C… contract address for AgentVault (default: testnet)
LEVERAGE_POOL_ID      C… contract address for LeveragePool (default: testnet)
SETTLEMENT_TOKEN      C… or G… address of the settlement token (default: USDC testnet)
SOROBAN_RPC_URL       Soroban RPC endpoint (default: testnet)
HORIZON_URL           Horizon endpoint (default: testnet)
NETWORK_PASSPHRASE    Stellar network passphrase (default: testnet)
FRONTEND_URL          Next.js base URL (default: http://localhost:3000)
PORT                  HTTP port (default: 8090)
ALLOWED_ORIGIN        CORS allowed origin (default: *)
```

---

## 6. Call Path: Matching Engine → On-Chain Settlement

```
AI Agent
  POST /api/orders { symbol:"XLM/USDC", side:"buy", price:0.11, amount:100, leverage:5 }
      │
      ▼
  Engine.PlaceOrder(order)
      │  fill detected
      ▼
  LiquidationEngine.AddPosition(pos)   ← position now monitored
      │
      │  (5 s later, mark price moved against position)
      ▼
  LiquidationEngine.checkAll()
      │  loss ≥ 90% threshold
      ▼
  settleFunc(ctx, userToken, symbol, pnl=-90.0)
      │
      ▼  (ADMIN_SECRET set)
  soroban.Client.SettleTrade(ctx, userAddr, pnlScaled=-900_000_000, tokenAddr)
      │
      ├─ simulateTransaction  →  footprint + resource fee
      ├─ patch envelope
      ├─ sign with admin keypair
      └─ sendTransaction  →  confirmed on Stellar testnet
```
