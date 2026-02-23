/**
 * Soroban contract helpers for user-signed operations.
 *
 * Uses VaultClient / LeverageClient (generated bindings) for simulation +
 * transaction assembly, then submits signed XDR via raw JSON-RPC fetch.
 *
 * WHY raw fetch for submission:
 *   stellar-sdk v13 ships stellar-base v13.1.0 internally, but the Stellar
 *   testnet runs protocol 22 which adds XDR types unknown to v13. After Freighter
 *   returns the signed envelope, stellar-base v13's fromXDR fails with
 *   "Bad union switch: 4". Submitting via fetch avoids that parse step entirely.
 */
import { Networks, xdr } from 'stellar-sdk';
import type { ClientOptions } from 'stellar-sdk/contract';
import { VaultClient, VAULT_CONTRACT_ID } from './vault_client';
import { LeverageClient, LEVERAGE_CONTRACT_ID } from './leverage_client';

export { VAULT_CONTRACT_ID, LEVERAGE_CONTRACT_ID };
export const USDC_CONTRACT      = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const XLM_CONTRACT       = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
export const NETWORK_PASSPHRASE = Networks.TESTNET;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const SCALE   = BigInt(10_000_000);

// ── Scale helpers ─────────────────────────────────────────────────────────────

function toI128(human: number): bigint {
  return BigInt(Math.round(human * Number(SCALE)));
}

function fromI128(raw: bigint | number | undefined): number {
  if (raw === undefined) return 0;
  return Number(raw) / Number(SCALE);
}

