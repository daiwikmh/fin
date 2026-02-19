# Contract Integration Guide

How to integrate ZK Auth, Agent Vault, and Leverage Pool into the frontend and agent bridge.

---

## Deployment Order

Contracts must be deployed in this order (each depends on the previous):

```
1. ZK Auth          (standalone)
2. Agent Vault      (needs ZK Auth address)
3. Leverage Pool    (needs ZK Auth address + Oracle address)
```

```bash
# Build all
cd contracts && stellar contract build

# Deploy (testnet example)
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/zk_auth.wasm \
  --network testnet --source admin

stellar contract deploy --wasm target/wasm32-unknown-unknown/release/agent_vault.wasm \
  --network testnet --source admin

stellar contract deploy --wasm target/wasm32-unknown-unknown/release/leverage_pool.wasm \
  --network testnet --source admin
```

After deploy, initialize each:

```bash
# 1. ZK Auth
stellar contract invoke --id $ZKAUTH_ID -- initialize \
  --admin $ADMIN_ADDRESS \
  --verifying_key '{"alpha_g1":"...","beta_g2":"...","gamma_g2":"...","delta_g2":"...","ic":["...","..."]}'

# 2. Agent Vault
stellar contract invoke --id $VAULT_ID -- initialize \
  --admin $ADMIN_ADDRESS \
  --zkauth_contract $ZKAUTH_ID

# Then whitelist tokens
stellar contract invoke --id $VAULT_ID -- add_supported_token \
  --caller $ADMIN_ADDRESS \
  --token_sac $USDC_SAC_ADDRESS

# 3. Leverage Pool
stellar contract invoke --id $POOL_ID -- initialize \
  --admin $ADMIN_ADDRESS \
  --pool_asset $USDC_SAC_ADDRESS \
  --oracle_contract $ORACLE_ID \
  --zkauth_contract $ZKAUTH_ID \
  --borrow_rate_bps 500 \
  --liquidation_bonus_bps 500 \
  --max_leverage_bps 100000 \
  --min_health_bps 10000

# Then add collateral types
stellar contract invoke --id $POOL_ID -- set_collateral_type \
  --caller $ADMIN_ADDRESS \
  --token $XLM_SAC_ADDRESS \
  --config '{"collateral_factor_bps":7500,"price_feed_key":"XLM","is_active":true}'
```

---

## Frontend Integration

### 1. Config — Contract Addresses

Create `fin/src/configs/contracts.ts`:

```typescript
import type { NetworkId } from '@/configs/assets';

export interface ContractAddresses {
  zkAuth: string;
  agentVault: string;
  leveragePool: string;
  oracle: string;
}

const CONTRACTS: Record<NetworkId, ContractAddresses> = {
  TESTNET: {
    zkAuth: 'CABC...', // deployed ZK Auth contract ID
    agentVault: 'CDEF...', // deployed Agent Vault contract ID
    leveragePool: 'CGHI...', // deployed Leverage Pool contract ID
    oracle: 'CJKL...', // oracle contract ID
  },
  MAINNET: {
    zkAuth: '...',
    agentVault: '...',
    leveragePool: '...',
    oracle: '...',
  },
};

export function getContracts(): ContractAddresses {
  const { getCurrentNetworkId } = require('@/configs/assets');
  return CONTRACTS[getCurrentNetworkId()];
}
```

### 2. Service — Contract Clients

Create `fin/src/services/contract.service.ts`:

