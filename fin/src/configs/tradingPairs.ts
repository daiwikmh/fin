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
    symbol: 'ETH/USDT',
    baseToken: 'ETH',
    quoteToken: 'USDT',
    price: 1968.1853,
    change24h: -2.34,
    volume24h: 45632100,
  },
  {
    symbol: 'WETH/USDC',
    baseToken: 'WETH',
    quoteToken: 'USDC',
    price: 1968.18,
    change24h: -2.34,
    volume24h: 32145600,
  },
  {
    symbol: 'ETH/USDC',
    baseToken: 'ETH',
    quoteToken: 'USDC',
    price: 1967.54,
    change24h: -2.41,
    volume24h: 28934500,
  },
  {
    symbol: 'USDT/USDC',
    baseToken: 'USDT',
    quoteToken: 'USDC',
    price: 0.9998,
    change24h: 0.01,
    volume24h: 15234800,
  },
  {
    symbol: 'WBTC/USDC',
    baseToken: 'WBTC',
    quoteToken: 'USDC',
    price: 43256.78,
    change24h: 1.23,
    volume24h: 9876543,
  },
  {
    symbol: 'LINK/USDC',
    baseToken: 'LINK',
    quoteToken: 'USDC',
    price: 14.567,
    change24h: 3.45,
    volume24h: 5432190,
  },
  {
    symbol: 'UNI/USDC',
    baseToken: 'UNI',
    quoteToken: 'USDC',
    price: 8.234,
    change24h: -1.23,
    volume24h: 4321098,
  },
];