// ── Raw JSON-RPC submit (bypasses stellar-base fromXDR) ───────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function jsonRpc(method: string, params: object) {
  const res = await fetch(RPC_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

/**
 * Submit a signed transaction XDR and poll until confirmed.
 * Uses raw JSON-RPC so stellar-base never attempts to re-parse the signed XDR.
 */
async function submitAndWait(signedXdr: string): Promise<void> {
  const sendJson = await jsonRpc('sendTransaction', { transaction: signedXdr });
  const hash     = sendJson?.result?.hash;

  if (!hash) {
    throw new Error(`sendTransaction failed: ${JSON.stringify(sendJson?.result ?? sendJson)}`);
  }
  if (sendJson?.result?.status === 'ERROR') {
    throw new Error(`sendTransaction error: ${JSON.stringify(sendJson.result.errorResultXdr ?? sendJson.result)}`);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(3_000);
    const pollJson = await jsonRpc('getTransaction', { hash });
    const status   = pollJson?.result?.status;
    if (status === 'SUCCESS') return;
    if (status === 'FAILED')  throw new Error(`Transaction FAILED on-chain: ${hash}`);
    // NOT_FOUND → still pending
  }
  throw new Error(`Transaction confirmation timeout: ${hash}`);
}

// ── WalletSignFn adapter ──────────────────────────────────────────────────────
//
// ContractClient.signTransaction expects: (xdr, opts?) => { signedTxXdr }
// useWallet().signTransaction is:         (xdr, passphrase) => string
//
// We build the assembled tx XDR ourselves, hand it to the wallet, then submit
// via raw fetch — never passing the signed XDR back to stellar-base.

export type WalletSignFn = (xdr: string, passphrase: string) => Promise<string>;

// ── Client factories ──────────────────────────────────────────────────────────

function vaultClient(user: string): VaultClient {
  return new VaultClient({
    contractId:        VAULT_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl:            RPC_URL,
    publicKey:         user,
  });
}

function leverageClient(user: string): LeverageClient {
  return new LeverageClient({
    contractId:        LEVERAGE_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl:            RPC_URL,
    publicKey:         user,
  });
}

// ── Write operations (simulate → toXDR → wallet sign → raw submit) ────────────

async function signAndSubmit(
  // The assembled-transaction XDR (from tx.toXDR() or tx.built!.toXDR())
  txXdr:    string,
  walletSign: WalletSignFn,
): Promise<void> {
  const signedXdr = await walletSign(txXdr, NETWORK_PASSPHRASE);
  await submitAndWait(signedXdr);
}

/** Deposit `amount` USDC into the AgentVault. */
export async function vaultDeposit(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const tx = await vaultClient(user).deposit({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign);
}

/** Withdraw `amount` USDC from the AgentVault. */
export async function vaultWithdraw(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const tx = await vaultClient(user).withdraw({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign);
}

/** Deposit `amount` USDC as free collateral into the LeveragePool. */
export async function depositCollateral(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const tx = await leverageClient(user).deposit_collateral({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign);
}

/** Withdraw `amount` USDC from free collateral. */
export async function withdrawCollateral(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const tx = await leverageClient(user).withdraw_collateral({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign);
}

/** LP deposits `amount` USDC into the shared LeveragePool. */
export async function lpDeposit(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const tx = await leverageClient(user).lp_deposit({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign);
}

/** LP withdraws `amount` USDC from the shared LeveragePool. */
export async function lpWithdraw(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const tx = await leverageClient(user).lp_withdraw({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign);
}

/**
 * Open a synthetic leveraged position directly from the user's wallet.
 *
 * WHY we strip auth entries instead of calling tx.toXDR() directly:
 *
 * assembleTransaction attaches simulation auth entries via parsers.js:111:
 *   SorobanAuthorizationEntry.fromXDR(entry, 'base64')
 *
 * open_synthetic_position is the only function with a bool arg (is_long).
 * stellar-base v13 misaligns scvBool (discriminant=0) when re-encoding a
 * SorobanAuthorizationEntry parsed from Protocol 22 simulation XDR
 * → corrupt auth bytes → txMALFORMED.
 *
 * Fix: assemble normally (ContractSpec builds correct function-call ScVals),
 * parse the assembled XDR into an XDR envelope object (v13→v13 round-trip
 * for the function args is lossless since ContractSpec wrote them), then
 * clear the corrupt auth entries from the InvokeHostFunctionOp before
 * signing.  In Soroban Protocol 22, user.require_auth() where user equals
 * the transaction source account is satisfied by the source-account signature
 * alone — no explicit SorobanAuthorizationEntry is required.
 */
export async function openPosition(
  user: string,
  assetSymbol: string,
  xlmAmount: number,
  entryPrice: number,
  isLong: boolean,
  collateralToken: string,
  collateralLocked: number,
  walletSign: WalletSignFn,
): Promise<void> {
  const tx = await leverageClient(user).open_synthetic_position({
    user,
    asset_symbol:      assetSymbol,
    xlm_amount:        toI128(xlmAmount),
    entry_price:       toI128(entryPrice),
    is_long:           isLong,
    collateral_token:  collateralToken,
    collateral_locked: toI128(collateralLocked),
  });

  // Parse the assembled envelope.  Function-call args (including scvBool) were
  // written by stellar-base v13 ContractSpec and survive the v13→v13 round-trip.
  // Auth entries were parsed from Protocol 22 simulation XDR via fromXDR and are
  // corrupt on re-encode (scvBool misalignment).  Clear them before signing.
  const envelope = xdr.TransactionEnvelope.fromXDR(tx.toXDR(), 'base64');
  (envelope as any)
    .v1().tx().operations()[0]
    .body().invokeHostFunctionOp()
    .auth([]);

  await signAndSubmit(envelope.toXDR('base64'), walletSign);
}

/**
 * Close the caller's open position. Pass the current mark price; the contract
 * computes PnL on-chain from stored entry_price, xlm_amount, and is_long.
 */
export async function closePosition(
  user: string,
  collateralToken: string,
  closePrice: number,
  walletSign: WalletSignFn,
): Promise<void> {
  const tx = await leverageClient(user).close_position({
    user,
    collateral_token: collateralToken,
    close_price:      toI128(closePrice),
  });
  await signAndSubmit(tx.toXDR(), walletSign);
}

// ── Read operations (simulation only, no signing needed) ──────────────────────

// Dummy read-only publicKey — any valid G address works for simulation
const READ_ONLY_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Read the total terminal pool backing payout reserves (in human USDC units). */
export async function getTerminalPool(tokenAddr: string): Promise<number> {
  const tx = await new VaultClient({
    contractId:        VAULT_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl:            RPC_URL,
    publicKey:         READ_ONLY_KEY,
  }).get_terminal_pool({ token: tokenAddr });
  return fromI128(tx.result as bigint);
}

/** Read vault balance in human USDC units. */
export async function getVaultBalance(user: string, token: string): Promise<number> {
  const tx = await vaultClient(user).get_balance({ user, token });
  return fromI128(tx.result as bigint);
}

/** Read free collateral balance in human USDC units. */
export async function getCollateralBalance(user: string, token: string): Promise<number> {
  const tx = await leverageClient(user).get_collateral_balance({ user, token });
  return fromI128(tx.result as bigint);
}

/** Read total LP pool balance for a token in human USDC units. */
export async function getPoolBalance(token: string): Promise<number> {
  const tx = await new LeverageClient({
    contractId:        LEVERAGE_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl:            RPC_URL,
    publicKey:         READ_ONLY_KEY,
  }).get_pool_balance({ token });
  return fromI128(tx.result as bigint);
}

/** Read LP share for a user in human USDC units. */
export async function getLPShare(user: string, token: string): Promise<number> {
  const tx = await leverageClient(user).get_lp_share({ user, token });
  return fromI128(tx.result as bigint);
}

export interface PositionHuman {
  asset_symbol:      string;
  debt_amount:       number;
  collateral_locked: number;
  entry_price:       number;
  xlm_amount:        number;
  is_long:           boolean;
  user:              string;
}

/** Read open position, or null if none. */
export async function getPosition(user: string): Promise<PositionHuman | null> {
  const tx  = await leverageClient(user).get_position({ user });
  const pos = tx.result as any;
  if (!pos) return null;
  return {
    asset_symbol:      pos.asset_symbol ?? '',
    debt_amount:       fromI128(pos.debt_amount),
    collateral_locked: fromI128(pos.collateral_locked),
    entry_price:       fromI128(pos.entry_price),
    xlm_amount:        fromI128(pos.xlm_amount),
    is_long:           pos.is_long ?? true,
    user:              pos.user ?? user,
  };
}