```typescript
import * as StellarSdk from 'stellar-sdk';
import { getNetwork } from '@/configs/assets';
import { getContracts } from '@/configs/contracts';

const BASE_FEE = '100';
const TIMEBOUND = 30;

function horizon() {
  return new StellarSdk.Horizon.Server(getNetwork().horizonUrl);
}

// ── ZK Auth ────────────────────────────────────────────────────────────

/** Build start_session tx. User signs this with Freighter. */
export async function buildStartSession(
  userAccountId: string,
  agentPubkey: string,       // 32-byte hex
  poseidonHash: string,      // 32-byte hex
  durationLedgers: number,   // 720–17280
  proof: { a: string; b: string; c: string }, // hex-encoded
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(userAccountId);
  const network = getNetwork();
  const contracts = getContracts();

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.invokeContractFunction({
        contract: contracts.zkAuth,
        function: 'start_session',
        args: [
          StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
          StellarSdk.nativeToScVal(Buffer.from(agentPubkey, 'hex'), { type: 'bytes' }),
          StellarSdk.nativeToScVal(Buffer.from(poseidonHash, 'hex'), { type: 'bytes' }),
          StellarSdk.nativeToScVal(durationLedgers, { type: 'u32' }),
          // proof struct — see ZKProof type
          StellarSdk.xdr.ScVal.scvMap([
            new StellarSdk.xdr.ScMapEntry({
              key: StellarSdk.xdr.ScVal.scvSymbol('a'),
              val: StellarSdk.nativeToScVal(Buffer.from(proof.a, 'hex'), { type: 'bytes' }),
            }),
            new StellarSdk.xdr.ScMapEntry({
              key: StellarSdk.xdr.ScVal.scvSymbol('b'),
              val: StellarSdk.nativeToScVal(Buffer.from(proof.b, 'hex'), { type: 'bytes' }),
            }),
            new StellarSdk.xdr.ScMapEntry({
              key: StellarSdk.xdr.ScVal.scvSymbol('c'),
              val: StellarSdk.nativeToScVal(Buffer.from(proof.c, 'hex'), { type: 'bytes' }),
            }),
          ]),
        ],
      }),
    )
    .setTimeout(TIMEBOUND)
    .build();

  return tx.toXDR();
}

/** Read-only: check if session is valid. */
export async function isSessionValid(userAccountId: string): Promise<boolean> {
  const server = horizon();
  const contracts = getContracts();
  const network = getNetwork();

  const contract = new StellarSdk.Contract(contracts.zkAuth);
  const tx = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(userAccountId, '0'),
    { fee: BASE_FEE, networkPassphrase: network.networkPassphrase },
  )
    .addOperation(contract.call('is_session_valid',
      StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  const response = await server.simulateTransaction(tx);
  if ('result' in response && response.result) {
    return StellarSdk.scValToNative(response.result.retval) as boolean;
  }
  return false;
}

/** Build invalidate_session tx. User signs this. */
export async function buildInvalidateSession(
  userAccountId: string,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(userAccountId);
  const network = getNetwork();
  const contracts = getContracts();

  const contract = new StellarSdk.Contract(contracts.zkAuth);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call('invalidate_session',
      StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  return tx.toXDR();
}

// ── Agent Vault ────────────────────────────────────────────────────────

/** Build deposit tx. User signs this. */
export async function buildVaultDeposit(
  userAccountId: string,
  tokenSac: string,
  amount: bigint,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(userAccountId);
  const network = getNetwork();
  const contracts = getContracts();

  const contract = new StellarSdk.Contract(contracts.agentVault);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call('deposit',
      StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenSac, { type: 'address' }),
      StellarSdk.nativeToScVal(amount, { type: 'i128' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  return tx.toXDR();
}

/** Build withdraw tx. User signs this. */
export async function buildVaultWithdraw(
  userAccountId: string,
  tokenSac: string,
  amount: bigint,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(userAccountId);
  const network = getNetwork();
  const contracts = getContracts();

  const contract = new StellarSdk.Contract(contracts.agentVault);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call('withdraw',
      StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenSac, { type: 'address' }),
      StellarSdk.nativeToScVal(amount, { type: 'i128' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  return tx.toXDR();
}

/** Read-only: get vault balance. */
export async function getVaultBalance(
  userAccountId: string,
  tokenSac: string,
): Promise<bigint> {
  const server = horizon();
  const contracts = getContracts();
  const network = getNetwork();

  const contract = new StellarSdk.Contract(contracts.agentVault);
  const tx = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(userAccountId, '0'),
    { fee: BASE_FEE, networkPassphrase: network.networkPassphrase },
  )
    .addOperation(contract.call('get_balance',
      StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenSac, { type: 'address' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  const response = await server.simulateTransaction(tx);
  if ('result' in response && response.result) {
    return StellarSdk.scValToNative(response.result.retval) as bigint;
  }
  return 0n;
}

// ── Leverage Pool ──────────────────────────────────────────────────────

/** Build LP deposit tx. LP signs this. */
export async function buildLpDeposit(
  lpAccountId: string,
  amount: bigint,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(lpAccountId);
  const network = getNetwork();
  const contracts = getContracts();

  const contract = new StellarSdk.Contract(contracts.leveragePool);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call('lp_deposit',
      StellarSdk.nativeToScVal(lpAccountId, { type: 'address' }),
      StellarSdk.nativeToScVal(amount, { type: 'i128' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  return tx.toXDR();
}

/** Build collateral deposit tx. User signs this. */
export async function buildDepositCollateral(
  userAccountId: string,
  tokenAddress: string,
  amount: bigint,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(userAccountId);
  const network = getNetwork();
  const contracts = getContracts();

  const contract = new StellarSdk.Contract(contracts.leveragePool);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call('deposit_collateral',
      StellarSdk.nativeToScVal(userAccountId, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(amount, { type: 'i128' }),
    ))
    .setTimeout(TIMEBOUND)
    .build();

  return tx.toXDR();
}
```

