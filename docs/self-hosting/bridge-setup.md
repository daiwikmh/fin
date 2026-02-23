# Bridge Setup

The agent-bridge is a Go HTTP server. This page covers environment variables, building, and running.

## Clone and enter the directory

```bash
git clone https://github.com/your-org/stoxy.git
cd stoxy/agent-bridge
```

## Environment variables

Create a `.env` file in `agent-bridge/`:

```env
# Required for on-chain admin operations
ADMIN_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Contract IDs (defaults shown — testnet)
AGENT_VAULT_ID=CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
LEVERAGE_POOL_ID=CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL

# Settlement token (testnet USDC)
SETTLEMENT_TOKEN=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC

# Stellar network endpoints (defaults shown — testnet)
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Frontend URL (for CORS and proxy)
FRONTEND_URL=http://localhost:3000

# HTTP server
PORT=8090
ALLOWED_ORIGIN=*
```

### Variable reference

| Variable | Default | Description |
|---|---|---|
| `ADMIN_SECRET` | (none) | Stellar secret key (`S...`) for signing admin transactions. If unset, admin endpoints are open (dev mode). |
| `AGENT_VAULT_ID` | testnet ID | AgentVault contract address |
| `LEVERAGE_POOL_ID` | testnet ID | LeveragePool contract address |
| `SETTLEMENT_TOKEN` | testnet USDC | Default collateral/settlement token |
| `SOROBAN_RPC_URL` | testnet RPC | Soroban RPC endpoint |
| `HORIZON_URL` | testnet Horizon | Horizon REST endpoint |
| `NETWORK_PASSPHRASE` | testnet passphrase | Stellar network passphrase |
| `FRONTEND_URL` | `http://localhost:3000` | Next.js base URL (used as proxy target) |
| `PORT` | `8090` | HTTP listen port |
| `ALLOWED_ORIGIN` | `*` | CORS allowed origin |

## Secure secret injection (recommended)

Instead of plain secrets in `.env`, use 1Password references:

```env
ADMIN_SECRET=op://StellarTrading/AdminKey/credential
```

Then start with:
```bash
op run --env-file=.env -- /usr/local/go/bin/go run .
```

See [1Password for Operators](1password-ops.md) for the full setup.

## Build

```bash
cd agent-bridge
/usr/local/go/bin/go build ./...
```

Or build a standalone binary:
```bash
/usr/local/go/bin/go build -o app .
```

## Run (development)

```bash
cd agent-bridge
export $(cat .env | xargs) && /usr/local/go/bin/go run .
```

Or with 1Password:
```bash
op run --env-file=.env -- /usr/local/go/bin/go run .
```

The server starts on `http://localhost:8090`.

## Run (compiled binary)

```bash
cd agent-bridge
/usr/local/go/bin/go build -o app .
op run --env-file=.env -- ./app
```

## Verify it's running

```bash
curl http://localhost:8090/api/prices
# {"XLM/USDC":0}  (or current prices if oracle is connected)
```

## Build tags for deployment

For production builds (e.g. Leapcell), use:
```bash
go build -tags netgo -ldflags '-s -w' -o app .
```

`-tags netgo` statically links the DNS resolver; `-ldflags '-s -w'` strips debug symbols for a smaller binary.
