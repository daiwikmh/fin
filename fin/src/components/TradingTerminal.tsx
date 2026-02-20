'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { OrderBook, OpenOffer, TransactionResult } from '@/types/sdex.types';

interface TradingTerminalProps {
  baseToken: string;
  quoteToken: string;
  orderBook: OrderBook | null;
  openOffers: OpenOffer[];
  isLoadingOrderBook: boolean;
  isSubmitting: boolean;
  onCancelOrder: (offer: OpenOffer) => Promise<TransactionResult>;
}

type PanelView = 'orderbook' | 'open_orders';

export default function TradingTerminal({
  baseToken, quoteToken,
  orderBook, openOffers,
  isLoadingOrderBook, isSubmitting,
  onCancelOrder,
}: TradingTerminalProps) {
  const [view, setView] = useState<PanelView>('orderbook');

  const depthRatio = (amount: string, topAmount: string) =>
    Math.min(100, (parseFloat(amount) / Math.max(parseFloat(topAmount), 0.0001)) * 100);

  return (
    <div className="tt-wrapper">
      {/* View toggle */}
      <div className="tt-tabs">
        <button
          onClick={() => setView('orderbook')}
          className={`tt-tab ${view === 'orderbook' ? 'active' : ''}`}
        >
          Order Book
        </button>
        <button
          onClick={() => setView('open_orders')}
          className={`tt-tab ${view === 'open_orders' ? 'active' : ''}`}
        >
          Open Orders{openOffers.length > 0 ? ` (${openOffers.length})` : ''}
        </button>
      </div>

      {/* Order Book */}
      {view === 'orderbook' && orderBook && (
        <div className="tt-grid">
          <div className="ob-panel">
            <div className="ob-header">
              <span className="ob-title">Asks</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="ob-meta">{quoteToken} / {baseToken}</span>
                {isLoadingOrderBook && <Loader2 size={11} className="animate-spin" style={{ color: '#333' }} />}
              </div>
            </div>
            <div className="ob-body">
              {orderBook.asks.length === 0 ? (
                <div className="ob-empty">No asks</div>
              ) : orderBook.asks.slice(0, 8).map((level, i) => (
                <div key={i} className="ob-row ask">
                  <div
                    className="ob-depth-bar"
                    style={{ width: `${depthRatio(level.amount, orderBook.asks[0]?.amount)}%` }}
                  />
                  <span className="ob-price ask">{parseFloat(level.price).toFixed(6)}</span>
                  <span className="ob-amount">{parseFloat(level.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ob-panel">
            <div className="ob-header">
              <span className="ob-title">Bids</span>
              <span className="ob-meta">{quoteToken} / {baseToken}</span>
            </div>
            <div className="ob-body">
              {orderBook.bids.length === 0 ? (
                <div className="ob-empty">No bids</div>
              ) : orderBook.bids.slice(0, 8).map((level, i) => (
                <div key={i} className="ob-row bid">
                  <div
                    className="ob-depth-bar"
                    style={{ width: `${depthRatio(level.amount, orderBook.bids[0]?.amount)}%` }}
                  />
                  <span className="ob-price bid">{parseFloat(level.price).toFixed(6)}</span>
                  <span className="ob-amount">{parseFloat(level.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'orderbook' && !orderBook && (
        <div className="ob-panel">
          <div className="ob-body">
            <div className="ob-empty">
              {isLoadingOrderBook ? 'Loading order book…' : 'No order book data'}
            </div>
          </div>
        </div>
      )}

      {/* Open Orders */}
      {view === 'open_orders' && (
        <div className="ob-panel">
          <div className="ob-header">
            <span className="ob-title">Open Orders</span>
            <span className="ob-meta">{openOffers.length} active</span>
          </div>
          <div className="ob-body">
            {openOffers.length === 0 ? (
              <div className="ob-empty">No open orders</div>
            ) : (
              <>
                <div className="offers-col-header">
                  <span>Sell</span><span>Buy</span><span>Amount</span><span>Price</span><span />
                </div>
                {openOffers.map((offer) => (
                  <div key={offer.offerId} className="offers-row">
                    <span>{offer.selling.code}</span>
                    <span>{offer.buying.code}</span>
                    <span className="mono">{parseFloat(offer.amount).toFixed(4)}</span>
                    <span className="mono">{parseFloat(offer.price).toFixed(6)}</span>
                    <button
                      className="btn-cancel"
                      onClick={() => onCancelOrder(offer)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
