export interface StellarAsset {
  code: string;
  issuer: string | null; // null for native XLM
  name: string;
  decimals: number;
  logoUrl?: string;
}

export interface OrderBookLevel {
  price: string;
  amount: string;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface TrustlineStatus {
  exists: boolean;
  isAuthorized: boolean;
  availableLimit: string;
}

export interface OpenOffer {
  offerId: string;
  selling: StellarAsset;
  buying: StellarAsset;
  amount: string;
  price: string;
}

export interface Trade {
  id: string;
  baseSelling: StellarAsset;
  baseBuying: StellarAsset;
  baseAmount: string;
  counterAmount: string;
  price: string;
  timestamp: string;
  type: 'buy' | 'sell';
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  offerId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MarketOrderResult {
  xdr: string;
  quotedDestAmount: string;
}
