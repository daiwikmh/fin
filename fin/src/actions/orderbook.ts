/**
 * Order book actions — callable from UI or OpenClaw agent.
 */

import { getOrderBook as _getOrderBook } from '@/services/sdex.service';
import { getAssetPair } from '@/configs/assets';
import type { OrderBook, StellarAsset } from '@/types/sdex.types';

/** Fetch live SDEX order book for two explicit assets. */
export async function getOrderBook(
  selling: StellarAsset,
  buying: StellarAsset,
): Promise<OrderBook> {
  return _getOrderBook(selling, buying);
}

/** Fetch live SDEX order book from a pair symbol like "XLM/USDC". */
export async function getOrderBookBySymbol(symbol: string): Promise<OrderBook> {
  const pair = getAssetPair(symbol);
  if (!pair) throw new Error(`Unknown pair: ${symbol}`);
  return _getOrderBook(pair[0], pair[1]);
}

/** Return the mid-price for a pair symbol. */
export async function getMidPrice(symbol: string): Promise<number | null> {
  const ob = await getOrderBookBySymbol(symbol);
  const bestBid = parseFloat(ob.bids[0]?.price ?? '0');
  const bestAsk = parseFloat(ob.asks[0]?.price ?? '0');
  if (!bestBid || !bestAsk) return null;
  return (bestBid + bestAsk) / 2;
}
