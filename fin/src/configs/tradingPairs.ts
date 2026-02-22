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

const NVDA_USD: TradingPair = {
  symbol: 'NVDA/USD',
  baseToken: 'NVDA',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const AAPL_USD: TradingPair = {
  symbol: 'AAPL/USD',
  baseToken: 'AAPL',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

export function getTradingPairs(): TradingPair[] {
  void getCurrentNetworkId(); // keep import live
  return [XLM_USDC, NVDA_USD, AAPL_USD];
}

// Backward compat — static export used by legacy consumers
export const tradingPairs: TradingPair[] = [XLM_USDC, NVDA_USD, AAPL_USD];
