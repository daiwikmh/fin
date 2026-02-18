'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@/utils/wallet';
import { getAssetPair, setCurrentNetwork } from '@/configs/assets';
import type { OrderBook, OpenOffer, Trade, TransactionResult, StellarAsset } from '@/types/sdex.types';
import { getOrderBook } from '@/actions/orderbook';
import { getOpenOffers, getTradeHistory } from '@/actions/account';
import { placeLimitOrder, placeMarketOrder, cancelOffer } from '@/actions/trade';

interface UseSdexReturn {
  orderBook: OrderBook | null;
  openOffers: OpenOffer[];
  tradeHistory: Trade[];
  isLoadingOrderBook: boolean;
  isSubmitting: boolean;
  lastResult: TransactionResult | null;
  error: string | null;
  selectPair: (symbol: string) => void;
  selectedPair: string;
  baseAsset: StellarAsset | null;
  quoteAsset: StellarAsset | null;
  placeOrder: (side: 'buy' | 'sell', amount: string, price: string) => Promise<TransactionResult>;
  submitMarketOrder: (side: 'buy' | 'sell', amount: string, slippage: number) => Promise<TransactionResult>;
  cancelOrder: (offer: OpenOffer) => Promise<TransactionResult>;
  refreshOrderBook: () => Promise<void>;
  refreshOffers: () => Promise<void>;
  clearResult: () => void;
}

export function useSdex(): UseSdexReturn {
  const { address, isConnected, network, signTransaction } = useWallet();

  const [selectedPair, setSelectedPair] = useState('XLM/USDC');
  const [baseAsset, setBaseAsset] = useState<StellarAsset | null>(null);
  const [quoteAsset, setQuoteAsset] = useState<StellarAsset | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [openOffers, setOpenOffers] = useState<OpenOffer[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [isLoadingOrderBook, setIsLoadingOrderBook] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCurrentNetwork(network);
  }, [network]);

  useEffect(() => {
    const pair = getAssetPair(selectedPair);
    if (pair) {
      setBaseAsset(pair[0]);
      setQuoteAsset(pair[1]);
    } else {
      setBaseAsset(null);
      setQuoteAsset(null);
    }
  }, [selectedPair, network]);

  const refreshOrderBook = useCallback(async () => {
    const pair = getAssetPair(selectedPair);
    if (!pair) return;
    setIsLoadingOrderBook(true);
    try {
      const ob = await getOrderBook(pair[0], pair[1]);
      setOrderBook(ob);
      setError(null);
    } catch (e) {
      console.error('Failed to load order book:', e);
      setError('Failed to load order book');
    } finally {
      setIsLoadingOrderBook(false);
    }
  }, [selectedPair]);

  useEffect(() => {
    refreshOrderBook();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(refreshOrderBook, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshOrderBook]);

  const refreshOffers = useCallback(async () => {
    if (!address) return;
    try {
      const [offers, trades] = await Promise.all([
        getOpenOffers(address),
        getTradeHistory(address),
      ]);
      setOpenOffers(offers);
      setTradeHistory(trades);
    } catch (e) {
      console.error('Failed to load offers/trades:', e);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      refreshOffers();
    } else {
      setOpenOffers([]);
      setTradeHistory([]);
    }
  }, [isConnected, address, refreshOffers]);

  const selectPair = useCallback((symbol: string) => {
    setSelectedPair(symbol);
    setOrderBook(null);
    setLastResult(null);
    setError(null);
  }, []);

  const placeOrder = useCallback(
    async (side: 'buy' | 'sell', amount: string, price: string): Promise<TransactionResult> => {
      if (!address || !baseAsset || !quoteAsset) {
        const r: TransactionResult = { success: false, errorMessage: 'Wallet not connected or pair not selected' };
        setLastResult(r);
        return r;
      }
      setIsSubmitting(true);
      setLastResult(null);
      setError(null);
      try {
        const result = await placeLimitOrder({
          accountId: address,
          side,
          baseAsset,
          quoteAsset,
          amount,
          price,
          signFn: signTransaction,
        });
        setLastResult(result);
        if (result.success) { refreshOrderBook(); refreshOffers(); }
        return result;
      } catch (e) {
        const r: TransactionResult = { success: false, errorMessage: String(e) };
        setLastResult(r);
        return r;
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, baseAsset, quoteAsset, signTransaction, refreshOrderBook, refreshOffers],
  );

  const submitMarketOrder = useCallback(
    async (side: 'buy' | 'sell', amount: string, slippage: number): Promise<TransactionResult> => {
      if (!address || !baseAsset || !quoteAsset) {
        const r: TransactionResult = { success: false, errorMessage: 'Wallet not connected or pair not selected' };
        setLastResult(r);
        return r;
      }
      setIsSubmitting(true);
      setLastResult(null);
      setError(null);
      try {
        const result = await placeMarketOrder({
          accountId: address,
          side,
          baseAsset,
          quoteAsset,
          amount,
          slippagePercent: slippage,
          signFn: signTransaction,
        });
        setLastResult(result);
        if (result.success) { refreshOrderBook(); refreshOffers(); }
        return result;
      } catch (e) {
        const r: TransactionResult = { success: false, errorMessage: String(e) };
        setLastResult(r);
        return r;
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, baseAsset, quoteAsset, signTransaction, refreshOrderBook, refreshOffers],
  );

  const cancelOrder = useCallback(
    async (offer: OpenOffer): Promise<TransactionResult> => {
      if (!address) {
        const r: TransactionResult = { success: false, errorMessage: 'Wallet not connected' };
        setLastResult(r);
        return r;
      }
      setIsSubmitting(true);
      setLastResult(null);
      try {
        const result = await cancelOffer({ accountId: address, offer, signFn: signTransaction });
        setLastResult(result);
        if (result.success) { refreshOffers(); refreshOrderBook(); }
        return result;
      } catch (e) {
        const r: TransactionResult = { success: false, errorMessage: String(e) };
        setLastResult(r);
        return r;
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, signTransaction, refreshOffers, refreshOrderBook],
  );

  const clearResult = useCallback(() => {
    setLastResult(null);
    setError(null);
  }, []);

  return {
    orderBook, openOffers, tradeHistory,
    isLoadingOrderBook, isSubmitting, lastResult, error,
    selectPair, selectedPair, baseAsset, quoteAsset,
    placeOrder, submitMarketOrder, cancelOrder,
    refreshOrderBook, refreshOffers, clearResult,
  };
}
