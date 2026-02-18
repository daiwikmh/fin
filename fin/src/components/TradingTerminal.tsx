'use client';

import { useState } from 'react';
import { Settings, Loader2, X } from 'lucide-react';
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

export default function TradingTerminal({
  baseToken,
  quoteToken,
  orderBook,
  openOffers,
  isLoadingOrderBook,
  isSubmitting,
  lastResult,
  onPlaceOrder,
  onMarketOrder,
  onCancelOrder,
  onClearResult,
}: TradingTerminalProps) {
  const { isConnected } = useWallet();

  const [buyAmount, setBuyAmount] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPercentage, setBuyPercentage] = useState(0);
  const [sellPercentage, setSellPercentage] = useState(0);
  const [slippage, setSlippage] = useState('0.5');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');

  const percentages = [0, 25, 50, 75, 100];

  const bestAsk = orderBook?.asks[0]?.price ?? '';
  const bestBid = orderBook?.bids[0]?.price ?? '';

  // Auto-calculated receive amounts
  const activeBuyPrice = buyPrice || bestAsk;
  const activeSellPrice = sellPrice || bestBid;

  const buyReceiveAmount =
    buyAmount && activeBuyPrice
      ? (parseFloat(buyAmount) / parseFloat(activeBuyPrice)).toFixed(7)
      : '';

  const sellReceiveAmount =
    sellAmount && activeSellPrice
      ? (parseFloat(sellAmount) * parseFloat(activeSellPrice)).toFixed(7)
      : '';

  const handleBuy = async () => {
    if (!buyAmount) return;
    if (orderType === 'market') {
      await onMarketOrder('buy', buyAmount, parseFloat(slippage));
    } else {
      if (!activeBuyPrice) return;
      await onPlaceOrder('buy', buyAmount, activeBuyPrice);
    }
  };

  const handleSell = async () => {
    if (!sellAmount) return;
    if (orderType === 'market') {
      await onMarketOrder('sell', sellAmount, parseFloat(slippage));
    } else {
      if (!activeSellPrice) return;
      await onPlaceOrder('sell', sellAmount, activeSellPrice);
    }
  };

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Transaction Result Toast */}
      {lastResult && (
        <div
          className={`flex items-center justify-between p-3 rounded-lg text-sm ${
            lastResult.success
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          <span>
            {lastResult.success
              ? `Transaction submitted! Hash: ${lastResult.txHash?.slice(0, 12)}...`
              : `Error: ${lastResult.errorMessage}`}
          </span>
          <button onClick={onClearResult} className="ml-2 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Order Type Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setOrderType('limit')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            orderType === 'limit'
              ? 'bg-[#2d2e33] text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType('market')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            orderType === 'market'
              ? 'bg-[#2d2e33] text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Market
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Buy Section */}
        <div className="trading-terminal">
          <div className="terminal-header">
            <h3 className="terminal-title">Buy {baseToken}</h3>
            <button className="terminal-settings-btn">
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Price (limit only) */}
          {orderType === 'limit' && (
            <div className="terminal-input-group">
              <label className="terminal-label">Price ({quoteToken})</label>
              <div className="terminal-input-box">
                <div className="terminal-input-row">
                  <input
                    type="number"
                    placeholder={bestAsk || '0.00'}
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="terminal-input"
                  />
                  <div className="terminal-token-selector">
                    <span className="terminal-token-name">{quoteToken}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* You Pay */}
          <div className="terminal-input-group">
            <label className="terminal-label">You Pay</label>
            <div className="terminal-input-box">
              <div className="terminal-input-row">
                <input
                  type="number"
                  placeholder="0.00"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className="terminal-input"
                />
                <div className="terminal-token-selector">
                  <span className="terminal-token-name">{quoteToken}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Percentage Selector */}
          <div className="percentage-selector">
            {percentages.map((pct) => (
              <button
                key={pct}
                onClick={() => setBuyPercentage(pct)}
                className={`percentage-btn ${buyPercentage === pct ? 'active' : ''}`}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* You Receive */}
          <div className="terminal-input-group">
            <label className="terminal-label">You Receive</label>
            <div className="terminal-input-box">
              <div className="terminal-input-row">
                <input
                  type="text"
                  placeholder={activeBuyPrice ? '0.00' : 'No price available'}
                  value={buyReceiveAmount}
                  readOnly
                  className="terminal-input"
                />
                <div className="terminal-token-selector">
                  <span className="terminal-token-name">{baseToken}</span>
                </div>
              </div>
              {activeBuyPrice && (
                <div className="terminal-input-footer">
                  <span className="terminal-usd-value">
                    @ {parseFloat(activeBuyPrice).toFixed(7)} {quoteToken}/{baseToken}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Slippage */}
          <div className="trading-info">
            <div className="trading-info-row">
              <span className="trading-info-label">Slippage</span>
              <div className="slippage-options">
                {['0.1', '0.5', '1.0'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`slippage-btn ${slippage === s ? 'active' : ''}`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <div className="trading-info-row">
              <span className="trading-info-label">Fee</span>
              <span className="trading-info-value">0.00001 XLM</span>
            </div>
          </div>

          {/* Buy Button */}
          <button
            className="btn-buy"
            onClick={handleBuy}
            disabled={!isConnected || isSubmitting || !buyAmount}
          >
            {!isConnected
              ? 'Connect Wallet'
              : isSubmitting
              ? 'Submitting...'
              : `Buy ${baseToken}`}
          </button>
        </div>

        {/* Sell Section */}
        <div className="trading-terminal">
          <div className="terminal-header">
            <h3 className="terminal-title">Sell {baseToken}</h3>
            <button className="terminal-settings-btn">
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Price (limit only) */}
          {orderType === 'limit' && (
            <div className="terminal-input-group">
              <label className="terminal-label">Price ({quoteToken})</label>
              <div className="terminal-input-box">
                <div className="terminal-input-row">
                  <input
                    type="number"
                    placeholder={bestBid || '0.00'}
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className="terminal-input"
                  />
                  <div className="terminal-token-selector">
                    <span className="terminal-token-name">{quoteToken}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* You Pay */}
          <div className="terminal-input-group">
            <label className="terminal-label">You Pay</label>
            <div className="terminal-input-box">
              <div className="terminal-input-row">
                <input
                  type="number"
                  placeholder="0.00"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className="terminal-input"
                />
                <div className="terminal-token-selector">
                  <span className="terminal-token-name">{baseToken}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Percentage Selector */}
          <div className="percentage-selector">
            {percentages.map((pct) => (
              <button
                key={pct}
                onClick={() => setSellPercentage(pct)}
                className={`percentage-btn ${sellPercentage === pct ? 'active' : ''}`}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* You Receive */}
          <div className="terminal-input-group">
            <label className="terminal-label">You Receive</label>
            <div className="terminal-input-box">
              <div className="terminal-input-row">
                <input
                  type="text"
                  placeholder={activeSellPrice ? '0.00' : 'No price available'}
                  value={sellReceiveAmount}
                  readOnly
                  className="terminal-input"
                />
                <div className="terminal-token-selector">
                  <span className="terminal-token-name">{quoteToken}</span>
                </div>
              </div>
              {activeSellPrice && (
                <div className="terminal-input-footer">
                  <span className="terminal-usd-value">
                    @ {parseFloat(activeSellPrice).toFixed(7)} {quoteToken}/{baseToken}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Slippage */}
          <div className="trading-info">
            <div className="trading-info-row">
              <span className="trading-info-label">Slippage</span>
              <div className="slippage-options">
                {['0.1', '0.5', '1.0'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`slippage-btn ${slippage === s ? 'active' : ''}`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <div className="trading-info-row">
              <span className="trading-info-label">Fee</span>
              <span className="trading-info-value">0.00001 XLM</span>
            </div>
          </div>

          {/* Sell Button */}
          <button
            className="btn-sell"
            onClick={handleSell}
            disabled={!isConnected || isSubmitting || !sellAmount}
          >
            {!isConnected
              ? 'Connect Wallet'
              : isSubmitting
              ? 'Submitting...'
              : `Sell ${baseToken}`}
          </button>
        </div>
      </div>

      {/* Order Book */}
      {orderBook && (
        <div className="grid grid-cols-2 gap-6">
          {/* Asks (sells) */}
          <div className="rounded-lg border border-[#2d2e33] p-4">
            <h4 className="text-sm font-medium text-gray-400 mb-3">
              Asks (Sell Orders)
              {isLoadingOrderBook && (
                <Loader2 className="w-3 h-3 animate-spin inline ml-2" />
              )}
            </h4>
            <div className="grid grid-cols-2 text-xs text-gray-500 mb-2">
              <span>Price ({quoteToken})</span>
              <span className="text-right">Amount ({baseToken})</span>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {orderBook.asks.length === 0 ? (
                <div className="text-xs text-gray-600 py-2">No asks</div>
              ) : (
                orderBook.asks.slice(0, 10).map((level, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 text-xs py-0.5 hover:bg-red-500/5 cursor-pointer"
                    onClick={() => setBuyPrice(level.price)}
                  >
                    <span className="text-red-400">
                      {parseFloat(level.price).toFixed(7)}
                    </span>
                    <span className="text-right text-gray-300">
                      {parseFloat(level.amount).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bids (buys) */}
          <div className="rounded-lg border border-[#2d2e33] p-4">
            <h4 className="text-sm font-medium text-gray-400 mb-3">
              Bids (Buy Orders)
            </h4>
            <div className="grid grid-cols-2 text-xs text-gray-500 mb-2">
              <span>Price ({quoteToken})</span>
              <span className="text-right">Amount ({baseToken})</span>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {orderBook.bids.length === 0 ? (
                <div className="text-xs text-gray-600 py-2">No bids</div>
              ) : (
                orderBook.bids.slice(0, 10).map((level, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 text-xs py-0.5 hover:bg-green-500/5 cursor-pointer"
                    onClick={() => setSellPrice(level.price)}
                  >
                    <span className="text-green-400">
                      {parseFloat(level.price).toFixed(7)}
                    </span>
                    <span className="text-right text-gray-300">
                      {parseFloat(level.amount).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Open Offers */}
      {openOffers.length > 0 && (
        <div className="rounded-lg border border-[#2d2e33] p-4">
          <h4 className="text-sm font-medium text-gray-400 mb-3">
            Your Open Offers
          </h4>
          <div className="grid grid-cols-5 text-xs text-gray-500 mb-2">
            <span>Selling</span>
            <span>Buying</span>
            <span>Amount</span>
            <span>Price</span>
            <span className="text-right">Action</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {openOffers.map((offer) => (
              <div
                key={offer.offerId}
                className="grid grid-cols-5 text-xs py-1 items-center"
              >
                <span className="text-gray-300">{offer.selling.code}</span>
                <span className="text-gray-300">{offer.buying.code}</span>
                <span className="text-gray-300">
                  {parseFloat(offer.amount).toFixed(4)}
                </span>
                <span className="text-gray-300">
                  {parseFloat(offer.price).toFixed(7)}
                </span>
                <div className="text-right">
                  <button
                    onClick={() => onCancelOrder(offer)}
                    disabled={isSubmitting}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
