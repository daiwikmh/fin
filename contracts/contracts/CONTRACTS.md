# Stellar Soroban Contracts

Three Soroban smart contracts that together power ZK-authenticated agent trading on Stellar.

---

## Architecture Overview

```
User (wallet)
    │
    ├── ZK Proof ──► [ZK Auth] ──► Session (agent_pubkey, expiry)
    │                    ▲
    │                    │ is_session_valid() / get_agent_pubkey()
    │                    │
    ├── deposit ──► [Agent Vault] ◄── agent_withdraw / agent_return_funds (Agent)
    │                    │
    │                    │ funds flow
    │                    ▼
    └── collateral ► [Leverage Pool] ◄── open_position / close_position (Agent)
                         │
                         ├── LP deposits (liquidity providers)
                         ├── Oracle price feeds
                         └── Permissionless liquidation
```

**Flow**: User proves identity via ZK proof → creates a session → agent (identified by ed25519 pubkey) can operate on user's behalf within the session window.

---

## 1. ZK Auth (`zk_auth`)

**Purpose**: Session management with Groth16 ZK proof verification. The single source of truth for "is this agent allowed to act for this user?"

**Size**: ~310 lines (with tests)

### Storage
| Key | Type | Description |
|-----|------|-------------|
| `Admin` | `Address` | Protocol admin |
| `VerifyingKey` | `StoredVK` | Groth16 verifying key (alpha, beta, gamma, delta, IC points) |
| `ActiveSession(user)` | `Session` | Current session per user |
| `SessionCounter(user)` | `u64` | Monotonic session ID counter |

### Functions
| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin, vk)` | None (one-time) | Sets admin + verifying key |
| `start_session(user, agent_pubkey, poseidon_hash, duration, proof)` | User | Verifies ZK proof, creates session (720-17280 ledgers / ~1-24h) |
| `invalidate_session(user)` | User | Kills active session immediately |
| `is_session_valid(user)` | None | Returns bool — called by AgentVault & LeveragePool |
| `get_agent_pubkey(user)` | None | Returns agent's ed25519 pubkey if session valid |
| `get_session(user)` | None | Full session struct |
| `get_time_remaining(user)` | None | Ledgers until expiry |

### Key Design Decisions
- **One session per user** — new session replaces old one instantly
- **ZK verification only at session start** — other contracts just call `is_session_valid()`
- **Groth16 on BN254** — uses Soroban's native `crypto::bn254` pairing check
- **Mocked in tests** — `verify_groth16` is a no-op under `#[cfg(test)]`

---

## 2. Agent Vault (`agent_vault`)

**Purpose**: Custodial vault for user funds. Users deposit tokens; authorized agents can move them for trading.

**Size**: ~280 lines (with tests)

### Storage
| Key | Type | Description |
|-----|------|-------------|
| `Admin` | `Address` | Protocol admin |
| `ZKAuthContract` | `Address` | ZK Auth contract address |
| `Balance(user, token)` | `i128` | Per-user per-token balance |
| `SupportedToken(token)` | `bool` | Token whitelist |

