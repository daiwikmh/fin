/**
 * Trade execution actions — callable from UI or OpenClaw agent.
 *
 * All functions are pure async, no React dependencies.
 * They accept an explicit `signFn` so the caller decides how signing happens
 * (Freighter in the browser, a server key in the agent, etc.).
 *
 * Build-only variants (buildLimitOrderXdr, etc.) return unsigned XDR
 * for callers that handle signing separately (e.g. agent API routes).
 */

import {
  buildLimitOrder,
  buildMarketOrder,
  buildStrictReceiveOrder,
  buildCancelOrder,
  signAndSubmitTransaction,
} from '@/services/sdex.service';
import { ensureTrustline } from '@/actions/account';
import { getAssetPair, getNetwork } from '@/configs/assets';
import type { StellarAsset, OpenOffer, TransactionResult, SignFn, UnsignedTx } from '@/types/sdex.types';

// ── Shared param types ─────────────────────────────────────────────────

export interface BuildLimitOrderParams {
  accountId: string;
  side: 'buy' | 'sell';
  baseAsset: StellarAsset;
  quoteAsset: StellarAsset;
  amount: string;
  price: string;
}

export interface BuildMarketOrderParams {
  accountId: string;
  side: 'buy' | 'sell';
  baseAsset: StellarAsset;
  quoteAsset: StellarAsset;
  amount: string;
  slippagePercent?: number;
  destMin?: string;
}

export interface BuildCancelOfferParams {
  accountId: string;
  offer: OpenOffer;
}

export interface PlaceLimitOrderParams extends BuildLimitOrderParams {
  signFn: SignFn;
  skipTrustlineCheck?: boolean;
}

export interface PlaceMarketOrderParams extends BuildMarketOrderParams {
  signFn: SignFn;
  skipTrustlineCheck?: boolean;
}

export interface CancelOfferParams extends BuildCancelOfferParams {
  signFn: SignFn;
}

// ── Build-only helpers (used by both UI and agent API) ─────────────────

