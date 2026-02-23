# Requirements

To run Stoxy yourself you need the following.

## Runtime dependencies

| Dependency | Minimum version | Notes |
|---|---|---|
| Go | 1.24 | Installed at `/usr/local/go/bin/go` on Linux |
| Node.js | 18+ | For the Next.js frontend |
| npm | 9+ | Comes with Node 18+ |
| Git | any | To clone the repo |

## Stellar account

You need at least one funded Stellar account:

| Account | Purpose | Minimum balance |
|---|---|---|
| Admin account | Signs Soroban contract calls | 5 XLM (for transaction fees) |
| Test trader account | Testing the UI | 10,000 XLM (from faucet) |

For testnet accounts, use the [Stellar testnet faucet](https://laboratory.stellar.org/#account-creator) to fund them instantly.

## Contracts

You need the AgentVault and LeveragePool contracts deployed. For development, use the testnet contract IDs:

| Contract | Testnet ID |
|---|---|
| AgentVault | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` |
| LeveragePool | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` |

These are set as defaults in the bridge source. You only need to override them if you deploy your own contracts.

## Optional: 1Password CLI

Required only for securely injecting `ADMIN_SECRET` at runtime (recommended for all non-development environments). See [1Password Setup](1password-setup.md).

## Optional: Docker

A `Dockerfile` is provided in the repo root for containerised deployment. Not required for local development.

## Checking your Go installation

```bash
/usr/local/go/bin/go version
# go version go1.24.x linux/amd64
```

If Go is not installed, download it from https://go.dev/dl/

## Checking your Node.js installation

```bash
node --version
# v18.x.x or higher

npm --version
# 9.x.x or higher
```
