/**
 * Direct Soroban contract calls for user-signed operations.
 *
 * Uses stellar-sdk (v13) which is already installed.
 * All monetary amounts use 7 decimal places (ScaleFactor = 10_000_000).
 *
 * Flow for write operations:
 *   buildTxXdr(user, contract, method, args)   → unsigned assembled tx XDR
 *   wallet.signTransaction(xdr, passphrase)     → signed XDR
 *   submitAndWait(signedXdr)                    → polls until confirmed
 *
 * Flow for read operations:
 *   simulateRead(user, contract, method, args)  → ScVal result
 */
import {
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  SorobanRpc,
  Networks,
  xdr,
} from 'stellar-sdk';

// ── Contract addresses ────────────────────────────────────────────────────────

export const VAULT_CONTRACT   = 'CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG';
export const LEVERAGE_CONTRACT = 'CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L';
export const USDC_CONTRACT    = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const XLM_CONTRACT     = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

export const NETWORK_PASSPHRASE = Networks.TESTNET; // "Test SDF Network ; September 2015"
const RPC_URL       = 'https://soroban-testnet.stellar.org';
const SCALE         = 10_000_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRPC() {
  return new SorobanRpc.Server(RPC_URL);
}

function addrScVal(addr: string): xdr.ScVal {
  return nativeToScVal(addr, { type: 'address' });
}

/** Convert a human-scale float to a 7-decimal i128 ScVal (positive only). */
function amountScVal(human: number): xdr.ScVal {
  return nativeToScVal(BigInt(Math.round(human * SCALE)), { type: 'i128' });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Core: build unsigned assembled tx XDR ────────────────────────────────────

/**
 * Build, simulate, and assemble a Soroban contract call.
 * Returns the base64 XDR of the assembled (ready-to-sign) transaction.
 */
async function buildTxXdr(
  userAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<string> {
  const server   = getRPC();
  const contract = new Contract(contractId);
  const account  = await server.getAccount(userAddress);

  const op = contract.call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if ('error' in simResult) {
    throw new Error(`Simulation failed: ${(simResult as any).error}`);
  }
  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
    throw new Error(`Simulation did not succeed`);
  }

  // assembleTransaction patches in resource fees + footprint
  const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
  return assembled.toXDR();
}

// ── Core: simulate read-only and extract retval ───────────────────────────────

async function simulateRead(
  userAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<xdr.ScVal | null> {
  const server   = getRPC();
  const contract = new Contract(contractId);
  const account  = await server.getAccount(userAddress);

  const op = contract.call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if ('error' in simResult) return null;
  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) return null;

  return (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse)
    .result?.retval ?? null;
}

// ── Submit + poll ─────────────────────────────────────────────────────────────

/**
 * Submit a signed transaction XDR and poll until confirmed.
 * Throws on FAILED or 90 s timeout.
 */
export async function submitAndWait(signedXdr: string): Promise<void> {
  const server = getRPC();
  const tx     = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  const sendResult = await server.sendTransaction(tx as any);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Submit failed: ${JSON.stringify((sendResult as any).errorResult ?? sendResult)}`);
  }

  const { hash } = sendResult;
  const deadline  = Date.now() + 90_000;

  while (Date.now() < deadline) {
    await sleep(3_000);
    const res = await server.getTransaction(hash);
    if (res.status === 'SUCCESS') return;
    if (res.status === 'FAILED')  throw new Error(`Transaction failed: ${hash}`);
    // NOT_FOUND → still pending
  }
  throw new Error(`Transaction confirmation timeout: ${hash}`);
}

// ── AgentVault: user-signed operations ───────────────────────────────────────

/** Deposit `amount` of `token` into the AgentVault on behalf of `user`. */
export async function vaultDeposit(
  user: string, token: string, amount: number,
): Promise<string> {
  return buildTxXdr(user, VAULT_CONTRACT, 'deposit', [
    addrScVal(user), addrScVal(token), amountScVal(amount),
  ]);
}

/** Withdraw `amount` of `token` from the AgentVault. */
export async function vaultWithdraw(
  user: string, token: string, amount: number,
): Promise<string> {
  return buildTxXdr(user, VAULT_CONTRACT, 'withdraw', [
    addrScVal(user), addrScVal(token), amountScVal(amount),
  ]);
}

/** Read the vault balance (human units). */
export async function getVaultBalance(user: string, token: string): Promise<number> {
  const val = await simulateRead(user, VAULT_CONTRACT, 'get_balance', [
    addrScVal(user), addrScVal(token),
  ]);
  if (!val) return 0;
  const raw = scValToNative(val) as bigint | number;
  return Number(raw) / SCALE;
}

// ── LeveragePool: user-signed collateral operations ───────────────────────────

/** Deposit `amount` of `token` into the LeveragePool as free collateral. */
export async function depositCollateral(
  user: string, token: string, amount: number,
): Promise<string> {
  return buildTxXdr(user, LEVERAGE_CONTRACT, 'deposit_collateral', [
    addrScVal(user), addrScVal(token), amountScVal(amount),
  ]);
}

/** Withdraw `amount` of `token` from free collateral. */
export async function withdrawCollateral(
  user: string, token: string, amount: number,
): Promise<string> {
  return buildTxXdr(user, LEVERAGE_CONTRACT, 'withdraw_collateral', [
    addrScVal(user), addrScVal(token), amountScVal(amount),
  ]);
}

/** Read free collateral balance (human units). */
export async function getCollateralBalance(user: string, token: string): Promise<number> {
  const val = await simulateRead(user, LEVERAGE_CONTRACT, 'get_collateral_balance', [
    addrScVal(user), addrScVal(token),
  ]);
  if (!val) return 0;
  const raw = scValToNative(val) as bigint | number;
  return Number(raw) / SCALE;
}

export interface Position {
  asset_symbol: string;
  debt_amount: number;       // human units (already scaled)
  collateral_locked: number; // human units
  user: string;
}

/** Read the open synthetic position for `user`, or null if none. */
export async function getPosition(user: string): Promise<Position | null> {
  const val = await simulateRead(user, LEVERAGE_CONTRACT, 'get_position', [
    addrScVal(user),
  ]);
  if (!val) return null;

  const native = scValToNative(val) as any;
  if (!native || typeof native !== 'object') return null;

  return {
    asset_symbol:      native.asset_symbol ?? '',
    debt_amount:       Number(native.debt_amount ?? 0n) / SCALE,
    collateral_locked: Number(native.collateral_locked ?? 0n) / SCALE,
    user:              native.user ?? user,
  };
}
