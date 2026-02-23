# i128 Scaling

All monetary amounts in the Stoxy smart contracts are stored as Soroban `i128` (128-bit signed integer) values with **7 decimal places** — the same precision used by Stellar's native lumens.

## Scale factor

```go
const ScaleFactor int64 = 10_000_000  // 10^7
```

To convert a human-readable float to the on-chain integer:

```
human value × ScaleFactor = on-chain i128
```

## Conversion table

| Human value | On-chain i128 |
|---|---|
| `0.0000001` USDC | `1` |
| `1.0` USDC | `10_000_000` |
| `100.5` USDC | `1_005_000_000` |
| `-50.0` USDC | `-500_000_000` |
| `-900.0` USDC | `-9_000_000_000` |

## Positive values

For positive amounts, the i128 `Hi` word is `0` and `Lo` holds the scaled integer:

```go
// Go: 1.5 USDC → int64(1.5 × 10_000_000) = 15_000_000
// XDR:
xdr.Int128Parts{
    Hi: 0,
    Lo: xdr.Uint64(15_000_000),
}
```

## Negative values (losses)

Negative PnL uses two's-complement sign extension. The `Hi` word is `-1` (all 64 bits set) and `Lo` holds the raw uint64 bit-pattern of the negative int64:

```go
// Go: -90.0 USDC → int64(-900_000_000)
// XDR:
xdr.Int128Parts{
    Hi: xdr.Int64(-1),
    Lo: xdr.Uint64(uint64(-900_000_000)),
    // uint64(-900_000_000) = 0xFFFFFFFFC9F19E00 (two's complement)
}
```

This matches the standard i128 representation used by Soroban:
- The upper 64 bits hold the sign extension.
- The lower 64 bits hold the magnitude in two's complement.

## Go helper (from `soroban/client.go`)

```go
// i128FromScaled converts a 7-decimal-scaled int64 to xdr.Int128Parts.
func i128FromScaled(scaled int64) xdr.Int128Parts {
    if scaled >= 0 {
        return xdr.Int128Parts{Hi: 0, Lo: xdr.Uint64(uint64(scaled))}
    }
    // Negative: two's-complement sign extension into the upper 64 bits.
    return xdr.Int128Parts{Hi: xdr.Int64(-1), Lo: xdr.Uint64(uint64(scaled))}
}
```

## Quick reference

| Operation | Go code |
|---|---|
| Float → scaled | `int64(val * float64(soroban.ScaleFactor))` |
| Scaled → XDR | `i128ScVal(scaledInt64)` |
| Positive XDR parts | `{Hi: 0, Lo: uint64(scaled)}` |
| Negative XDR parts | `{Hi: -1, Lo: uint64(scaled)}` |

## Why 7 decimal places?

Stellar's native XLM uses 7 decimal places (1 stroop = 0.0000001 XLM). Using the same scale factor makes it straightforward to represent XLM-denominated values without a unit mismatch between the chain and the contracts.

USDC on Stellar also uses 7 decimal places in practice, so `1 USDC = 10_000_000` in both the contract and Stellar's ledger representation.

## Important: callers must scale

The bridge handler multiplies float inputs by `ScaleFactor` before passing to the Soroban client. **Never pass human-readable floats directly** to `soroban.Client.SettleTrade`, `OpenPosition`, or `ClosePosition` — always scale first.

```go
// In admin.go:
pnlScaled := int64(req.PnL * float64(soroban.ScaleFactor))
// Then pass pnlScaled to h.Soroban.SettleTrade(...)
```