### 3. Action Layer

Create `fin/src/actions/contracts.ts`:

```typescript
import type { SignFn, UnsignedTx, TransactionResult } from '@/types/sdex.types';
import { getNetwork } from '@/configs/assets';
import { signAndSubmitTransaction } from '@/services/sdex.service';
import {
  buildStartSession,
  buildInvalidateSession,
  buildVaultDeposit,
  buildVaultWithdraw,
  buildLpDeposit,
  buildDepositCollateral,
  isSessionValid,
  getVaultBalance,
} from '@/services/contract.service';

// ── Build-only (used by agent API routes) ──────────────────────────────

export async function buildStartSessionXdr(params: {
  accountId: string;
  agentPubkey: string;
  poseidonHash: string;
  durationLedgers: number;
  proof: { a: string; b: string; c: string };
}): Promise<UnsignedTx> {
  const xdr = await buildStartSession(
    params.accountId, params.agentPubkey, params.poseidonHash,
    params.durationLedgers, params.proof,
  );
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

export async function buildVaultDepositXdr(params: {
  accountId: string;
  tokenSac: string;
  amount: bigint;
}): Promise<UnsignedTx> {
  const xdr = await buildVaultDeposit(params.accountId, params.tokenSac, params.amount);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

export async function buildVaultWithdrawXdr(params: {
  accountId: string;
  tokenSac: string;
  amount: bigint;
}): Promise<UnsignedTx> {
  const xdr = await buildVaultWithdraw(params.accountId, params.tokenSac, params.amount);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

export async function buildLpDepositXdr(params: {
  accountId: string;
  amount: bigint;
}): Promise<UnsignedTx> {
  const xdr = await buildLpDeposit(params.accountId, params.amount);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

export async function buildDepositCollateralXdr(params: {
  accountId: string;
  token: string;
  amount: bigint;
}): Promise<UnsignedTx> {
  const xdr = await buildDepositCollateral(params.accountId, params.token, params.amount);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

// ── Full sign+submit (used by UI with Freighter) ──────────────────────

export async function startSession(params: {
  accountId: string;
  agentPubkey: string;
  poseidonHash: string;
  durationLedgers: number;
  proof: { a: string; b: string; c: string };
  signFn: SignFn;
}): Promise<TransactionResult> {
  const { xdr } = await buildStartSessionXdr(params);
  return signAndSubmitTransaction(xdr, params.signFn);
}

export async function vaultDeposit(params: {
  accountId: string;
  tokenSac: string;
  amount: bigint;
  signFn: SignFn;
}): Promise<TransactionResult> {
  const { xdr } = await buildVaultDepositXdr(params);
  return signAndSubmitTransaction(xdr, params.signFn);
}

export async function vaultWithdraw(params: {
  accountId: string;
  tokenSac: string;
  amount: bigint;
  signFn: SignFn;
}): Promise<TransactionResult> {
  const { xdr } = await buildVaultWithdrawXdr(params);
  return signAndSubmitTransaction(xdr, params.signFn);
}

// ── Read-only (used by both UI and agent API) ──────────────────────────

export { isSessionValid, getVaultBalance };
```

### 4. API Routes for Agent

These follow the same pattern as the SDEX routes:

```
fin/src/app/api/agent/
├── session/
│   ├── status/route.ts      # GET  — check session validity
│   └── start/route.ts       # POST — build start_session XDR
├── vault/
│   ├── balance/route.ts     # GET  — get vault balance
│   ├── deposit/route.ts     # POST — build vault deposit XDR
│   └── withdraw/route.ts    # POST — build vault withdraw XDR
├── pool/
│   ├── stats/route.ts       # GET  — pool stats
│   ├── position/route.ts    # GET  — get position
│   ├── health/route.ts      # GET  — health ratio
│   ├── deposit/route.ts     # POST — build collateral deposit XDR
│   └── withdraw/route.ts    # POST — build collateral withdraw XDR
```

