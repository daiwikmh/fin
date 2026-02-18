import { getCurrentNetworkId } from './assets';

export interface TradingPair {
  symbol: string;
  baseToken: string;
  quoteToken: string;
  price: number;
  change24h: number;
  volume24h: number;
}

const PAIRS_TESTNET: TradingPair[] = [
  { symbol: 'XLM/USDC', baseToken: 'XLM', quoteToken: 'USDC', price: 0, change24h: 0, volume24h: 0 },
  { symbol: 'SRT/XLM', baseToken: 'SRT', quoteToken: 'XLM', price: 0, change24h: 0, volume24h: 0 },
  { symbol: 'SRT/USDC', baseToken: 'SRT', quoteToken: 'USDC', price: 0, change24h: 0, volume24h: 0 },
];

const PAIRS_MAINNET: TradingPair[] = [
  { symbol: 'XLM/USDC', baseToken: 'XLM', quoteToken: 'USDC', price: 0, change24h: 0, volume24h: 0 },
  { symbol: 'AQUA/XLM', baseToken: 'AQUA', quoteToken: 'XLM', price: 0, change24h: 0, volume24h: 0 },
  { symbol: 'AQUA/USDC', baseToken: 'AQUA', quoteToken: 'USDC', price: 0, change24h: 0, volume24h: 0 },
];

export function getTradingPairs(): TradingPair[] {
  return getCurrentNetworkId() === 'MAINNET' ? PAIRS_MAINNET : PAIRS_TESTNET;
}

// Backward compat — static export defaults to testnet
export const tradingPairs: TradingPair[] = PAIRS_TESTNET;
