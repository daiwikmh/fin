# LeveragePool Contract

LeveragePool manages synthetic leveraged positions and the LP liquidity pool. It stores position data on-chain and computes PnL at close.

## Contract ID (testnet)

```
CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL
```

## Functions

### `open_synthetic_position(user, asset_symbol, xlm_amount, entry_price, is_long, collateral_token, collateral_locked)`

Record a new leveraged position on-chain.

- **Caller:** Admin only (signed by ADMIN_SECRET via agent-bridge)
- **Parameters:**

| Param | Type | Description |
|---|---|---|
| `user` | Address | `G...` Stellar address |
| `asset_symbol` | Symbol | Short string, e.g. `"XLM"` |
| `xlm_amount` | i128 | Position size in base-asset units (7-decimal scaled) |
| `entry_price` | i128 | Entry price in USDC per token (7-decimal scaled) |
| `is_long` | bool | `true` = long, `false` = short |
| `collateral_token` | Address | `C...` collateral token address |
| `collateral_locked` | i128 | Collateral amount (7-decimal scaled) |

- **Effect:** Stores `(xlm_amount, entry_price, is_long)` keyed by `(user, collateral_token)`. Locks `collateral_locked` from the pool.

### `close_position(user: Address, collateral_token: Address, close_price: i128)`

Close an open position and compute PnL on-chain.

- **Caller:** Admin only (signed by ADMIN_SECRET via agent-bridge)
- **PnL computation:**
  - Long: `(close_price - entry_price) × xlm_amount`
  - Short: `(entry_price - close_price) × xlm_amount`
- **Effect:** Removes the position record; returns net PnL as an i128 (positive = profit, negative = loss).

The computed PnL is then forwarded to `AgentVault.settle_pnl` by the bridge.

### `deposit_collateral(user: Address, token: Address, amount: i128)`

Deposit collateral into the pool before opening a position.

- **Caller:** User (Freighter)
- **Effect:** Transfers `amount` of `token` from `user` to the pool; registers `UserMargin` entry.

### `lp_deposit(lp: Address, token: Address, amount: i128)`

Deposit USDC as a liquidity provider.

- **Caller:** LP (Freighter)
- **Effect:** Transfers `amount` to `PoolBalance`; mints LP shares proportional to pool share.

### `lp_withdraw(lp: Address, token: Address, share_amount: i128)`

Withdraw USDC by burning LP shares.

- **Caller:** LP (Freighter)
- **Effect:** Burns `share_amount` from `LPShares(lp)`; transfers underlying USDC back to the LP.

### `get_position(user: Address, collateral_token: Address) → Option<Position>`

Read the stored position for a user. Returns `None` if no open position.

- **Caller:** Anyone (read)

### `add_collateral_token(token: Address)`

Whitelist a token as accepted collateral.

- **Caller:** Admin only

## On-chain PnL computation

The v3 contract stores three fields per position: `entry_price`, `xlm_amount`, `is_long`. At close:

```
pnl = (close_price - entry_price) × xlm_amount    [long]
pnl = (entry_price - close_price) × xlm_amount    [short]
```

All values are i128 with 7 decimal places. The result is returned to the bridge which forwards it to `AgentVault.settle_pnl`.

## LP pool mechanics

| Storage key | Type | Description |
|---|---|---|
| `PoolBalance(token)` | i128 | Total USDC available in the pool |
| `LPShares(lp, token)` | i128 | Each LP's share balance |
| `TotalShares(token)` | i128 | Sum of all LP shares |
| `UserMargin(user, token)` | i128 | Each trader's deposited collateral |

Share price = `PoolBalance / TotalShares`. When the pool profits (liquidations, trading losses), the share price rises; LPs who withdraw later receive more USDC per share.

## Symbol handling

The `asset_symbol` parameter uses Soroban's `Symbol` type — a short string up to 32 characters. In Go:

```go
sym := xdr.ScSymbol("XLM")
xdr.ScVal{Type: xdr.ScValTypeScvSymbol, Sym: &sym}
```

Pass the bare token name: `"XLM"`, `"NVDA"`, `"AAPL"` — not the full pair string `"XLM/USDC"`.
