/**
 * Trade execution actions — callable from UI or OpenClaw agent.
 *
 * All functions are pure async, no React dependencies.
 * They accept an explicit `signFn` so the caller decides how signing happens
 * (Freighter in the browser, a server key in the agent, etc.).
 */

import {
  buildLimitOrder,
  buildMarketOrder,
  buildCancelOrder,
  signAndSubmitTransaction,
} from '@/services/sdex.service';
import { ensureTrustline, type SignFn } from '@/actions/account';
import { getAssetPair } from '@/configs/assets';
import type { StellarAsset, OpenOffer, TransactionResult } from '@/types/sdex.types';

export interface PlaceLimitOrderParams {
  accountId: string;
  side: 'buy' | 'sell';
  baseAsset: StellarAsset;
  quoteAsset: StellarAsset;
  /** Amount in quote asset to spend (buy) or base asset to sell (sell). */
  amount: string;
  /** Limit price in quote/base. */
  price: string;
  signFn: SignFn;
  /** Skip trustline check — set true if you've already verified trustlines. */
  skipTrustlineCheck?: boolean;
}

export interface PlaceMarketOrderParams {
  accountId: string;
  side: 'buy' | 'sell';
  baseAsset: StellarAsset;
  quoteAsset: StellarAsset;
  /** Amount in quote asset to spend (buy) or base asset to sell (sell). */
  amount: string;
  slippagePercent?: number;
  signFn: SignFn;
  skipTrustlineCheck?: boolean;
}

export interface CancelOfferParams {
  accountId: string;
  offer: OpenOffer;
  signFn: SignFn;
}

/**
 * Place a limit order on the SDEX.
 *
 * Buy: spend `amount` of quoteAsset to receive baseAsset at `price`.
 * Sell: sell `amount` of baseAsset for quoteAsset at `price`.
 */
export async function placeLimitOrder(
  params: PlaceLimitOrderParams,
): Promise<TransactionResult> {
  const { accountId, side, baseAsset, quoteAsset, amount, price, signFn, skipTrustlineCheck } = params;

  // ManageSellOffer semantics:
  //   selling = asset you hand over
  //   buying  = asset you want
  //   amount  = how much of selling you offer
  //   price   = units of buying per unit of selling
  const selling = side === 'buy' ? quoteAsset : baseAsset;
  const buying  = side === 'buy' ? baseAsset  : quoteAsset;

  // For a buy: user inputs how much quote to spend and the price per base.
  //   ManageSellOffer amount = quoteAmount (amount user pays)
  //   ManageSellOffer price  = basePerQuote = 1 / userPrice
  // For a sell: user inputs how much base to sell and the price per base.
  //   ManageSellOffer amount = amount (base)
  //   ManageSellOffer price  = quotePerBase = userPrice
  const offerAmount = amount;
  const offerPrice  =
    side === 'buy'
      ? (1 / parseFloat(price)).toFixed(7)
      : parseFloat(price).toFixed(7);

  if (!skipTrustlineCheck) {
    const okSell = await ensureTrustline(accountId, selling, signFn);
    const okBuy  = await ensureTrustline(accountId, buying, signFn);
    if (!okSell || !okBuy) {
      return { success: false, errorMessage: 'Failed to create required trustline' };
    }
  }

  const xdr = await buildLimitOrder(accountId, selling, buying, offerAmount, offerPrice);
  return signAndSubmitTransaction(xdr, signFn);
}

/**
 * Place a market order using PathPaymentStrictSend.
 *
 * Buy: spend `amount` of quoteAsset, receive as much baseAsset as possible.
 * Sell: sell `amount` of baseAsset, receive as much quoteAsset as possible.
 */
export async function placeMarketOrder(
  params: PlaceMarketOrderParams,
): Promise<TransactionResult> {
  const {
    accountId, side, baseAsset, quoteAsset, amount,
    slippagePercent = 0.5, signFn, skipTrustlineCheck,
  } = params;

  const selling = side === 'buy' ? quoteAsset : baseAsset;
  const buying  = side === 'buy' ? baseAsset  : quoteAsset;

  if (!skipTrustlineCheck) {
    const okSell = await ensureTrustline(accountId, selling, signFn);
    const okBuy  = await ensureTrustline(accountId, buying, signFn);
    if (!okSell || !okBuy) {
      return { success: false, errorMessage: 'Failed to create required trustline' };
    }
  }

  const xdr = await buildMarketOrder(accountId, selling, buying, amount, slippagePercent);
  return signAndSubmitTransaction(xdr, signFn);
}

/** Cancel an existing open offer. */
export async function cancelOffer(params: CancelOfferParams): Promise<TransactionResult> {
  const { accountId, offer, signFn } = params;
  const xdr = await buildCancelOrder(accountId, offer.offerId, offer.selling, offer.buying);
  return signAndSubmitTransaction(xdr, signFn);
}

/**
 * Convenience: place a limit order using a pair symbol string like "XLM/USDC".
 * Resolves the assets from the current network's asset list.
 */
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

/**
 * Convenience: place a market order using a pair symbol string.
 */
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
