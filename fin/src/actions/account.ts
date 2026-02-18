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
import type { StellarAsset, TrustlineStatus, OpenOffer, Trade } from '@/types/sdex.types';

export type SignFn = (xdr: string, networkPassphrase: string) => Promise<string>;

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
