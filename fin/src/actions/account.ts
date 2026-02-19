/**
 * Account query actions — callable from UI or OpenClaw agent.
 */

import {
  checkTrustline as _checkTrustline,
  buildCreateTrustlineTransaction,
  signAndSubmitTransaction,
  getUserOpenOffers as _getUserOpenOffers,
  getTradeHistory as _getTradeHistory,
} from '@/services/sdex.service';
import { getNetwork, getAsset } from '@/configs/assets';
import type { StellarAsset, TrustlineStatus, OpenOffer, Trade, SignFn, UnsignedTx } from '@/types/sdex.types';

export type { SignFn };

/** Check whether an account has a trustline for an asset. */
export async function getTrustlineStatus(
  accountId: string,
  asset: StellarAsset,
): Promise<TrustlineStatus> {
  return _checkTrustline(accountId, asset);
}

/**
 * Ensure a trustline exists for `asset` on `accountId`.
 * If it doesn't exist, builds + signs + submits a ChangeTrust transaction.
 * Returns true if ready, false if the trustline creation failed.
 */
export async function ensureTrustline(
  accountId: string,
  asset: StellarAsset,
  signFn: SignFn,
): Promise<boolean> {
  if (asset.issuer === null) return true; // XLM is always trusted
  const status = await _checkTrustline(accountId, asset);
  if (status.exists) return true;

  const xdr = await buildCreateTrustlineTransaction(accountId, asset);
  const result = await signAndSubmitTransaction(xdr, signFn);
  return result.success;
}

/** Build an unsigned trustline XDR for an asset (by code or full asset). */
export async function buildTrustlineXdr(
  accountId: string,
  asset: StellarAsset,
): Promise<UnsignedTx> {
  if (asset.issuer === null) throw new Error('XLM is native — no trustline needed');
  const xdr = await buildCreateTrustlineTransaction(accountId, asset);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

/** Build trustline XDR from asset code string (resolves from current network). */
export async function buildTrustlineXdrByCode(
  accountId: string,
  assetCode: string,
): Promise<UnsignedTx> {
  const asset = getAsset(assetCode);
  if (!asset) throw new Error(`Unknown asset: ${assetCode}`);
  return buildTrustlineXdr(accountId, asset);
}

/** Get all open DEX offers for an account. */
export async function getOpenOffers(accountId: string): Promise<OpenOffer[]> {
  return _getUserOpenOffers(accountId);
}

/** Get recent trade history for an account. */
export async function getTradeHistory(
  accountId: string,
  limit = 20,
): Promise<Trade[]> {
  return _getTradeHistory(accountId, limit);
}
