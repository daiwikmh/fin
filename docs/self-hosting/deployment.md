# Deployment

This page documents deployment to [Leapcell](https://leapcell.io), a platform-as-a-service that works well for Go HTTP servers. The same principles apply to other PaaS providers (Render, Railway, Fly.io).

## Leapcell deployment (agent-bridge)

### Repository settings

| Field | Value |
|---|---|
| Root directory | `.` (repo root, not `agent-bridge/`) |
| Build command | `cd agent-bridge && go build -tags netgo -ldflags '-s -w' -o app .` |
| Start command | `./agent-bridge/app` |
| Port | `8090` |

The binary is built inside `agent-bridge/` but the output path is relative to the repo root, so the start command is `./agent-bridge/app`.

### Environment variables in Leapcell

Set these in the Leapcell dashboard under **Environment Variables**:

| Variable | Value |
|---|---|
| `ADMIN_SECRET` | Your Stellar admin secret key |
| `AGENT_VAULT_ID` | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` |
| `LEVERAGE_POOL_ID` | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` |
| `SETTLEMENT_TOKEN` | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `FRONTEND_URL` | Your Vercel/Netlify frontend URL |
| `PORT` | `8090` |
| `ALLOWED_ORIGIN` | Your frontend origin (e.g. `https://your-app.vercel.app`) |

> Set `ADMIN_SECRET` as a secret variable (not plain text) in the Leapcell dashboard.

### Build command explained

```bash
cd agent-bridge && go build -tags netgo -ldflags '-s -w' -o app .
```

| Flag | Purpose |
|---|---|
| `-tags netgo` | Statically link the DNS resolver (no libc dependency) |
| `-ldflags '-s -w'` | Strip debug symbols and DWARF info (smaller binary) |
| `-o app` | Output binary named `app` |

### Verify deployment

After deploying, call the health endpoint:

```bash
curl https://your-bridge.leapcell.app/api/prices
# {"XLM/USDC":0}
```

---

## Frontend deployment (fin/)

The Next.js frontend deploys well on Vercel.

### Vercel settings

| Field | Value |
|---|---|
| Root directory | `fin` |
| Framework preset | Next.js |
| Build command | `npm run build` |
| Output directory | `.next` |

### Environment variables in Vercel

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_AGENT_BRIDGE_URL` | Your Leapcell bridge URL |
| `NEXT_PUBLIC_AGENT_VAULT_ID` | AgentVault contract ID |
| `NEXT_PUBLIC_LEVERAGE_POOL_ID` | LeveragePool contract ID |

---

## Docker

A `Dockerfile` is included for containerised deployments:

```bash
# Build
docker build -t stoxy-bridge .

# Run
docker run -p 8090:8090 \
  -e ADMIN_SECRET=SXXX... \
  -e FRONTEND_URL=http://localhost:3000 \
  stoxy-bridge
```

---

## CORS configuration

In production, set `ALLOWED_ORIGIN` to your exact frontend URL:

```env
ALLOWED_ORIGIN=https://your-app.vercel.app
```

Leaving it as `*` allows any origin — acceptable for development but not recommended for production.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `binary not found` | Check that build command output path matches start command |
| `CORS error in browser` | Set `ALLOWED_ORIGIN` to the exact frontend origin |
| `simulate: unauthorized` | `ADMIN_SECRET` is wrong or missing |
| `tx_bad_seq` on every call | Clock skew between server and Stellar — check server time |
| `confirmation timeout` | Stellar network may be congested; check Stellar status page |
