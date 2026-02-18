'use client';

import { useState } from 'react';
import { Loader2, X, ArrowDown } from 'lucide-react';
import { useWallet } from '@/utils/wallet';
import type { OrderBook, OpenOffer, TransactionResult } from '@/types/sdex.types';

interface TradingTerminalProps {
  baseToken: string;
  quoteToken: string;
  orderBook: OrderBook | null;
  openOffers: OpenOffer[];
  isLoadingOrderBook: boolean;
  isSubmitting: boolean;
  lastResult: TransactionResult | null;
  onPlaceOrder: (side: 'buy' | 'sell', amount: string, price: string) => Promise<TransactionResult>;
  onMarketOrder: (side: 'buy' | 'sell', amount: string, slippage: number) => Promise<TransactionResult>;
  onCancelOrder: (offer: OpenOffer) => Promise<TransactionResult>;
  onClearResult: () => void;
}

const SLIPPAGES = ['0.1', '0.5', '1.0'];
const PERCENTAGES = [25, 50, 75, 100];

function TokenPill({ symbol }: { symbol: string }) {
  return (
    <span className="token-pill">
      <span className="token-pill-dot" />
      {symbol}
    </span>
  );
}

interface OrderCardProps {
  side: 'buy' | 'sell';
  baseToken: string;
  quoteToken: string;
  orderType: 'limit' | 'market';
  amount: string;
  price: string;
  receiveAmount: string;
  activePrice: string;
  bestPrice: string;
  percentage: number;
  slippage: string;
  isConnected: boolean;
  isSubmitting: boolean;
  onAmountChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  onPercentageChange: (v: number) => void;
  onSlippageChange: (v: string) => void;
  onSubmit: () => void;
}

