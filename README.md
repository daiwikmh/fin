# STOX: Smart trading on XLM

A full-stack, AI-powered leveraged trading protocol built on **Stellar Soroban**. This platform allows users to take synthetic long/short positions on XLM/USDC priced from the real SDEX order book, with P&L and collateral managed autonomously by on-chain smart contracts and a Go-based agent bridge.

---

## 🏗 Architecture Overview

The system architecture ensures security by separating user-signed operations from privileged administrative actions through a dedicated bridge.



* **Next.js Frontend (`fin/`):** The trading interface (Terminal, Pro, Portfolio) where users connect Freighter wallets and interact with the AI agent.
* **Agent Bridge (Go):** The "Brain" of the operation. It holds the admin secret key, runs the matching engine, calculates liquidations, and polls Horizon for SDEX prices.
* **Stellar Testnet (Soroban):** The source of truth where the `AgentVault` and `LeveragePool` contracts reside.

---

## 📜 Smart Contracts (Soroban Testnet)

All monetary values are stored as `i128` integers with **7 decimal places** ($1 \text{ USDC} = 10,000,000$).

### 1. AgentVault
**Address:** `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG`
The primary treasury. Holds USDC deposited by all participants.
* `deposit` / `withdraw`: User-signed liquidity management.
* `settle_pnl`: Admin-only function to credit/debit users based on trade outcomes.

### 2. LeveragePool
**Address:** `CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L`
Tracks open leveraged positions and manages collateral locking.
* `open_synthetic_position`: Admin-only; locks collateral and records entry price.
* `close_position`: Admin-only; clears the on-chain position record.

### 3. Settlement Token (USDC SAC)
**Address:** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
The Stellar Asset Contract (SAC) wrapping classic USDC on testnet.

---

## ⚡ Key Components

### Agent Bridge (Go Backend)
* **Matching Engine:** Internal central-limit order book with price-time priority.
* **Liquidation Engine:** Runs every 5s. Triggers a full collateral seizure if a position hits **90% loss**.
* **SDEX Oracle:** Polls Horizon for XLM/USDC mid-prices to provide accurate "Mark Prices" for synthetic positions.

### AI Agent Integration
The frontend proxies to an LLM (via OpenRouter) which receives a live stream of data from the bridge:
* Real-time order book updates.
* User wallet context and transaction history.
* Market volatility events via SSE.

---

## 📊 Leveraged Position Lifecycle

1.  **Open:** User sends a request to the Bridge. The Bridge fetches the SDEX mid-price, calculates required margin, and calls `LeveragePool.open_synthetic_position` using the admin key.
2.  **Monitor:** The Liquidation Engine tracks the position against live SDEX prices.
3.  **Close:** User closes the position. The Bridge calculates P&L:
    $$\text{pnl} = (\text{closePrice} - \text{entryPrice}) \times \text{xlmAmount}$$
4.  **Settle:** The Bridge calls `AgentVault.settle_pnl` to update the user's balance and `close_position` to release the record.

---

## 🛠 Design Decisions

* **Synthetic over Physical:** We use synthetic positions to avoid the friction of classic SDEX swaps, providing identical economic exposure without asset fragmentation.
* **Go for Security:** The admin secret key never touches the browser; all privileged contract calls are gated behind the Go server.
* **Raw JSON-RPC:** Frontend submissions use raw `fetch` to bypass `stellar-base` XDR parsing limitations with Protocol 22 types ("Bad union switch: 4").

---

## 🚀 Getting Started

### 1. Environment Variables

**Bridge (`stellar/agent-bridge/.env`):**
```env
ADMIN_SECRET=S... (Your Admin Secret Key)
SOROBAN_RPC_URL=[https://soroban-testnet.stellar.org](https://soroban-testnet.stellar.org)
HORIZON_URL=[https://horizon-testnet.stellar.org](https://horizon-testnet.stellar.org)
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
AGENT_VAULT_ID=CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
LEVERAGE_POOL_ID=CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L
SETTLEMENT_TOKEN=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
PORT=8090