export interface TradingPair {
  symbol: string;
  baseToken: string;
  quoteToken: string;
  price: number;
  change24h: number;
  volume24h: number;
}

export const tradingPairs: TradingPair[] = [
  {
    symbol: 'XLM/USDC',
    baseToken: 'XLM',
    quoteToken: 'USDC',
    price: 0,
    change24h: 0,
    volume24h: 0,
  },
  {
    symbol: 'SRT/XLM',
    baseToken: 'SRT',
    quoteToken: 'XLM',
    price: 0,
    change24h: 0,
    volume24h: 0,
  },
  {
    symbol: 'SRT/USDC',
    baseToken: 'SRT',
    quoteToken: 'USDC',
    price: 0,
    change24h: 0,
    volume24h: 0,
  },
];