function OrderCard({
  side, baseToken, quoteToken, orderType,
  amount, price, receiveAmount, activePrice, bestPrice,
  percentage, slippage,
  isConnected, isSubmitting,
  onAmountChange, onPriceChange, onPercentageChange, onSlippageChange, onSubmit,
}: OrderCardProps) {
  const isBuy = side === 'buy';
  const payToken = isBuy ? quoteToken : baseToken;
  const receiveToken = isBuy ? baseToken : quoteToken;
  const canSubmit = isConnected && !isSubmitting && !!amount && (orderType === 'market' || !!activePrice);

  return (
    <div className={`order-card ${side}`}>
      {/* Header */}
      <div className="order-card-header">
        <span className="order-card-title">{isBuy ? 'Buy' : 'Sell'} {baseToken}</span>
        {bestPrice && (
          <span className="order-card-best">
            Best: <span>{parseFloat(bestPrice).toFixed(6)}</span>
          </span>
        )}
      </div>

      {/* Limit price */}
      {orderType === 'limit' && (
        <div>
          <span className="field-label">Price</span>
          <div className="input-row">
            <input
              type="number"
              placeholder={bestPrice || '0.00'}
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
            />
            <TokenPill symbol={quoteToken} />
          </div>
        </div>
      )}

      {/* You Pay */}
      <div>
        <span className="field-label">You Pay</span>
        <div className="input-row">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
          />
          <TokenPill symbol={payToken} />
        </div>
      </div>

      {/* Percentage */}
      <div className="pct-selector">
        {PERCENTAGES.map((pct) => (
          <button
            key={pct}
            onClick={() => onPercentageChange(pct)}
            className={`pct-btn ${side} ${percentage === pct ? 'active' : ''}`}
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Arrow */}
      <div className="arrow-divider">
        <span className="arrow-divider-icon">
          <ArrowDown size={14} />
        </span>
      </div>

      {/* You Receive */}
      <div>
        <span className="field-label">You Receive</span>
        <div className="input-row">
          <input
            type="text"
            placeholder={activePrice ? '0.00' : '—'}
            value={receiveAmount}
            readOnly
            className={receiveAmount ? (isBuy ? 'receive-value' : 'receive-value-sell') : ''}
          />
          <TokenPill symbol={receiveToken} />
        </div>
        {activePrice && (
          <p className="input-rate">
            Rate: 1 {receiveToken} = {parseFloat(activePrice).toFixed(7)} {payToken}
          </p>
        )}
      </div>

      {/* Slippage */}
      <div className="meta-bar">
        <span className="meta-bar-label">Slippage</span>
        <div className="slippage-group">
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              onClick={() => onSlippageChange(s)}
              className={`slip-btn ${side} ${slippage === s ? 'active' : ''}`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      <div className="fee-row">
        <span>Network fee</span>
        <span>0.00001 XLM</span>
      </div>

      {/* Action button */}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className={isBuy ? 'btn-buy' : 'btn-sell'}
      >
        {!isConnected ? (
          'Connect Wallet'
        ) : isSubmitting ? (
          <span className="btn-submitting">
            <Loader2 size={16} className="animate-spin" />
            Submitting…
          </span>
        ) : (
          `${isBuy ? 'Buy' : 'Sell'} ${baseToken}`
        )}
      </button>
    </div>
  );
}

export default function TradingTerminal({
  baseToken, quoteToken,
  orderBook, openOffers,
  isLoadingOrderBook, isSubmitting, lastResult,
  onPlaceOrder, onMarketOrder, onCancelOrder, onClearResult,
}: TradingTerminalProps) {
  const { isConnected } = useWallet();

  const [buyAmount, setBuyAmount]   = useState('');
  const [buyPrice, setBuyPrice]     = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [sellPrice, setSellPrice]   = useState('');
  const [buyPct, setBuyPct]         = useState(0);
  const [sellPct, setSellPct]       = useState(0);
  const [slippage, setSlippage]     = useState('0.5');
  const [orderType, setOrderType]   = useState<'limit' | 'market'>('limit');

  const bestAsk = orderBook?.asks[0]?.price ?? '';
  const bestBid = orderBook?.bids[0]?.price ?? '';
  const activeBuyPrice  = buyPrice  || bestAsk;
  const activeSellPrice = sellPrice || bestBid;

  const buyReceiveAmount = buyAmount && activeBuyPrice
    ? (parseFloat(buyAmount) / parseFloat(activeBuyPrice)).toFixed(7) : '';
  const sellReceiveAmount = sellAmount && activeSellPrice
    ? (parseFloat(sellAmount) * parseFloat(activeSellPrice)).toFixed(7) : '';

  const handleBuy = async () => {
    if (!buyAmount) return;
    if (orderType === 'market') await onMarketOrder('buy', buyAmount, parseFloat(slippage));
    else if (activeBuyPrice) await onPlaceOrder('buy', buyAmount, activeBuyPrice);
  };

  const handleSell = async () => {
    if (!sellAmount) return;
    if (orderType === 'market') await onMarketOrder('sell', sellAmount, parseFloat(slippage));
    else if (activeSellPrice) await onPlaceOrder('sell', sellAmount, activeSellPrice);
  };

  const depthRatio = (amount: string, topAmount: string) =>
    Math.min(100, (parseFloat(amount) / Math.max(parseFloat(topAmount), 0.0001)) * 100);

  return (
    <div className="tt-wrapper">
      {/* Toast */}
      {lastResult && (
        <div className={`tx-toast ${lastResult.success ? 'success' : 'error'}`}>
          <span>
            {lastResult.success
              ? `Submitted · ${lastResult.txHash?.slice(0, 12)}…`
              : lastResult.errorMessage}
          </span>
          <button className="tx-toast-close" onClick={onClearResult}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Order type tabs */}
      <div className="tt-tabs">
        {(['limit', 'market'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`tt-tab ${orderType === t ? 'active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Buy / Sell cards */}
      <div className="tt-grid">
        <OrderCard
          side="buy"
          baseToken={baseToken} quoteToken={quoteToken}
          orderType={orderType}
          amount={buyAmount} price={buyPrice}
          receiveAmount={buyReceiveAmount} activePrice={activeBuyPrice} bestPrice={bestAsk}
          percentage={buyPct} slippage={slippage}
          isConnected={isConnected} isSubmitting={isSubmitting}
          onAmountChange={setBuyAmount} onPriceChange={setBuyPrice}
          onPercentageChange={setBuyPct} onSlippageChange={setSlippage}
          onSubmit={handleBuy}
        />
        <OrderCard
          side="sell"
          baseToken={baseToken} quoteToken={quoteToken}
          orderType={orderType}
          amount={sellAmount} price={sellPrice}
          receiveAmount={sellReceiveAmount} activePrice={activeSellPrice} bestPrice={bestBid}
          percentage={sellPct} slippage={slippage}
          isConnected={isConnected} isSubmitting={isSubmitting}
          onAmountChange={setSellAmount} onPriceChange={setSellPrice}
          onPercentageChange={setSellPct} onSlippageChange={setSlippage}
          onSubmit={handleSell}
        />
      </div>

      {/* Order Book */}
      {orderBook && (
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
                <div key={i} className="ob-row ask" onClick={() => setBuyPrice(level.price)}>
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
                <div key={i} className="ob-row bid" onClick={() => setSellPrice(level.price)}>
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

      {/* Open Offers */}
      {openOffers.length > 0 && (
        <div className="ob-panel">
          <div className="ob-header">
            <span className="ob-title">Open Offers</span>
            <span className="ob-meta">{openOffers.length} active</span>
          </div>
          <div className="ob-body">
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
          </div>
        </div>
      )}
    </div>
  );
}