Example route (`session/status/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/actions/contracts';

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json({ error: 'Missing ?account=' }, { status: 400 });
  }
  try {
    const valid = await isSessionValid(account);
    return NextResponse.json({ account, valid });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

Example route (`vault/deposit/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { buildVaultDepositXdr } from '@/actions/contracts';

export async function POST(req: NextRequest) {
  try {
    const { account, token, amount } = await req.json();
    if (!account || !token || !amount) {
      return NextResponse.json(
        { error: 'Missing: account, token, amount' },
        { status: 400 },
      );
    }
    const result = await buildVaultDepositXdr({
      accountId: account,
      tokenSac: token,
      amount: BigInt(amount),
    });
    return NextResponse.json({
      xdr: result.xdr,
      networkPassphrase: result.networkPassphrase,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

### 5. Skills Manifest Update

Add to `agent-bridge/internal/handler/skills.go`:

```go
// ── ZK Auth skills ──
{
    Name:        "session_status",
    Description: "Check if user has a valid ZK Auth agent session",
    Method:      "GET",
    Path:        "/api/bridge/session/status",
    Params:      map[string]string{"account": "Stellar account ID (G...)"},
},
{
    Name:        "start_session",
    Description: "Build unsigned start_session tx (ZK proof required). Returns XDR.",
    Method:      "POST",
    Path:        "/api/bridge/session/start",
    Params:      map[string]string{
        "account":        "Stellar account ID (G...)",
        "agentPubkey":    "Agent ed25519 pubkey (64-char hex)",
        "poseidonHash":   "Poseidon hash of secret (64-char hex)",
        "durationLedgers":"Session duration in ledgers (720-17280)",
        "proof":          "ZK proof object {a, b, c} hex-encoded",
    },
},

// ── Agent Vault skills ──
{
    Name:        "vault_balance",
    Description: "Get user's token balance in the Agent Vault",
    Method:      "GET",
    Path:        "/api/bridge/vault/balance",
    Params:      map[string]string{"account": "Stellar account ID", "token": "SAC token address"},
},
{
    Name:        "vault_deposit",
    Description: "Build unsigned vault deposit tx. Returns XDR.",
    Method:      "POST",
    Path:        "/api/bridge/vault/deposit",
    Params:      map[string]string{"account": "Stellar account ID", "token": "SAC token address", "amount": "Amount in stroops (i128)"},
},
{
    Name:        "vault_withdraw",
    Description: "Build unsigned vault withdraw tx. Returns XDR.",
    Method:      "POST",
    Path:        "/api/bridge/vault/withdraw",
    Params:      map[string]string{"account": "Stellar account ID", "token": "SAC token address", "amount": "Amount in stroops (i128)"},
},

// ── Leverage Pool skills ──
{
    Name:        "pool_stats",
    Description: "Get leverage pool stats (liquidity, borrowed, utilization)",
    Method:      "GET",
    Path:        "/api/bridge/pool/stats",
},
{
    Name:        "pool_position",
    Description: "Get user's open leveraged position",
    Method:      "GET",
    Path:        "/api/bridge/pool/position",
    Params:      map[string]string{"account": "Stellar account ID"},
},
{
    Name:        "pool_health",
    Description: "Get health ratio for user's position (10000 = 1.0x)",
    Method:      "GET",
    Path:        "/api/bridge/pool/health",
    Params:      map[string]string{"account": "Stellar account ID"},
},
{
    Name:        "deposit_collateral",
    Description: "Build unsigned collateral deposit tx. Returns XDR.",
    Method:      "POST",
    Path:        "/api/bridge/pool/deposit",
    Params:      map[string]string{"account": "Stellar account ID", "token": "Collateral token address", "amount": "Amount in stroops"},
},
```

---

## Full User Flow — Frontend

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Freighter)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User generates ZK proof (off-chain, circom/snarkjs)     │
│     - Input: user secret                                    │
│     - Output: poseidon_hash + groth16 proof {a, b, c}       │
│                                                             │
│  2. User starts session (signs with Freighter)               │
│     startSession({                                          │
│       accountId, agentPubkey, poseidonHash,                 │
│       durationLedgers: 17280, proof, signFn                 │
│     })                                                      │
│     → calls ZKAuth.start_session on-chain                   │
│                                                             │
│  3. User deposits into vault (signs with Freighter)          │
│     vaultDeposit({ accountId, tokenSac, amount, signFn })   │
│     → calls AgentVault.deposit on-chain                     │
│                                                             │
│  4. Agent now has a valid session and user has funds          │
│     in the vault. Agent can:                                │
│     - agent_withdraw (move funds to DEX)                    │
│     - agent_return_funds (credit funds back)                │
│     - open_position / close_position (leverage)             │
│                                                             │
│  5. User can kill session anytime                            │
│     invalidateSession({ accountId, signFn })                │
│                                                             │
│  6. User can withdraw from vault anytime                     │
│     vaultWithdraw({ accountId, tokenSac, amount, signFn })  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Full Agent Flow — OpenClaw via Bridge

```
┌─────────────────────────────────────────────────────────────┐
│              AGENT (OpenClaw via Bridge API)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Discover skills                                         │
│     GET /api/skills → lists all read + write skills         │
│                                                             │
│  2. Check session                                           │
│     GET /api/bridge/session/status?account=G...             │
│     → { valid: true }                                       │
│                                                             │
│  3. Read market data                                        │
│     GET /api/bridge/orderbook?symbol=XLM/USDC              │
│     GET /api/bridge/price?symbol=XLM/USDC                  │
│                                                             │
│  4. Build trade transaction                                 │
│     POST /api/bridge/order/limit                            │
│     Body: { account, symbol, side, amount, price }          │
│     → { xdr: "...", networkPassphrase: "..." }              │
│                                                             │
│  5. Sign with agent keypair (ed25519 from ZK Auth session)  │
│     Agent has its own Stellar keypair registered in         │
│     start_session. Signs XDR locally.                       │
│                                                             │
│  6. Submit signed transaction                               │
│     POST /api/bridge/tx/submit                              │
│     Body: { signedXdr: "..." }                              │
│     → { success: true, txHash: "..." }                      │
│                                                             │
│  For vault operations (agent_withdraw, agent_return):       │
│  Same build → sign → submit pattern via vault skills.       │
│                                                             │
│  For leverage (open_position, close_position):              │
│  Same build → sign → submit pattern via pool skills.        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Who Signs What

| Operation | Who Signs | Auth Check |
|-----------|-----------|------------|
| `start_session` | User (Freighter) | `user.require_auth()` |
| `invalidate_session` | User (Freighter) | `user.require_auth()` |
| `deposit` (vault) | User (Freighter) | `user.require_auth()` |
| `withdraw` (vault) | User (Freighter) | `user.require_auth()` |
| `agent_withdraw` | Agent (ed25519 key) | ZKAuth cross-contract check + `agent_addr.require_auth()` |
| `agent_return_funds` | Agent (ed25519 key) | ZKAuth cross-contract check + `agent_addr.require_auth()` |
| `deposit_collateral` | User (Freighter) | `user.require_auth()` |
| `withdraw_collateral` | User (Freighter) | `user.require_auth()` |
| `open_position` | Agent (ed25519 key) | ZKAuth cross-contract check + `agent_addr.require_auth()` |
| `close_position` | Agent (ed25519 key) | ZKAuth cross-contract check + `agent_addr.require_auth()` |
| `accrue_interest` | Anyone | Permissionless |
| `liquidate` | Anyone (liquidator) | Permissionless (pays debt, gets collateral) |

## UI Components Needed

| Component | Purpose | Contract Calls |
|-----------|---------|----------------|
| **SessionPanel** | Start/kill ZK session, show status | `isSessionValid`, `startSession`, `invalidateSession` |
| **VaultPanel** | Deposit/withdraw funds, show balances | `getVaultBalance`, `vaultDeposit`, `vaultWithdraw` |
| **LeveragePanel** | View position, health, pool stats | `getPosition`, `getHealthRatio`, `getPoolStats` |
| **LPPanel** | Deposit/withdraw liquidity | `lpDeposit`, `lpWithdraw`, `getLpValue` |

Each panel follows the same pattern:
1. Read state via `simulateTransaction` (no signing needed)
2. Build unsigned XDR via `build*Xdr()` function
3. Sign via Freighter (`signFn`)
4. Submit via `signAndSubmitTransaction()`