/** Resolve side/price into ManageSellOffer semantics and return unsigned XDR. */
export async function buildLimitOrderXdr(
  params: BuildLimitOrderParams,
): Promise<UnsignedTx> {
  const { accountId, side, baseAsset, quoteAsset, amount, price } = params;

  const selling = side === 'buy' ? quoteAsset : baseAsset;
  const buying  = side === 'buy' ? baseAsset  : quoteAsset;

  const offerAmount = amount;
  const offerPrice  =
    side === 'buy'
      ? (1 / parseFloat(price)).toFixed(7)
      : parseFloat(price).toFixed(7);

  const xdr = await buildLimitOrder(accountId, selling, buying, offerAmount, offerPrice);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

/** Resolve side into PathPaymentStrictSend semantics and return unsigned XDR. */
export async function buildMarketOrderXdr(
  params: BuildMarketOrderParams,
): Promise<UnsignedTx> {
  const { accountId, side, baseAsset, quoteAsset, amount, slippagePercent = 0.5, destMin } = params;

  const selling = side === 'buy' ? quoteAsset : baseAsset;
  const buying  = side === 'buy' ? baseAsset  : quoteAsset;

  const xdr = await buildMarketOrder(accountId, selling, buying, amount, slippagePercent, destMin);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

/** Build a cancel-offer (amount=0) ManageSellOffer and return unsigned XDR. */
export async function buildCancelOfferXdr(
  params: BuildCancelOfferParams,
): Promise<UnsignedTx> {
  const { accountId, offer } = params;
  const xdr = await buildCancelOrder(accountId, offer.offerId, offer.selling, offer.buying);
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

/** Resolve pair symbol to assets and build limit order XDR. */
export async function buildLimitOrderXdrBySymbol(params: {
  accountId: string;
  pairSymbol: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
}): Promise<UnsignedTx> {
  const pair = getAssetPair(params.pairSymbol);
  if (!pair) throw new Error(`Unknown pair: ${params.pairSymbol}`);
  return buildLimitOrderXdr({
    ...params,
    baseAsset: pair[0],
    quoteAsset: pair[1],
  });
}

/** Resolve pair symbol to assets and build market order XDR. */
export async function buildMarketOrderXdrBySymbol(params: {
  accountId: string;
  pairSymbol: string;
  side: 'buy' | 'sell';
  amount: string;
  slippagePercent?: number;
  destMin?: string;
}): Promise<UnsignedTx> {
  const pair = getAssetPair(params.pairSymbol);
  if (!pair) throw new Error(`Unknown pair: ${params.pairSymbol}`);
  return buildMarketOrderXdr({
    ...params,
    baseAsset: pair[0],
    quoteAsset: pair[1],
  });
}

/**
 * Build a strict-receive buy order: receive EXACTLY `destAmount` of base asset,
 * pay at most `sendMax` of quote asset. Use for agent buy-market orders so the
 * user gets the exact amount they asked for instead of a near-zero fill.
 */
export async function buildBuyMarketOrderXdrBySymbol(params: {
  accountId: string;
  pairSymbol: string;
  destAmount: string;
  sendMax: string;
}): Promise<UnsignedTx> {
  const pair = getAssetPair(params.pairSymbol);
  if (!pair) throw new Error(`Unknown pair: ${params.pairSymbol}`);
  const [baseAsset, quoteAsset] = pair;
  const xdr = await buildStrictReceiveOrder(
    params.accountId,
    quoteAsset,   // selling (USDC)
    baseAsset,    // buying  (XLM)
    params.destAmount,
    params.sendMax,
  );
  return { xdr, networkPassphrase: getNetwork().networkPassphrase };
}

// ── Full sign+submit actions (used by UI with Freighter) ───────────────

export async function placeLimitOrder(
  params: PlaceLimitOrderParams,
): Promise<TransactionResult> {
  const { signFn, skipTrustlineCheck, side, baseAsset, quoteAsset, accountId } = params;

  if (!skipTrustlineCheck) {
    const selling = side === 'buy' ? quoteAsset : baseAsset;
    const buying  = side === 'buy' ? baseAsset  : quoteAsset;
    const okSell = await ensureTrustline(accountId, selling, signFn);
    const okBuy  = await ensureTrustline(accountId, buying, signFn);
    if (!okSell || !okBuy) {
      return { success: false, errorMessage: 'Failed to create required trustline' };
    }
  }

  const { xdr } = await buildLimitOrderXdr(params);
  return signAndSubmitTransaction(xdr, signFn);
}

export async function placeMarketOrder(
  params: PlaceMarketOrderParams,
): Promise<TransactionResult> {
  const { signFn, skipTrustlineCheck, side, baseAsset, quoteAsset, accountId } = params;

  if (!skipTrustlineCheck) {
    const selling = side === 'buy' ? quoteAsset : baseAsset;
    const buying  = side === 'buy' ? baseAsset  : quoteAsset;
    const okSell = await ensureTrustline(accountId, selling, signFn);
    const okBuy  = await ensureTrustline(accountId, buying, signFn);
    if (!okSell || !okBuy) {
      return { success: false, errorMessage: 'Failed to create required trustline' };
    }
  }

  const { xdr } = await buildMarketOrderXdr(params);
  return signAndSubmitTransaction(xdr, signFn);
}

export async function cancelOffer(params: CancelOfferParams): Promise<TransactionResult> {
  const { signFn } = params;
  const { xdr } = await buildCancelOfferXdr(params);
  return signAndSubmitTransaction(xdr, signFn);
}

export async function placeLimitOrderBySymbol(params: {
  accountId: string;
  pairSymbol: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
  signFn: SignFn;
}): Promise<TransactionResult> {
  const pair = getAssetPair(params.pairSymbol);
  if (!pair) return { success: false, errorMessage: `Unknown pair: ${params.pairSymbol}` };
  return placeLimitOrder({
    ...params,
    baseAsset: pair[0],
    quoteAsset: pair[1],
  });
}

export async function placeMarketOrderBySymbol(params: {
  accountId: string;
  pairSymbol: string;
  side: 'buy' | 'sell';
  amount: string;
  slippagePercent?: number;
  signFn: SignFn;
}): Promise<TransactionResult> {
  const pair = getAssetPair(params.pairSymbol);
  if (!pair) return { success: false, errorMessage: `Unknown pair: ${params.pairSymbol}` };
  return placeMarketOrder({
    ...params,
    baseAsset: pair[0],
    quoteAsset: pair[1],
  });
}
