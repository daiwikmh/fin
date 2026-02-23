# 1Password for Operators

This page is the operator guide for using 1Password CLI to manage secrets for agent-bridge in production. For end-user AI agent setup, see [1Password Setup (AI Agent)](../ai-agent/1password-setup.md).

## Why use `op run`?

agent-bridge needs `ADMIN_SECRET` (a Stellar secret key) to sign on-chain admin transactions. Storing this in a plain `.env` file creates risk:
- Version control leaks
- Process listing leaks (`ps aux` shows env vars on some systems)
- Log leaks if the env is ever printed

`op run` resolves `op://VAULT/ITEM/FIELD` references at process start and injects the real values into the child process environment. The raw secret never touches the filesystem.

## Vault structure for operators

Recommended 1Password vault layout:

```
Vault: StoxyOps
├── AdminKey
│   └── credential = SXXX...  (Stellar admin secret key)
├── SettlementToken
│   └── credential = CDLZFC3...  (USDC contract address, optional)
└── AdditionalSecrets
    └── credential = ...
```

## Create the vault and items

```bash
# Create the vault
op vault create StoxyOps

# Store the admin secret key
op item create \
  --vault StoxyOps \
  --category Password \
  --title AdminKey \
  --field-name credential \
  --value SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Confirm
op item get AdminKey --vault StoxyOps --field credential
```

## `.env` configuration

```env
ADMIN_SECRET=op://StoxyOps/AdminKey/credential
AGENT_VAULT_ID=CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
LEVERAGE_POOL_ID=CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL
SETTLEMENT_TOKEN=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
FRONTEND_URL=http://localhost:3000
PORT=8090
ALLOWED_ORIGIN=*
```

Non-secret values (contract IDs, URLs, port) can be stored as plaintext — they are not sensitive.

## Starting the bridge

### Development (go run)

```bash
cd agent-bridge
op run --env-file=.env -- /usr/local/go/bin/go run .
```

### Production (compiled binary)

```bash
cd agent-bridge
/usr/local/go/bin/go build -tags netgo -ldflags '-s -w' -o app .
op run --env-file=.env -- ./app
```

### Verify the secret resolves

```bash
op run --env-file=.env -- printenv ADMIN_SECRET
# Should print SXXX... (the real key)
```

## Service management

If running as a systemd service, the recommended approach is a wrapper script:

```bash
#!/bin/bash
# /opt/stoxy/start-bridge.sh
cd /opt/stoxy/agent-bridge
op run --env-file=/opt/stoxy/agent-bridge/.env -- ./app
```

```ini
# /etc/systemd/system/stoxy-bridge.service
[Unit]
Description=Stoxy Agent Bridge
After=network.target

[Service]
User=stoxy
ExecStart=/opt/stoxy/start-bridge.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ensure the `stoxy` service user is signed in to 1Password (`op signin` run as that user).

## Rotating secrets

To rotate the admin key:

1. Create a new Stellar keypair (use `stellar keys generate` or `stellar-laboratory`).
2. Update the on-chain contract to whitelist the new admin address.
3. Update the 1Password item: `op item edit AdminKey --vault StoxyOps credential=SNEW...`
4. Restart the bridge — `op run` resolves the new value on next start.

## Team access

Share the vault with team members:
```bash
op vault user grant --user alice@example.com --vault StoxyOps --role manager
```

Each operator uses their own 1Password account and signs in separately. The vault item is shared; the individual login credentials are not.
