# Transaction Lifecycle

Every Soroban contract call made by agent-bridge goes through a 12-step process: build → simulate → sign → submit → confirm. This page documents the full lifecycle as implemented in `agent-bridge/internal/soroban/client.go`.

## Overview

```
1.  getSequence()          GET /accounts/{adminAddr}  →  sequence number
2.  Parse contract ID      C... strkey → xdr.ScAddress
3.  Build unsigned tx      InvokeHostFunction op (no auth/ext yet)
4.  Serialise              tx.Base64() → unsigned XDR string
5.  simulateTransaction    RPC → SorobanTransactionData + resource fee + auth entries
6.  Decode soroban data    xdr.SafeUnmarshalBase64(simRes.TransactionData)
7.  Apply auth entries     invokeOp.Auth = authEntries (from simulation)
8.  Apply ext              invokeOp.Ext = {V:1, SorobanData: &sorobanData}
9.  Rebuild transaction    NewTransaction with seq+1, updated invokeOp, BaseFee+1000
10. Sign                   tx.Sign(networkPassphrase, adminKP)
11. sendTransaction        RPC → broadcast → hash + initial status
12. waitConfirmed          poll getTransaction every 3s until SUCCESS/FAILED (90s timeout)
```

## Step-by-step detail

### Step 1 — Fetch sequence number

```go
seq, err := getSequence(ctx, c.HorizonURL, adminKP.Address())
// GET https://horizon-testnet.stellar.org/accounts/{adminAddr}
// Returns: sequence field as int64
```

The sequence number ensures transactions are processed in order. Each transaction uses `seq + 1`.

### Step 2 — Parse contract address

```go
contractAddr, err := contractScAddress(contractID)
// Decodes C... strkey → xdr.ScAddress{Type: ScAddressTypeContract, ContractId: &cid}
```

### Step 3 — Build unsigned transaction for simulation

```go
invokeOp := &txnbuild.InvokeHostFunction{
    HostFunction: xdr.HostFunction{
        Type: HostFunctionTypeInvokeContract,
        InvokeContract: &xdr.InvokeContractArgs{
            ContractAddress: contractAddr,
            FunctionName:    xdr.ScSymbol(function),
            Args:            args,
        },
    },
}
simTx, _ := txnbuild.NewTransaction(txnbuild.TransactionParams{
    SourceAccount:        &simAccount,  // seq value (not seq+1 yet)
    IncrementSequenceNum: true,
    Operations:           []txnbuild.Operation{invokeOp},
    BaseFee:              txnbuild.MinBaseFee,
    Preconditions:        txnbuild.Preconditions{TimeBounds: NewInfiniteTimeout()},
})
```

The simulation transaction has no `Auth` or `Ext` on the operation — the RPC returns those.

### Step 4 — Serialise for simulation

```go
unsignedB64, _ := simTx.Base64()
```

### Step 5 — simulateTransaction

```go
simRes, _ := c.rpc.simulateTransaction(ctx, unsignedB64)
// Returns:
//   simRes.TransactionData  — base64 SorobanTransactionData (footprint + resource budget)
//   simRes.Results[0].Auth  — base64 SorobanAuthorizationEntry slice
//   simRes.MinResourceFee   — stroop amount to add to fee
```

If `simRes.Error != ""`, the simulation failed (e.g. bad contract args, insufficient balance). The error is logged verbatim.

### Step 6 — Decode SorobanTransactionData

```go
var sorobanData xdr.SorobanTransactionData
xdr.SafeUnmarshalBase64(simRes.TransactionData, &sorobanData)
```

This contains the ledger footprint (which contract storage entries will be read/written) and resource limits.

### Step 7 — Apply auth entries

```go
for _, authB64 := range simRes.Results[0].Auth {
    var entry xdr.SorobanAuthorizationEntry
    xdr.SafeUnmarshalBase64(authB64, &entry)
    authEntries = append(authEntries, entry)
}
invokeOp.Auth = authEntries
```

Auth entries specify which account authorises which invocation. For admin-only functions, the admin keypair is the authorizer.

### Step 8 — Apply ext (footprint)

```go
invokeOp.Ext = xdr.TransactionExt{V: 1, SorobanData: &sorobanData}
```

Setting `V=1` and attaching `SorobanData` on the operation (not the transaction envelope) is the correct place for `txnbuild` — it reads `ResourceFee` from here when computing the total fee.

### Step 9 — Rebuild transaction

```go
buildAccount := txnbuild.SimpleAccount{AccountID: adminKP.Address(), Sequence: seq + 1}
tx, _ := txnbuild.NewTransaction(txnbuild.TransactionParams{
    SourceAccount:        &buildAccount,
    IncrementSequenceNum: false,  // already at seq+1
    Operations:           []txnbuild.Operation{invokeOp},
    BaseFee:              txnbuild.MinBaseFee + 1000,  // 1000 stroop buffer
    Preconditions:        txnbuild.Preconditions{TimeBounds: NewInfiniteTimeout()},
})
```

Rebuilding ensures `NewTransaction` constructs the envelope fresh from the updated `invokeOp`.

### Step 10 — Sign

```go
signedTx, _ := tx.Sign(c.NetworkPassphrase, adminKP)
```

`tx.Sign` hashes the transaction envelope and attaches a decorated signature from `adminKP`.

### Step 11 — sendTransaction

```go
sendRes, _ := c.rpc.sendTransaction(ctx, signedB64)
// Returns: { Status, Hash, ErrorResultXDR }
```

Status on submission is usually `"PENDING"` — the network accepted the transaction but it hasn't been included in a ledger yet.

### Step 12 — waitConfirmed (poll)

```go
deadline := time.Now().Add(90 * time.Second)
for time.Now().Before(deadline) {
    time.Sleep(3 * time.Second)
    res, _ := c.rpc.getTransaction(ctx, hash)
    switch res.Status {
    case "SUCCESS": return nil
    case "FAILED":  return fmt.Errorf("tx failed hash=%s", hash)
    // NOT_FOUND = still pending, keep polling
    }
}
return fmt.Errorf("confirmation timeout hash=%s", hash)
```

Polls every 3 seconds for up to 90 seconds. `NOT_FOUND` means the transaction is still pending or being propagated.

## Retry on tx_bad_seq

If `sendTransaction` returns an error containing `tx_bad_seq`, the sequence number is stale (a concurrent transaction used it first). The bridge retries up to 3 times with a 2-second wait between attempts:

```go
for attempt := 0; attempt < 3; attempt++ {
    if attempt > 0 {
        time.Sleep(2 * time.Second)
    }
    lastErr = c.invokeOnce(ctx, adminKP, contractID, function, args)
    if lastErr == nil { return nil }
    if !isBadSeq(lastErr) { return lastErr }
}
return lastErr
```

## Mutex serialisation

All contract invocations hold `c.mu` (a `sync.Mutex`) for the duration of the call. This prevents two concurrent HTTP handlers from fetching the same sequence number and causing a `tx_bad_seq`.

```go
func (c *Client) invoke(...) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    ...
}
```
