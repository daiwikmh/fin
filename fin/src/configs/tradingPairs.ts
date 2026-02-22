import { getCurrentNetworkId } from './assets';

export interface TradingPair {
  symbol: string;
  baseToken: string;
  quoteToken: string;
  price: number;
  change24h: number;
  volume24h: number;
  baseLogo: string;   // path relative to /public
  quoteLogo: string;
}

const XLM_USDC: TradingPair = {
  symbol: 'XLM/USDC',
  baseToken: 'XLM',
  quoteToken: 'USDC',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/slogo.svg',
  quoteLogo: '/usdc.png',
};

export function getTradingPairs(): TradingPair[] {
  // Only XLM/USDC is listed on both networks.
  // The RWA matching engine operates exclusively on this pair.
  void getCurrentNetworkId(); // keep import live; extend when more pairs are added
  return [XLM_USDC];
}

// Backward compat — static export used by legacy consumers
export const tradingPairs: TradingPair[] = [XLM_USDC];
