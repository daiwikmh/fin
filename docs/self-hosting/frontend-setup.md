# Frontend Setup

The frontend is a Next.js app located in `fin/`.

## Prerequisites

- Node.js 18+
- npm 9+
- agent-bridge running on port 8090

## Install dependencies

```bash
cd fin
npm install
```

## Environment variables

Create `fin/.env.local`:

```env
# Required: URL of the agent-bridge server
NEXT_PUBLIC_AGENT_BRIDGE_URL=http://localhost:8090

# Optional: contract IDs for TypeScript SDK calls (defaults to testnet)
NEXT_PUBLIC_AGENT_VAULT_ID=CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
NEXT_PUBLIC_LEVERAGE_POOL_ID=CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL
```

### Variable reference

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_AGENT_BRIDGE_URL` | `http://localhost:8090` | agent-bridge base URL |
| `NEXT_PUBLIC_AGENT_VAULT_ID` | testnet ID | AgentVault contract address for SDK calls |
| `NEXT_PUBLIC_LEVERAGE_POOL_ID` | testnet ID | LeveragePool contract address for SDK calls |

`NEXT_PUBLIC_` prefix is required — Next.js only exposes env vars with this prefix to the browser.

## Run development server

```bash
cd fin
npm run dev
```

The app is available at `http://localhost:3000`.

## Pages

| URL | Description |
|---|---|
| `/terminal` | Main SDEX trading terminal |
| `/pro` | Admin panel (ContractController + Vault) |
| `/portfolio` | Portfolio overview |

## Production build

```bash
cd fin
npm run build
npm start
```

Or export as static files:
```bash
npm run build
npm run export  # if configured
```

## Key source files

| File | Description |
|---|---|
| `src/app/globals.css` | All CSS styles (~1450 lines, single file) |
| `src/configs/tradingPairs.ts` | Trading pair definitions |
| `src/utils/tradingview.ts` | TradingView symbol mapping |
| `src/utils/wallet.ts` | Freighter wallet hook |
| `src/utils/bridge.ts` | agent-bridge HTTP helpers |
| `src/components/RightSidebar.tsx` | Trade form + AI agent UI |
| `src/components/TradingTerminal.tsx` | Leveraged position UI |
| `src/components/ContractController.tsx` | Admin panel |
| `src/components/UserVault.tsx` | Vault panel |

## Connecting to the AI agent

The right sidebar's **Agent** tab → **OpenClaw** connects to agent-bridge automatically using `NEXT_PUBLIC_AGENT_BRIDGE_URL`. Ensure the bridge is running before clicking "Connect OpenClaw".

## TypeScript SDK

The frontend uses generated SDK bindings from `contracts/packages/`:
- `vault_sdk` — AgentVault read/write calls via Freighter
- `leverage_sdk` — LeveragePool read/write calls via Freighter

These are imported directly in components and do not go through agent-bridge.