### Functions
| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin, zkauth)` | None (one-time) | Sets admin + ZKAuth address |
| `add_supported_token(caller, token)` | Admin | Whitelist a SAC token |
| `remove_supported_token(caller, token)` | Admin | Delist a token |
| `deposit(user, token, amount)` | User | Deposit supported token into vault |
| `withdraw(user, token, amount)` | User | Withdraw own funds |
| `agent_withdraw(user, token, amount, dest)` | Agent (ZKAuth) | Agent moves user funds to destination |
| `agent_return_funds(user, token, amount)` | Agent (ZKAuth) | Agent credits funds back after trade |
| `get_balance(user, token)` | None | Single balance query |
| `get_all_balances(user, tokens)` | None | Batch balance query |

### Key Design Decisions
- **Agent auth via ZKAuth cross-contract call** — checks `is_session_valid()` + `get_agent_pubkey()`, then requires agent's ed25519 signature
- **Token whitelist** — only admin-approved SAC tokens can be deposited
- **Withdraw doesn't require token to be supported** — users can always withdraw existing balances

---

## 3. Leverage Pool (`leverage_pool`)

**Purpose**: Lending pool for leveraged trading. LPs provide liquidity, traders borrow against collateral, positions can be liquidated.

**Size**: ~905 lines (with tests)

### Storage
| Key | Type | Description |
|-----|------|-------------|
| `Admin` | `Address` | Protocol admin |
| `PoolAsset` | `Address` | Base asset (e.g., USDC) |
| `OracleContract` | `Address` | Price oracle address |
| `ZKAuthContract` | `Address` | ZK Auth address |
| `TotalLiquidity` | `i128` | Pool liquidity |
| `TotalBorrowed` | `i128` | Outstanding borrows |
| `TotalShares` | `i128` | LP share supply |
| `LPShares(lp)` | `i128` | Per-LP shares |
| `TraderPosition(user)` | `Position` | One position per trader |
| `CollateralBalance(user, token)` | `i128` | Deposited collateral |
| `CollateralConfig(token)` | `CollateralConfig` | Collateral parameters |
| `BorrowRateBps` | `u32` | Interest rate (bps per INTEREST_PERIOD) |
| `LiquidationBonusBps` | `u32` | Liquidator bonus |
| `MaxLeverageBps` | `u32` | Max leverage |
| `MinHealthBps` | `u32` | Liquidation threshold |

### Functions

**Admin:**
| Function | Description |
|----------|-------------|
| `initialize(...)` | Sets all config (admin, pool asset, oracle, zkauth, rates) |
| `add_collateral_type(caller, token, config)` | Register collateral with factor + oracle key |
| `update_collateral_config(caller, token, config)` | Update collateral params |

**Liquidity Providers:**
| Function | Auth | Description |
|----------|------|-------------|
| `lp_deposit(lp, amount)` | LP | Deposit pool asset, receive proportional shares |
| `lp_withdraw(lp, shares)` | LP | Redeem shares for pool asset (if liquidity available) |

**Traders (collateral):**
| Function | Auth | Description |
|----------|------|-------------|
| `deposit_collateral(user, token, amount)` | User | Deposit collateral token |
| `withdraw_collateral(user, token, amount)` | User | Withdraw collateral (health check if position open) |

**Traders (positions):**
| Function | Auth | Description |
|----------|------|-------------|
| `open_position(user, token, borrow, direction)` | Agent (ZKAuth) | Open leveraged position |
| `close_position(user)` | Agent (ZKAuth) | Close position, settle PnL |

**Maintenance:**
| Function | Auth | Description |
|----------|------|-------------|
| `accrue_interest(user)` | Permissionless | Accrue interest on a position |
| `liquidate(liquidator, user)` | Permissionless | Liquidate unhealthy position |

**Read-only:**
| Function | Description |
|----------|-------------|
| `get_health_ratio(user)` | Position health (10000 = 1.0x) |
| `get_position(user)` | Full position struct |
| `get_pool_stats()` | Pool totals, utilization, borrow rate |
| `get_lp_value(lp)` | LP's share value in pool asset |

### Key Design Decisions
- **One position per user** — simplifies accounting
- **Health ratio = (collateral * price * factor) / borrowed * 10000** — liquidation when below MinHealthBps
- **Interest accrual is permissionless** — anyone can call to keep positions up to date
- **PnL is simplified** — collateral value vs borrowed, no tracking of actual trade execution
- **Oracle integration** — uses `lastprice(symbol)` cross-contract call
- **Opening requires 150% of min health** — safety buffer at position open
- **Withdrawal checks 120% of min health** — prevents collateral drain near liquidation

---

## Cross-Contract Dependencies

```
ZK Auth ◄──── Agent Vault (is_session_valid, get_agent_pubkey)
ZK Auth ◄──── Leverage Pool (is_session_valid, get_agent_pubkey)
Oracle  ◄──── Leverage Pool (lastprice)
```

## Token Standards
All three contracts use **Stellar Asset Contracts (SAC)** via `soroban_sdk::token`.
